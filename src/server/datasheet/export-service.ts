import { readFile } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";
import { AppError } from "@/lib/errors";
import { editorJsonSchema, type TiptapJson } from "@/server/datasheet/schema";
import { resolveChromiumExecutablePath } from "@/server/datasheet/chromium";
import {
  buildExportPageModel,
  renderExportDocumentHtml,
  type ExportTemplateSnapshot,
} from "@/server/datasheet/export-renderer";
import { DatasheetDocumentModel } from "@/server/models/datasheet-document";
import { DatasheetExportModel } from "@/server/models/datasheet-export";
import { DatasheetTemplateSettingsModel } from "@/server/models/datasheet-template-settings";
import { ProjectModel } from "@/server/models/project";
import { getExtractedImageArtifactForProject } from "@/server/extraction/service";
import { getPrivateObject, uploadPrivateObject } from "@/server/storage/s3";

type ExportRecord = Record<string, unknown>;

type PdfJsGetDocument = typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument;
type PdfJsDocumentInit = Parameters<PdfJsGetDocument>[0] & {
  disableWorker?: boolean;
  useWorkerFetch?: boolean;
};

export type SerializedDatasheetExport = {
  id: string;
  projectId: string;
  datasheetDocumentId: string;
  type: "PDF";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  filename: string;
  fileSize: number | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
  metadata: {
    productCode: string;
    productTitle: string;
    documentStatus: string;
    revision: string;
    website: string;
    primaryColor: string;
    accentColor: string;
    layoutMode?: string;
    layoutDensity?: string;
  };
  downloadUrl: string | null;
};

export async function createPdfExportForProject(params: {
  projectId: string;
  ownerId: string;
}) {
  const ids = parseOwnerProjectIds(params);
  const project = await ProjectModel.findOne({
    _id: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
  }).lean<Record<string, unknown>>();
  if (!project) {
    throw new AppError("Project not found", 404, {
      code: "PROJECT_NOT_FOUND",
    });
  }

  const preparedSnapshot = await buildPreparedSnapshotForProject(params, ids);
  const pageModel = buildExportPageModel(preparedSnapshot);
  const filename = buildExportFilename(
    preparedSnapshot.template.productCode ||
      preparedSnapshot.document.title ||
      String(project.name ?? "datasheet"),
  );
  const exportRecord = await DatasheetExportModel.create({
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
    datasheetDocumentId: preparedSnapshot.documentId,
    type: "PDF",
    status: "PENDING",
    filename,
    metadata: {
      productCode: preparedSnapshot.template.productCode,
      productTitle: preparedSnapshot.template.productTitle,
      documentStatus: preparedSnapshot.template.documentStatus,
      revision: preparedSnapshot.template.revision,
      website: preparedSnapshot.template.website,
      primaryColor: preparedSnapshot.template.primaryColor,
      accentColor: preparedSnapshot.template.accentColor,
      layoutMode: preparedSnapshot.template.layoutMode,
      layoutDensity: preparedSnapshot.template.layoutDensity,
    },
  });

  try {
    exportRecord.status = "PROCESSING";
    await exportRecord.save();

    const html = renderExportDocumentHtml(pageModel, preparedSnapshot.template, {
      mode: "pdf",
    });
    const pdf = await renderHtmlToPdf(html);
    await verifyPdfPhysicalPageCount(pdf, pageModel.pages.length);
    const storageKey = `users/${params.ownerId}/projects/${params.projectId}/exports/${String(
      exportRecord._id,
    )}/${filename}`;
    await uploadPrivateObject({
      key: storageKey,
      body: pdf,
      contentType: "application/pdf",
      metadata: {
        exportId: String(exportRecord._id),
        projectId: params.projectId,
      },
    });

    exportRecord.status = "COMPLETED";
    exportRecord.storageKey = storageKey;
    exportRecord.fileSize = pdf.length;
    exportRecord.errorMessage = null;
    exportRecord.completedAt = new Date();
    await exportRecord.save();
  } catch (error) {
    exportRecord.status = "FAILED";
    exportRecord.errorMessage = createExportErrorMessage(error);
    exportRecord.completedAt = new Date();
    await exportRecord.save();
  }

  return serializeExport(exportRecord.toObject(), params.projectId);
}

export async function listPdfExportsForProject(params: {
  projectId: string;
  ownerId: string;
}) {
  const ids = parseOwnerProjectIds(params);
  const project = await ProjectModel.exists({
    _id: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
  });
  if (!project) {
    throw new AppError("Project not found", 404, {
      code: "PROJECT_NOT_FOUND",
    });
  }

  const exports = await DatasheetExportModel.find({
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
    type: "PDF",
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean<ExportRecord[]>();
  return exports.map((item) => serializeExport(item, params.projectId));
}

export async function getPdfExportDownloadForProject(params: {
  projectId: string;
  ownerId: string;
  exportId: string;
}) {
  const ids = parseOwnerProjectIds(params);
  if (!Types.ObjectId.isValid(params.exportId)) {
    throw new AppError("Export not found", 404, { code: "EXPORT_NOT_FOUND" });
  }

  const exportRecord = await DatasheetExportModel.findOne({
    _id: new Types.ObjectId(params.exportId),
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
    type: "PDF",
  }).lean<ExportRecord>();
  if (!exportRecord) {
    throw new AppError("Export not found", 404, { code: "EXPORT_NOT_FOUND" });
  }
  if (String(exportRecord.status) !== "COMPLETED" || !exportRecord.storageKey) {
    throw new AppError("Export PDF is not ready for download", 409, {
      code: "EXPORT_NOT_READY",
    });
  }

  const object = await getPrivateObject(String(exportRecord.storageKey));
  return {
    body: object.body,
    contentType: object.contentType ?? "application/pdf",
    contentLength: object.contentLength,
    filename: String(exportRecord.filename || "vellore-semicon-datasheet.pdf"),
  };
}

export async function getPdfExportHtmlPreviewForProject(params: {
  projectId: string;
  ownerId: string;
}) {
  const snapshot = await buildPreparedSnapshotForProject(params);
  const pageModel = buildExportPageModel(snapshot);
  return renderExportDocumentHtml(pageModel, snapshot.template, { mode: "preview" });
}

export function serializeExport(
  exportRecord: ExportRecord,
  projectId: string,
): SerializedDatasheetExport {
  const id = String(exportRecord._id);
  const metadata = isRecord(exportRecord.metadata) ? exportRecord.metadata : {};
  const status = String(exportRecord.status) as SerializedDatasheetExport["status"];
  return {
    id,
    projectId,
    datasheetDocumentId: String(exportRecord.datasheetDocumentId),
    type: "PDF",
    status,
    filename: String(exportRecord.filename ?? ""),
    fileSize: typeof exportRecord.fileSize === "number" ? exportRecord.fileSize : null,
    errorMessage: exportRecord.errorMessage ? String(exportRecord.errorMessage) : null,
    completedAt: exportRecord.completedAt ? new Date(exportRecord.completedAt as Date).toISOString() : null,
    createdAt: new Date(exportRecord.createdAt as Date).toISOString(),
    metadata: {
      productCode: String(metadata.productCode ?? ""),
      productTitle: String(metadata.productTitle ?? ""),
      documentStatus: String(metadata.documentStatus ?? ""),
      revision: String(metadata.revision ?? ""),
      website: String(metadata.website ?? ""),
      primaryColor: String(metadata.primaryColor ?? ""),
      accentColor: String(metadata.accentColor ?? ""),
      layoutMode: String(metadata.layoutMode ?? "two-column"),
      layoutDensity: String(metadata.layoutDensity ?? "technical-dense"),
    },
    downloadUrl:
      status === "COMPLETED"
        ? `/api/projects/${projectId}/datasheet/export/${id}/download`
        : null,
  };
}

async function buildPreparedSnapshotForProject(
  params: { projectId: string; ownerId: string },
  ids = parseOwnerProjectIds(params),
) {
  const document = await DatasheetDocumentModel.findOne({
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
  })
    .sort({ createdAt: -1 })
    .lean<Record<string, unknown>>();
  if (!document) {
    throw new AppError("Create an editable datasheet before exporting PDF", 400, {
      code: "DATASHEET_REQUIRED",
    });
  }

  const template = await DatasheetTemplateSettingsModel.findOne({
    _id: document.templateSettingsId,
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
  }).lean<Record<string, unknown>>();
  if (!template) {
    throw new AppError("Template settings not found", 404, {
      code: "TEMPLATE_NOT_FOUND",
    });
  }

  const snapshot = createSnapshot(document, template);
  return {
    documentId: document._id,
    document: {
      ...snapshot.document,
      editorJson: await inlineEditorImages(snapshot.document.editorJson, params),
    },
    template: {
      ...snapshot.template,
      logoAssetPath: await inlineLogo(snapshot.template.logoAssetPath),
    },
  };
}

async function inlineEditorImages(
  editorJson: TiptapJson,
  params: { projectId: string; ownerId: string },
): Promise<TiptapJson> {
  const clone = structuredClone(editorJson) as TiptapJson;
  await Promise.all((clone.content ?? []).map((node) => inlineNodeImages(node, params)));
  return clone;
}

async function inlineNodeImages(
  node: Record<string, unknown>,
  params: { projectId: string; ownerId: string },
): Promise<void> {
  if (node.type === "image" && isRecord(node.attrs)) {
    const match = String(node.attrs.src ?? "").match(/\/api\/projects\/([^/]+)\/artifacts\/pages\/(\d+)\/images\/([^/?#]+)/);
    if (match?.[1] === params.projectId) {
      const artifact = await getExtractedImageArtifactForProject({
        projectId: params.projectId,
        ownerId: params.ownerId,
        pageNumber: Number(match[2]),
        imageId: decodeURIComponent(match[3]),
      });
      if (artifact) {
        node.attrs.src = await streamToDataUri(artifact.body, artifact.contentType);
      }
    }
  }

  if (Array.isArray(node.content)) {
    await Promise.all(
      (node.content as Array<Record<string, unknown>>).map((child) =>
        inlineNodeImages(child, params),
      ),
    );
  }
}

async function inlineLogo(logoAssetPath: string) {
  if (!logoAssetPath.startsWith("/")) return logoAssetPath;
  const publicPath = path.join(
    process.cwd(),
    "public",
    logoAssetPath.replace(/^\/+/, ""),
  );
  const content = await readFile(publicPath);
  const contentType = logoAssetPath.endsWith(".svg")
    ? "image/svg+xml"
    : "image/png";
  return `data:${contentType};base64,${content.toString("base64")}`;
}

export async function renderHtmlToPdf(html: string) {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: resolveChromiumExecutablePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => undefined);
    await page.emulateMediaType("print");
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        scale: 1,
      }),
    );
  } finally {
    await browser.close();
  }
}

async function verifyPdfPhysicalPageCount(pdf: Buffer, expectedPages: number) {
  const actualPages = await countPdfPages(pdf);
  if (actualPages == null) return;
  if (actualPages !== expectedPages) {
    throw new AppError(
      `PDF physical page count mismatch: expected ${expectedPages}, got ${actualPages}`,
      500,
      { code: "PDF_PAGE_COUNT_MISMATCH" },
    );
  }
}

async function countPdfPages(pdf: Buffer): Promise<number | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const documentInit: PdfJsDocumentInit = {
      data: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength),
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    };
    const loadingTask = pdfjs.getDocument(documentInit);
    const document = await loadingTask.promise;
    try {
      return Number.isFinite(document.numPages) ? document.numPages : null;
    } finally {
      await document.destroy();
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[datasheet-export] PDF page-count verification unavailable", error);
    }
    return null;
  }
}

function createSnapshot(
  document: Record<string, unknown>,
  template: Record<string, unknown>,
) {
  const editorJson = editorJsonSchema.parse(document.editorJson);
  const productTitle = String(
    template.productTitle ?? document.productCategory ?? document.title ?? "",
  );
  return {
    document: {
      title: String(document.title ?? "Editable Datasheet"),
      productCode: String(document.productCode ?? ""),
      productCategory: String(document.productCategory ?? ""),
      editorJson,
    },
    template: {
      logoAssetPath: String(
        template.logoAssetPath ?? "/branding/vellore-semicon-logo.svg",
      ),
      companyName: String(template.companyName ?? "Vellore Semicon"),
      website: String(template.website ?? "www.velloresemicon.com"),
      productCode: String(template.productCode ?? document.productCode ?? ""),
      productTitle,
      documentStatus: String(
        template.documentStatus ?? "Preliminary Datasheet",
      ),
      revision: String(template.revision ?? "Rev. A"),
      layoutMode: template.layoutMode === "single-column" ? "single-column" : "two-column",
      layoutDensity: template.layoutDensity === "comfortable" ? "comfortable" : "technical-dense",
      primaryColor: String(template.primaryColor ?? "#0D2B55"),
      accentColor: String(template.accentColor ?? "#D6533E"),
    } satisfies ExportTemplateSnapshot,
  };
}

function parseOwnerProjectIds(params: { projectId: string; ownerId: string }) {
  if (!Types.ObjectId.isValid(params.projectId)) {
    throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });
  }
  if (!Types.ObjectId.isValid(params.ownerId)) {
    throw new AppError("Authentication required", 401, {
      code: "AUTHENTICATION_REQUIRED",
    });
  }
  return {
    projectObjectId: new Types.ObjectId(params.projectId),
    ownerObjectId: new Types.ObjectId(params.ownerId),
  };
}

function buildExportFilename(value: string) {
  const date = new Date().toISOString().slice(0, 10);
  const safeName =
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "datasheet";
  return `vellore-semicon-${safeName}-${date}.pdf`;
}

function createExportErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 500);
  return "PDF export failed";
}

async function streamToDataUri(
  stream: ReadableStream<Uint8Array>,
  contentType: string,
) {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) chunks.push(result.value);
  }
  return `data:${contentType};base64,${Buffer.concat(chunks).toString("base64")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

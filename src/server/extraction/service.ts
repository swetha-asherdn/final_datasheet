import { Types } from "mongoose";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { extractionManifestSchema, type ExtractionManifest, type ExtractedPageManifest } from "@/server/extraction/schema";
import { ExtractionRunModel } from "@/server/models/extraction-run";
import { ExtractedPageModel } from "@/server/models/extracted-page";
import { ProjectModel } from "@/server/models/project";
import { ProcessingJobModel } from "@/server/models/processing-job";
import { getPrivateObject, type PrivateObject } from "@/server/storage/s3";
import { getExtractPdfQueue } from "@/server/queue/extract-pdf";

const PRIVATE_ARTIFACT_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

export type ExtractionRequestSource = {
  storageKey: string;
  originalFileName: string;
  mimeType: "application/pdf";
};

export type PythonExtractionRequest = {
  projectId: string;
  ownerId: string;
  source: ExtractionRequestSource;
  extractionEngine?: "native" | "google_doc_ai" | "gemini_vision";
};

export type ProjectArtifact = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
  cacheControl: string;
};

export function getOcrLanguages() {
  return env.OCR_LANGUAGES.split(",").map((language) => language.trim()).filter(Boolean);
}

export function canRetryExtractionStatus(status: string) {
  return ["FAILED", "REVIEW_REQUIRED"].includes(status);
}

export function createSafeErrorSummary(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return "Extraction failed";
}

export function buildPagePreviewArtifactUrl(projectId: string, pageNumber: number) {
  return `/api/projects/${projectId}/artifacts/pages/${pageNumber}/preview`;
}

export function buildExtractedImageArtifactUrl(projectId: string, pageNumber: number, imageId: string) {
  return `/api/projects/${projectId}/artifacts/pages/${pageNumber}/images/${encodeURIComponent(imageId)}`;
}

export async function callPythonExtractionService(request: PythonExtractionRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/extract", env.PYTHON_WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(`Python extraction failed with ${response.status}: ${body.slice(0, 300)}`, response.status >= 500 ? 502 : 422, {
        code: response.status >= 500 ? "PYTHON_WORKER_ERROR" : "EXTRACTION_REJECTED"
      });
    }

    const json = await response.json();
    const startedAt = getManifestDatetime(json, "startedAt");
    const completedAt = getManifestDatetime(json, "completedAt");

    console.info("[extraction] Python response received", {
      projectId: request.projectId,
      startedAt,
      completedAt,
      pageCount: typeof json?.pageCount === "number" ? json.pageCount : null
    });

    const result = extractionManifestSchema.safeParse(json);
    if (!result.success) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[extraction] Manifest validation failed", {
          projectId: request.projectId,
          startedAt,
          completedAt,
          issues: result.error.issues
        });
      } else {
        console.error("[extraction] Manifest validation failed", {
          projectId: request.projectId,
          startedAt,
          completedAt,
          issueCount: result.error.issues.length
        });
      }

      throw new AppError("Extraction manifest validation failed", 422, { code: "INVALID_EXTRACTION_MANIFEST" });
    }

    return result.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("Extraction timed out", 504, { code: "EXTRACTION_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type PythonExportRequest = {
  projectId: string;
  ownerId: string;
  docxStorageKey: string;
};

export async function callPythonDocxConversionService(request: PythonExtractionRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/convert-pdf-to-docx", env.PYTHON_WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(`Python DOCX conversion failed with ${response.status}: ${body.slice(0, 300)}`, response.status >= 500 ? 502 : 422, {
        code: response.status >= 500 ? "PYTHON_WORKER_ERROR" : "CONVERSION_REJECTED"
      });
    }

    const json = await response.json();
    if (!json.success) {
      throw new AppError(json.error || "DOCX conversion returned success: false", 422, { code: "CONVERSION_FAILED" });
    }

    return {
      storageKey: json.storageKey as string,
      fileSize: json.fileSize as number
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("DOCX conversion timed out", 504, { code: "CONVERSION_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type PythonRebrandRequest = {
  projectId: string;
  ownerId: string;
  docxStorageKey: string;
  branding: {
    companyName: string;
    logoStorageKey?: string | null;
    productCode?: string;
    productTitle?: string;
    documentStatus?: string;
    revision?: string;
    primaryColor?: string;
    accentColor?: string;
  };
};

export async function callPythonDocxRebrandService(request: PythonRebrandRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/rebrand-docx", env.PYTHON_WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(`Python rebranding failed with ${response.status}: ${body.slice(0, 300)}`, response.status >= 500 ? 502 : 422, {
        code: response.status >= 500 ? "PYTHON_WORKER_ERROR" : "REBRAND_REJECTED"
      });
    }

    const json = await response.json();
    if (!json.success) {
      throw new AppError(json.error || "Rebranding returned success: false", 422, { code: "REBRAND_FAILED" });
    }

    return {
      storageKey: json.storageKey as string,
      fileSize: json.fileSize as number
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("Rebranding timed out", 504, { code: "REBRAND_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type PythonDirectPdfRebrandRequest = {
  projectId: string;
  ownerId: string;
  sourceStorageKey: string;
  mappings: Array<{
    id?: string;
    supplierCode: string;
    velloreCode: string;
    status: "pending" | "confirmed" | "ignored" | "applied";
    confidence?: number;
  }>;
  branding: {
    companyName: string;
    logoStorageKey?: string | null;
    productCode?: string | null;
    productTitle?: string | null;
    documentStatus?: string | null;
    revision?: string | null;
    primaryColor?: string | null;
    accentColor?: string | null;
  };
  headerMaskTopPt?: number;
  footerMaskBottomPt?: number;
  website?: string;
};

export type PythonDirectPdfRebrandResponse = {
  success: boolean;
  pdfStorageKey?: string;
  fileSize?: number;
  pageCount?: number;
  report: {
    attempted: number;
    successful: number;
    keptOriginal: number;
    failed: number;
    warnings: string[];
  };
  error?: string;
};

export async function callPythonDirectPdfRebrandService(request: PythonDirectPdfRebrandRequest): Promise<PythonDirectPdfRebrandResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/rebrand-pdf-direct", env.PYTHON_WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(`Python direct PDF rebrand failed with ${response.status}: ${body.slice(0, 300)}`, response.status >= 500 ? 502 : 422, {
        code: response.status >= 500 ? "PYTHON_WORKER_ERROR" : "REBRAND_REJECTED"
      });
    }

    const json = (await response.json()) as PythonDirectPdfRebrandResponse;
    if (!json.success) {
      throw new AppError(json.error || "Direct PDF rebrand returned success: false", 422, { code: "DIRECT_REBRAND_FAILED" });
    }

    return json;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("Direct PDF rebrand timed out", 504, { code: "REBRAND_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callPythonDocxToPdfService(request: PythonExportRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EXTRACTION_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/convert-docx-to-pdf", env.PYTHON_WORKER_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AppError(`Python PDF export failed with ${response.status}: ${body.slice(0, 300)}`, response.status >= 500 ? 502 : 422, {
        code: response.status >= 500 ? "PYTHON_WORKER_ERROR" : "EXPORT_REJECTED"
      });
    }

    const json = await response.json();
    if (!json.success) {
      throw new AppError(json.error || "PDF export returned success: false", 422, { code: "EXPORT_FAILED" });
    }

    return {
      pdfStorageKey: json.pdfStorageKey as string,
      fileSize: json.fileSize as number
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("PDF export timed out", 504, { code: "EXPORT_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function persistExtractionManifest(params: { projectId: string; ownerId: string; manifest: ExtractionManifest }) {
  if (params.manifest.projectId !== params.projectId) {
    throw new AppError("Extraction manifest project mismatch", 422, { code: "EXTRACTION_PROJECT_MISMATCH" });
  }

  const startedAt = normalizeManifestDatetime(params.manifest.processing.startedAt);
  const completedAt = normalizeManifestDatetime(params.manifest.processing.completedAt);
  const projectObjectId = new Types.ObjectId(params.projectId);
  const ownerObjectId = new Types.ObjectId(params.ownerId);
  const run = await ExtractionRunModel.findOneAndUpdate(
    { projectId: projectObjectId, ownerId: ownerObjectId, status: "PROCESSING" },
    {
      $set: {
        schemaVersion: params.manifest.schemaVersion,
        status: "COMPLETED",
        sourceFile: params.manifest.sourceFile,
        pageCount: params.manifest.pageCount,
        summary: {
          ...params.manifest.summary,
          ocrUsed: params.manifest.processing.ocrUsed,
          nativeTextDetected: params.manifest.processing.nativeTextDetected
        },
        extractionConfig: { ocrLanguages: getOcrLanguages(), coordinateSystem: "pdf_points_top_left" },
        startedAt: new Date(startedAt),
        completedAt: new Date(completedAt),
        durationMs: params.manifest.processing.durationMs,
        warnings: params.manifest.warnings,
        errorSummary: null
      }
    },
    {
      sort: { createdAt: -1 },
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  if (params.manifest.pages.length > 0) {
    await ExtractedPageModel.insertMany(
      params.manifest.pages.map((page) => ({
        extractionRunId: run._id,
        projectId: projectObjectId,
        ownerId: ownerObjectId,
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        rotation: page.rotation,
        previewStorageKey: page.previewStorageKey,
        textBlocks: page.textBlocks,
        images: page.images,
        tables: page.tables,
        warnings: page.warnings,
        confidence: page.confidence
      })),
      { ordered: true }
    );
  }

  await ProjectModel.updateOne(
    { _id: projectObjectId, ownerId: ownerObjectId },
    {
      $set: {
        latestExtractionRunId: run._id,
        pageCount: params.manifest.pageCount,
        extractionProgress: 100,
        extractionSummary: {
          ...params.manifest.summary,
          ocrUsed: params.manifest.processing.ocrUsed,
          nativeTextDetected: params.manifest.processing.nativeTextDetected
        },
        status: "REVIEW_REQUIRED",
        lastError: null,
        "originalPdf.pageCount": params.manifest.pageCount
      }
    }
  );

  await ProcessingJobModel.updateOne(
    { projectId: projectObjectId },
    { $set: { status: "COMPLETED", progress: 100, errorSummary: null } }
  );

  return run;
}

export async function getExtractionForProject(params: { projectId: string; ownerId: string; page?: number; pageSize?: number }) {
  if (!Types.ObjectId.isValid(params.projectId)) return null;
  const projectObjectId = new Types.ObjectId(params.projectId);
  const ownerObjectId = new Types.ObjectId(params.ownerId);
  const project = await ProjectModel.findOne({ _id: projectObjectId, ownerId: ownerObjectId }).lean<Record<string, unknown>>();
  if (!project) return null;

  const run = await findLatestExtractionRun(projectObjectId, ownerObjectId);
  if (!run) return { run: null, pages: [], pagination: { page: 1, pageSize: 0, total: 0, pageCount: 0 } };

  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 8, 1), 25);
  const filter = { extractionRunId: run._id, projectId: projectObjectId, ownerId: ownerObjectId };
  const [pages, total] = await Promise.all([
    ExtractedPageModel.find(filter).sort({ pageNumber: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Array<Record<string, unknown>>>(),
    ExtractedPageModel.countDocuments(filter)
  ]);

  const pageSummaries = pages.map((item) => {
    const summary = serializePageSummary(item);
    return { ...summary, previewUrl: buildPagePreviewArtifactUrl(params.projectId, summary.pageNumber) };
  });

  return {
    run: serializeRun(run),
    pages: pageSummaries.map(stripPreviewStorageKey),
    pagination: { page, pageSize, total, pageCount: Math.max(Math.ceil(total / pageSize), total > 0 ? 1 : 0) }
  };
}

export async function getExtractionPageForProject(params: { projectId: string; ownerId: string; pageNumber: number }) {
  if (!Types.ObjectId.isValid(params.projectId) || !Number.isInteger(params.pageNumber) || params.pageNumber < 1) return null;
  const projectObjectId = new Types.ObjectId(params.projectId);
  const ownerObjectId = new Types.ObjectId(params.ownerId);
  const project = await ProjectModel.exists({ _id: projectObjectId, ownerId: ownerObjectId });
  if (!project) return null;

  const run = await findLatestExtractionRun(projectObjectId, ownerObjectId);
  if (!run) return null;

  const page = await ExtractedPageModel.findOne({ extractionRunId: run._id, projectId: projectObjectId, ownerId: ownerObjectId, pageNumber: params.pageNumber }).lean<Record<string, unknown>>();
  if (!page) return null;

  const serialized = serializeFullPage(page);
  const images = serialized.images.map(({ storageKey: _storageKey, ...image }) => ({ ...image, url: buildExtractedImageArtifactUrl(params.projectId, params.pageNumber, image.id) }));
  const safePage = stripPreviewStorageKey(serialized);
  return { run: serializeRun(run), page: { ...safePage, previewUrl: buildPagePreviewArtifactUrl(params.projectId, params.pageNumber), images } };
}

export async function getPagePreviewArtifactForProject(params: { projectId: string; ownerId: string; pageNumber: number }): Promise<ProjectArtifact | null> {
  if (!Types.ObjectId.isValid(params.projectId) || !Number.isInteger(params.pageNumber) || params.pageNumber < 1) return null;
  const page = await findOwnedExtractedPage({ projectId: params.projectId, ownerId: params.ownerId, pageNumber: params.pageNumber });
  if (!page) return null;
  const previewStorageKey = typeof page.previewStorageKey === "string" ? page.previewStorageKey : "";
  if (!previewStorageKey) throw new AppError("Preview artifact missing", 404, { code: "PREVIEW_ARTIFACT_MISSING" });
  const object = await getPrivateObject(previewStorageKey);
  return toProjectArtifact(object, "image/jpeg");
}

export async function getExtractedImageArtifactForProject(params: { projectId: string; ownerId: string; pageNumber: number; imageId: string }): Promise<ProjectArtifact | null> {
  if (!Types.ObjectId.isValid(params.projectId) || !Number.isInteger(params.pageNumber) || params.pageNumber < 1) return null;
  const page = await findOwnedExtractedPage({ projectId: params.projectId, ownerId: params.ownerId, pageNumber: params.pageNumber });
  if (!page) return null;

  const images = Array.isArray(page.images) ? (page.images as Array<Record<string, unknown>>) : [];
  const image = images.find((item) => String(item.id ?? "") === params.imageId);
  if (!image) return null;

  const storageKey = typeof image.storageKey === "string" ? image.storageKey : "";
  if (!storageKey) throw new AppError("Image artifact missing", 404, { code: "IMAGE_ARTIFACT_MISSING" });
  const mimeType = typeof image.mimeType === "string" && image.mimeType ? image.mimeType : "application/octet-stream";
  const object = await getPrivateObject(storageKey);
  return toProjectArtifact(object, mimeType);
}

export async function getAllExtractedImagesForProject(params: { projectId: string; ownerId: string }) {
  if (!Types.ObjectId.isValid(params.projectId)) return null;
  const projectObjectId = new Types.ObjectId(params.projectId);
  const ownerObjectId = new Types.ObjectId(params.ownerId);
  const project = await ProjectModel.exists({ _id: projectObjectId, ownerId: ownerObjectId });
  if (!project) return null;

  const run = await findLatestExtractionRun(projectObjectId, ownerObjectId);
  if (!run) return { images: [] };

  const filter = { extractionRunId: run._id, projectId: projectObjectId, ownerId: ownerObjectId };
  const pages = await ExtractedPageModel.find(filter).sort({ pageNumber: 1 }).lean<Array<Record<string, unknown>>>();

  const images: Array<{ id: string; pageNumber: number; width: number; height: number; url: string; mimeType: string }> = [];
  for (const page of pages) {
    const pageNumber = Number(page.pageNumber);
    const rawImages = Array.isArray(page.images) ? (page.images as Array<Record<string, unknown>>) : [];
    for (const img of rawImages) {
      const id = String(img.id ?? "");
      if (!id) continue;
      images.push({
        id,
        pageNumber,
        width: Number(img.width ?? 0),
        height: Number(img.height ?? 0),
        mimeType: typeof img.mimeType === "string" && img.mimeType ? img.mimeType : "image/png",
        url: buildExtractedImageArtifactUrl(params.projectId, pageNumber, id)
      });
    }
  }

  return { images };
}

export async function retryExtractionForProject(projectId: string, ownerId: string, engine: "native" | "google_doc_ai" | "gemini_vision" = "gemini_vision") {
  if (!Types.ObjectId.isValid(projectId)) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });
  const project = await ProjectModel.findOne({ _id: projectId, ownerId: new Types.ObjectId(ownerId) });
  if (!project) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });
  if (!canRetryExtractionStatus(project.status)) {
    throw new AppError("Extraction can only be retried after failure or explicit review retry", 409, { code: "RETRY_NOT_ALLOWED" });
  }

  const activeJob = await ProcessingJobModel.findOne({ projectId: project._id, status: { $in: ["QUEUED", "PROCESSING"] } });
  if (activeJob) throw new AppError("This project already has an active extraction job", 409, { code: "ACTIVE_EXTRACTION_JOB" });

  await ProcessingJobModel.findOneAndUpdate(
    { projectId: project._id },
    { projectId: project._id, queueName: "extract-pdf", status: "QUEUED", progress: 0, errorSummary: null, $inc: { attempts: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ProjectModel.updateOne({ _id: project._id }, { $set: { status: "QUEUED", extractionProgress: 0, lastError: null } });
  const bullJob = await getExtractPdfQueue().add("extract", { projectId, ownerId, storageKey: project.originalPdf.storageKey, extractionEngine: engine }, { jobId: `${projectId}-${Date.now()}` });
  await ProcessingJobModel.updateOne({ projectId: project._id }, { $set: { bullJobId: bullJob.id ?? null } });
}

async function findLatestExtractionRun(projectId: Types.ObjectId, ownerId: Types.ObjectId) {
  return ExtractionRunModel.findOne({ projectId, ownerId }).sort({ createdAt: -1 }).lean<Record<string, unknown>>();
}

async function findOwnedExtractedPage(params: { projectId: string; ownerId: string; pageNumber: number }) {
  const projectObjectId = new Types.ObjectId(params.projectId);
  const ownerObjectId = new Types.ObjectId(params.ownerId);
  return ExtractedPageModel.findOne({ projectId: projectObjectId, ownerId: ownerObjectId, pageNumber: params.pageNumber }).lean<Record<string, unknown>>();
}

function toProjectArtifact(object: PrivateObject, fallbackContentType: string): ProjectArtifact {
  return {
    body: object.body,
    contentType: object.contentType ?? fallbackContentType,
    contentLength: object.contentLength,
    cacheControl: PRIVATE_ARTIFACT_CACHE_CONTROL
  };
}

function getManifestDatetime(value: unknown, field: "startedAt" | "completedAt") {
  if (!value || typeof value !== "object" || !("processing" in value)) return null;
  const processing = value.processing as Record<string, unknown>;
  if (!processing || typeof processing !== "object" || !(field in processing)) return null;
  const candidate = processing[field];
  return typeof candidate === "string" ? candidate : null;
}

function normalizeManifestDatetime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("Extraction manifest contained an invalid datetime", 422, { code: "INVALID_EXTRACTION_MANIFEST" });
  }

  return parsed.toISOString();
}

function serializeRun(run: Record<string, unknown>) {
  return {
    id: String(run._id),
    projectId: String(run.projectId),
    ownerId: String(run.ownerId),
    schemaVersion: String(run.schemaVersion),
    status: String(run.status),
    sourceFile: run.sourceFile,
    pageCount: Number(run.pageCount ?? 0),
    summary: run.summary,
    extractionConfig: run.extractionConfig,
    startedAt: new Date(run.startedAt as Date).toISOString(),
    completedAt: run.completedAt ? new Date(run.completedAt as Date).toISOString() : null,
    durationMs: run.durationMs == null ? null : Number(run.durationMs),
    warnings: Array.isArray(run.warnings) ? run.warnings.map(String) : [],
    errorSummary: run.errorSummary ? String(run.errorSummary) : null,
    createdAt: new Date(run.createdAt as Date).toISOString(),
    updatedAt: new Date(run.updatedAt as Date).toISOString()
  };
}

function serializePageSummary(page: Record<string, unknown>) {
  const textBlocks = Array.isArray(page.textBlocks) ? page.textBlocks : [];
  const images = Array.isArray(page.images) ? page.images : [];
  const tables = Array.isArray(page.tables) ? page.tables : [];
  const warnings = Array.isArray(page.warnings) ? page.warnings : [];
  return {
    id: String(page._id),
    pageNumber: Number(page.pageNumber),
    width: Number(page.width),
    height: Number(page.height),
    rotation: Number(page.rotation ?? 0),
    previewStorageKey: String(page.previewStorageKey),
    textBlockCount: textBlocks.length,
    imageCount: images.length,
    tableCount: tables.length,
    warnings: warnings.map(String),
    confidence: Number(page.confidence ?? 0)
  };
}

function serializeFullPage(page: Record<string, unknown>): ExtractedPageManifest & { id: string } {
  return {
    id: String(page._id),
    pageNumber: Number(page.pageNumber),
    width: Number(page.width),
    height: Number(page.height),
    rotation: Number(page.rotation ?? 0),
    previewStorageKey: String(page.previewStorageKey),
    textBlocks: (Array.isArray(page.textBlocks) ? page.textBlocks : []) as ExtractedPageManifest["textBlocks"],
    images: (Array.isArray(page.images) ? page.images : []) as ExtractedPageManifest["images"],
    tables: (Array.isArray(page.tables) ? page.tables : []) as ExtractedPageManifest["tables"],
    warnings: Array.isArray(page.warnings) ? page.warnings.map(String) : [],
    confidence: Number(page.confidence ?? 0)
  };
}

function stripPreviewStorageKey<T extends { previewStorageKey: string }>(page: T) {
  const clone: Omit<T, "previewStorageKey"> & { previewStorageKey?: string } = { ...page };
  delete clone.previewStorageKey;
  return clone;
}


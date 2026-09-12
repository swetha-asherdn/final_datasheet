import { Types } from "mongoose";
import crypto from "crypto";
import { AppError } from "@/lib/errors";
import { callPythonDocxRebrandService } from "@/server/extraction/service";
import { cleanupActionSchema, datasheetPatchSchema, editorJsonSchema, templateSettingsPatchSchema, type DatasheetPatch, type TemplateSettingsPatch, type TiptapJson } from "@/server/datasheet/schema";
import { normalizeDatasheetExtraction, type CleanupItem, type NormalizablePage, type SourceCleanupReport } from "@/server/datasheet/normalization";
import { createDefaultTemplateSettings } from "@/server/datasheet/template";
import { DatasheetDocumentModel } from "@/server/models/datasheet-document";
import { DatasheetTemplateSettingsModel } from "@/server/models/datasheet-template-settings";
import { ExtractedPageModel } from "@/server/models/extracted-page";
import { ExtractionRunModel } from "@/server/models/extraction-run";
import { ProjectModel } from "@/server/models/project";

export async function createDatasheetFromExtraction(params: { projectId: string; ownerId: string; force?: boolean }) {
  const ids = parseOwnerProjectIds(params);
  const existing = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 });
  if (existing && !params.force) return getDatasheetForProject(params);

  const project = await ProjectModel.findOne({ _id: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!project) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });

  const { run, normalized } = await getNormalizedExtraction(ids);
  const defaults = createDefaultTemplateSettings({ productCode: normalized.productCode, productTitle: normalized.productCategory, documentStatus: normalized.documentStatus, revision: normalized.revision || undefined });
  const template = await DatasheetTemplateSettingsModel.create({
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
    ...defaults
  });
  const document = await DatasheetDocumentModel.create({
    projectId: ids.projectObjectId,
    ownerId: ids.ownerObjectId,
    extractionRunId: run._id,
    schemaVersion: "1.0",
    status: "READY_FOR_EDIT",
    templateSettingsId: template._id,
    title: normalized.title,
    productCode: normalized.productCode,
    productCategory: normalized.productCategory,
    editorJson: normalized.editorJson,
    sourceCleanupReport: normalized.cleanupReport,
    createdFromExtractionAt: new Date(),
    lastSavedAt: new Date()
  });

  await ProjectModel.updateOne(
    { _id: ids.projectObjectId, ownerId: ids.ownerObjectId },
    {
      $set: {
        latestDatasheetDocumentId: document._id,
        composerStatus: "READY_FOR_EDIT",
        templateSummary: {
          productCode: normalized.productCode,
          productTitle: normalized.productCategory,
          revision: defaults.revision,
          documentStatus: defaults.documentStatus
        }
      }
    }
  );

  return serializeDatasheetBundle(document.toObject(), template.toObject());
}

export async function regenerateDatasheetFromExtraction(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  const document = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 });
  if (!document) throw new AppError("Datasheet document not found", 404, { code: "DATASHEET_NOT_FOUND" });

  const template = await DatasheetTemplateSettingsModel.findOne({ _id: document.templateSettingsId, projectId: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!template) throw new AppError("Template settings not found", 404, { code: "TEMPLATE_NOT_FOUND" });

  const previousDocument = document.toObject() as Record<string, unknown>;
  const { run, normalized } = await getNormalizedExtraction(ids);

  document.extractionRunId = run._id;
  document.title = normalized.title;
  document.productCode = normalized.productCode;
  document.productCategory = normalized.productCategory;
  document.editorJson = normalized.editorJson;
  document.sourceCleanupReport = normalized.cleanupReport;
  document.status = "READY_FOR_EDIT";
  document.lastSavedAt = new Date();
  document.markModified("editorJson");
  document.markModified("sourceCleanupReport");
  await document.save();

  const previousCode = String(previousDocument.productCode ?? "");
  const previousTitle = String(previousDocument.title ?? "");
  const previousCategory = String(previousDocument.productCategory ?? "");
  const defaults = createDefaultTemplateSettings();

  if (!template.productCode || template.productCode === previousCode) template.productCode = normalized.productCode;
  if (!template.productTitle || template.productTitle === previousTitle || template.productTitle === previousCategory || template.productTitle === document.title || template.productTitle === document.productCategory) template.productTitle = normalized.productCategory;
  if (!template.documentStatus || template.documentStatus === defaults.documentStatus) template.documentStatus = normalized.documentStatus;
  if (normalized.revision && (!template.revision || template.revision === defaults.revision || !isStrictTemplateRevision(template.revision))) {
    template.revision = normalized.revision;
  } else if (!isStrictTemplateRevision(template.revision)) {
    template.revision = defaults.revision;
  }
  template.footerText = `${template.documentStatus} | ${template.revision}`;
  await template.save();

  await ProjectModel.updateOne(
    { _id: ids.projectObjectId, ownerId: ids.ownerObjectId },
    {
      $set: {
        latestDatasheetDocumentId: document._id,
        composerStatus: "READY_FOR_EDIT",
        templateSummary: {
          productCode: template.productCode,
          productTitle: template.productTitle,
          revision: template.revision,
          documentStatus: template.documentStatus
        }
      }
    }
  );

  const bundle = await getDatasheetForProject(params);
  return bundle ? { ...bundle, qualitySummary: normalized.qualitySummary } : null;
}

export async function getDatasheetForProject(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  const project = await ProjectModel.exists({ _id: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!project) return null;

  const document = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 }).lean<Record<string, unknown>>();
  if (!document) return null;
  const template = await DatasheetTemplateSettingsModel.findOne({ _id: document.templateSettingsId, projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).lean<Record<string, unknown>>();
  if (!template) return null;
  return serializeDatasheetBundle(document, template);
}

export async function updateDatasheetForProject(params: { projectId: string; ownerId: string; input: unknown }) {
  const patch = datasheetPatchSchema.parse(params.input);
  const ids = parseOwnerProjectIds(params);
  const current = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 });
  if (!current) throw new AppError("Datasheet document not found", 404, { code: "DATASHEET_NOT_FOUND" });

  applyDocumentPatch(current, patch);
  current.lastSavedAt = new Date();
  await current.save();
  await ProjectModel.updateOne({ _id: ids.projectObjectId, ownerId: ids.ownerObjectId }, { $set: { composerStatus: current.status === "READY_FOR_EDIT" ? "READY_FOR_EDIT" : current.status } });
  return getDatasheetForProject(params);
}

export async function updateTemplateForProject(params: { projectId: string; ownerId: string; input: unknown }) {
  const patch = templateSettingsPatchSchema.parse(params.input);
  const ids = parseOwnerProjectIds(params);
  const bundle = await getDatasheetForProject(params);
  if (!bundle) throw new AppError("Datasheet document not found", 404, { code: "DATASHEET_NOT_FOUND" });
  const template = await DatasheetTemplateSettingsModel.findOne({ _id: bundle.template.id, projectId: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!template) throw new AppError("Template settings not found", 404, { code: "TEMPLATE_NOT_FOUND" });

  applyTemplatePatch(template, patch);
  template.footerText = `${template.documentStatus} | ${template.revision}`;
  await template.save();
  await ProjectModel.updateOne(
    { _id: ids.projectObjectId, ownerId: ids.ownerObjectId },
    { $set: { templateSummary: { productCode: template.productCode, productTitle: template.productTitle, revision: template.revision, documentStatus: template.documentStatus } } }
  );

  // Call the Python worker to rebrand the DOCX package in S3 (colors, logo, metadata)
  const project = await ProjectModel.findOne({ _id: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (project && project.editableDocx?.storageKey) {
    try {
      const rebrandResult = await callPythonDocxRebrandService({
        projectId: params.projectId,
        ownerId: params.ownerId,
        docxStorageKey: project.editableDocx.storageKey,
        branding: {
          companyName: template.companyName,
          logoStorageKey: template.logoStorageKey || null,
          productCode: template.productCode,
          productTitle: template.productTitle,
          documentStatus: template.documentStatus,
          revision: template.revision,
          primaryColor: template.primaryColor,
          accentColor: template.accentColor
        }
      });

      await ProjectModel.updateOne(
        { _id: project._id },
        {
          $set: {
            "editableDocx.fileSize": rebrandResult.fileSize,
            "editableDocx.lastSavedAt": new Date()
          }
        }
      );
    } catch (rebrandErr) {
      console.error("[updateTemplateForProject] Programmatic DOCX rebranding failed:", rebrandErr);
    }
  }

  return getDatasheetForProject(params);
}

export async function restoreCleanupItemForProject(params: { projectId: string; ownerId: string; input: unknown }) {
  const { itemId } = cleanupActionSchema.parse(params.input);
  const document = await findEditableDocument(params);
  const report = document.sourceCleanupReport as SourceCleanupReport;
  const item = findCleanupItem(report, itemId);
  if (!item) throw new AppError("Cleanup item not found", 404, { code: "CLEANUP_ITEM_NOT_FOUND" });

  item.decision = "kept";
  item.reasons = Array.from(new Set([...item.reasons, "MANUAL_RESTORED"]));
  document.editorJson = appendRestoredItem(document.editorJson as TiptapJson, item);
  document.markModified("editorJson");
  document.markModified("sourceCleanupReport");
  document.lastSavedAt = new Date();
  await document.save();
  return getDatasheetForProject(params);
}

export async function removeCleanupItemForProject(params: { projectId: string; ownerId: string; input: unknown }) {
  const { itemId } = cleanupActionSchema.parse(params.input);
  const document = await findEditableDocument(params);
  const report = document.sourceCleanupReport as SourceCleanupReport;
  const item = findCleanupItem(report, itemId);
  if (!item) throw new AppError("Cleanup item not found", 404, { code: "CLEANUP_ITEM_NOT_FOUND" });

  item.decision = "removed";
  item.reasons = Array.from(new Set([...item.reasons, "MANUAL_REMOVED"]));
  document.markModified("sourceCleanupReport");
  document.lastSavedAt = new Date();
  await document.save();
  return getDatasheetForProject(params);
}

function parseOwnerProjectIds(params: { projectId: string; ownerId: string }) {
  if (!Types.ObjectId.isValid(params.projectId)) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });
  if (!Types.ObjectId.isValid(params.ownerId)) throw new AppError("Authentication required", 401, { code: "AUTHENTICATION_REQUIRED" });
  return { projectObjectId: new Types.ObjectId(params.projectId), ownerObjectId: new Types.ObjectId(params.ownerId) };
}

async function findEditableDocument(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  const document = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 });
  if (!document) throw new AppError("Datasheet document not found", 404, { code: "DATASHEET_NOT_FOUND" });
  return document;
}

async function getNormalizedExtraction(ids: { projectObjectId: Types.ObjectId; ownerObjectId: Types.ObjectId }) {
  const run = await ExtractionRunModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId, status: "COMPLETED" }).sort({ createdAt: -1 }).lean<Record<string, unknown>>();
  if (!run) throw new AppError("Create an editable datasheet after extraction completes", 409, { code: "EXTRACTION_REQUIRED" });

  const pages = await ExtractedPageModel.find({ extractionRunId: run._id, projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ pageNumber: 1 }).lean<Array<Record<string, unknown>>>();
  if (pages.length === 0) throw new AppError("No extracted pages are available for composer creation", 409, { code: "EXTRACTED_PAGES_REQUIRED" });
  return { run, normalized: normalizeDatasheetExtraction(pages.map(toNormalizablePage)) };
}

function applyDocumentPatch(document: Record<string, unknown> & { markModified?: (field: string) => void }, patch: DatasheetPatch) {
  if (patch.title !== undefined) document.title = patch.title;
  if (patch.productCode !== undefined) document.productCode = patch.productCode;
  if (patch.productCategory !== undefined) document.productCategory = patch.productCategory;
  if (patch.status !== undefined) document.status = patch.status;
  if (patch.editorJson !== undefined) {
    document.editorJson = editorJsonSchema.parse(patch.editorJson);
    if (typeof document.markModified === "function") {
      document.markModified("editorJson");
    }
  }
}

function applyTemplatePatch(template: Record<string, unknown>, patch: TemplateSettingsPatch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) template[key] = value;
  }
}

function toNormalizablePage(page: Record<string, unknown>): NormalizablePage {
  return {
    pageNumber: Number(page.pageNumber),
    width: Number(page.width),
    height: Number(page.height),
    textBlocks: Array.isArray(page.textBlocks) ? page.textBlocks.map((block) => block as NormalizablePage["textBlocks"][number]) : [],
    images: Array.isArray(page.images) ? page.images.map((image) => image as NormalizablePage["images"][number]) : [],
    tables: Array.isArray(page.tables) ? page.tables.map((table) => table as NormalizablePage["tables"][number]) : [],
    warnings: Array.isArray(page.warnings) ? page.warnings.map(String) : []
  };
}

function findCleanupItem(report: SourceCleanupReport, itemId: string) {
  return [...report.removedTextBlocks, ...report.removedImages, ...report.uncertainItems, ...report.keptTextBlocks, ...report.keptImages].find((item) => item.id === itemId);
}

function appendRestoredItem(editorJson: TiptapJson, item: CleanupItem): TiptapJson {
  const restoredNode = item.itemType === "text"
    ? { type: "paragraph", attrs: { restoredCleanupItemId: item.id }, content: [{ type: "text", text: item.text ?? "" }] }
    : { type: "paragraph", attrs: { restoredCleanupItemId: item.id }, content: [{ type: "text", text: `Restored image artifact: ${item.storageKey ?? item.sourceId}` }] };
  return { ...editorJson, content: [...(editorJson.content ?? []), restoredNode] };
}

function generateDocxToken(projectId: string) {
  const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
  return crypto.createHmac("sha256", secret).update(projectId).digest("hex");
}

function getAppUrl() {
  const isDocker = process.env.DOCKER_ENV === "true";
  return isDocker ? "http://web:3000" : (process.env.NEXTAUTH_URL || "http://localhost:3000");
}

function serializeDatasheetBundle(document: Record<string, unknown>, template: Record<string, unknown>) {
  const projectIdStr = String(document.projectId);
  const token = generateDocxToken(projectIdStr);
  const appUrl = getAppUrl();
  
  return {
    document: {
      id: String(document._id),
      projectId: projectIdStr,
      extractionRunId: String(document.extractionRunId),
      schemaVersion: String(document.schemaVersion),
      status: String(document.status),
      title: String(document.title),
      productCode: String(document.productCode ?? ""),
      productCategory: String(document.productCategory ?? ""),
      editorJson: editorJsonSchema.parse(document.editorJson),
      sourceCleanupReport: document.sourceCleanupReport as SourceCleanupReport,
      createdFromExtractionAt: new Date(document.createdFromExtractionAt as Date).toISOString(),
      lastSavedAt: new Date(document.lastSavedAt as Date).toISOString()
    },
    template: serializeTemplate(template),
    onlyOfficeConfig: {
      onlyOfficeUrl: process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "http://localhost:8080",
      downloadUrl: `${appUrl}/api/projects/${projectIdStr}/datasheet/download-docx?token=${token}`,
      callbackUrl: `${appUrl}/api/projects/${projectIdStr}/datasheet/onlyoffice-callback`,
      token
    }
  };
}

function isStrictTemplateRevision(value: unknown) {
  return /^Rev\. (?:[A-Z]|\d+(?:\.\d+)*)$/.test(String(value ?? "").trim());
}

function serializeTemplate(template: Record<string, unknown>) {
  return {
    id: String(template._id),
    logoStorageKey: template.logoStorageKey ? String(template.logoStorageKey) : null,
    logoAssetPath: String(template.logoAssetPath ?? "/branding/vellore-semicon-logo.svg"),
    companyName: String(template.companyName),
    website: String(template.website),
    productCode: String(template.productCode ?? ""),
    productTitle: String(template.productTitle ?? ""),
    documentStatus: String(template.documentStatus),
    revision: String(template.revision),
    layoutMode: template.layoutMode === "single-column" ? "single-column" : "two-column",
    layoutDensity: template.layoutDensity === "comfortable" ? "comfortable" : "technical-dense",
    pageFillStrategy: template.pageFillStrategy === "safe" ? "safe" : template.pageFillStrategy === "aggressive" ? "aggressive" : "balanced",
    pageSize: String(template.pageSize),
    orientation: String(template.orientation),
    primaryColor: String(template.primaryColor),
    accentColor: String(template.accentColor),
    footerText: String(template.footerText),
    showPageNumbers: Boolean(template.showPageNumbers),
    headerConfig: template.headerConfig,
    footerConfig: template.footerConfig
  };
}
import { Types } from "mongoose";
import { AppError } from "@/lib/errors";
import {
  buildExportPageModel,
  renderExportDocumentHtml,
  type ExportBlock,
  type ExportPageModel,
  type ExportTemplateSnapshot,
} from "@/server/datasheet/export-renderer";
import {
  datasheetLayoutPatchSchema,
  editorJsonSchema,
  type DatasheetLayoutExportMode,
} from "@/server/datasheet/schema";
import { DatasheetDocumentModel } from "@/server/models/datasheet-document";
import { DatasheetLayoutModel } from "@/server/models/datasheet-layout";
import { DatasheetTemplateSettingsModel } from "@/server/models/datasheet-template-settings";
import { ProjectModel } from "@/server/models/project";

type LayoutBlockType = "heading" | "paragraph" | "list" | "table" | "image" | "caption" | "section" | "rule" | "generic" | "figure";

type SerializedLayoutBlock = {
  id: string;
  sourceBlockId: string | null;
  kind: "html" | "table";
  blockType: LayoutBlockType;
  column: "left" | "right" | "full";
  flowSlot: number;
  hiddenFromExport: boolean;
  widthPreset: "small" | "medium" | "large" | "full" | "auto";
  keepWithCaption: boolean;
  keepTogether: boolean;
  allowSplit: boolean;
  preventOrphanRows: boolean;
  pageBreakBefore: boolean;
  plainText: string;
  estimatedHeight: number;
  role?: string;
  html?: string;
  fullWidth?: boolean;
  columnEligible?: boolean;
  displaySize?: "small" | "medium" | "full";
  variantClass?: string;
  blockClass?: string;
  imageKey?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  aspectRatio?: number | null;
  headerHtml?: string;
  rowHtml?: string[];
  rowHeights?: number[];
};

type SerializedLayoutPage = {
  pageNumber: number;
  usedHeight: number;
  bodyHeight: number;
  warnings: string[];
  blocks: SerializedLayoutBlock[];
};

type LayoutSnapshot = {
  documentId: Types.ObjectId;
  document: {
    title: string;
    productCode: string;
    productCategory: string;
    editorJson: ReturnType<typeof editorJsonSchema.parse>;
  };
  template: ExportTemplateSnapshot;
};

export type SerializedDatasheetLayout = {
  id: string;
  projectId: string;
  datasheetDocumentId: string;
  exportMode: DatasheetLayoutExportMode;
  templateSnapshot: ExportTemplateSnapshot;
  pages: SerializedLayoutPage[];
  warnings: string[];
  lastGeneratedAt: string;
  lastSavedAt: string;
  updatedAt: string;
};

export async function getDatasheetLayoutForProject(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  const layout = await DatasheetLayoutModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).lean<Record<string, unknown>>();
  if (!layout) return null;
  return serializeLayout(layout);
}

export async function generateDatasheetLayoutForProject(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  const snapshot = await buildLayoutSnapshot(params, ids);
  const generated = createGeneratedLayout(snapshot.template, buildExportPageModel({ document: snapshot.document, template: snapshot.template }));
  const now = new Date();
  const existing = await DatasheetLayoutModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId, datasheetDocumentId: snapshot.documentId });
  const layout = existing ?? new DatasheetLayoutModel({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId, datasheetDocumentId: snapshot.documentId });

  layout.schemaVersion = "1.0";
  layout.templateSnapshot = snapshot.template;
  layout.exportMode = existing?.exportMode === "auto" ? "auto" : "saved";
  layout.layoutMode = snapshot.template.layoutMode;
  layout.layoutDensity = snapshot.template.layoutDensity;
  layout.pages = generated.pages;
  layout.warnings = generated.warnings;
  layout.lastGeneratedAt = now;
  layout.lastSavedAt = now;
  await layout.save();

  return serializeLayout(layout.toObject() as Record<string, unknown>);
}

export async function updateDatasheetLayoutForProject(params: { projectId: string; ownerId: string; input: unknown }) {
  const patch = datasheetLayoutPatchSchema.parse(params.input);
  const ids = parseOwnerProjectIds(params);
  const layout = await DatasheetLayoutModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!layout) throw new AppError("Paged layout not found", 404, { code: "DATASHEET_LAYOUT_NOT_FOUND" });

  if (patch.pages !== undefined) layout.pages = patch.pages;
  if (patch.warnings !== undefined) layout.warnings = patch.warnings;
  if (patch.exportMode !== undefined) layout.exportMode = patch.exportMode;
  layout.lastSavedAt = new Date();
  await layout.save();

  return serializeLayout(layout.toObject() as Record<string, unknown>);
}

export async function resetDatasheetLayoutForProject(params: { projectId: string; ownerId: string }) {
  const ids = parseOwnerProjectIds(params);
  await DatasheetLayoutModel.deleteOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId });
  return generateDatasheetLayoutForProject(params);
}

export async function resolveDatasheetLayoutRenderModel(params: { projectId: string; ownerId: string; preferredMode?: DatasheetLayoutExportMode }) {
  const ids = parseOwnerProjectIds(params);
  const snapshot = await buildLayoutSnapshot(params, ids);
  const autoPageModel = buildExportPageModel({ document: snapshot.document, template: snapshot.template });
  const layoutRecord = await DatasheetLayoutModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId, datasheetDocumentId: snapshot.documentId }).lean<Record<string, unknown>>();
  const preferredMode = params.preferredMode ?? "auto";

  if (!layoutRecord || preferredMode === "auto") {
    return {
      mode: "auto" as const,
      pageModel: autoPageModel,
      template: snapshot.template,
      savedLayout: null,
    };
  }

  const savedLayout = serializeLayout(layoutRecord);
  return {
    mode: "saved" as const,
    pageModel: buildPageModelFromSavedLayout(savedLayout, snapshot.template),
    template: snapshot.template,
    savedLayout,
  };
}

export async function getDatasheetLayoutPreviewHtml(params: { projectId: string; ownerId: string; preferredMode?: DatasheetLayoutExportMode }) {
  const result = await resolveDatasheetLayoutRenderModel(params);
  return renderExportDocumentHtml(result.pageModel, result.template, { mode: "preview" });
}

function buildPageModelFromSavedLayout(layout: SerializedDatasheetLayout, template: ExportTemplateSnapshot): ExportPageModel {
  return {
    title: template.productTitle,
    productCode: template.productCode,
    logoSrc: template.logoAssetPath,
    pages: layout.pages.map((page) => ({
      blocks: page.blocks.filter((block) => !block.hiddenFromExport).map(toExportBlock).filter((block): block is ExportBlock => Boolean(block)),
      usedHeight: page.usedHeight,
      locked: false,
    })),
  };
}

function toExportBlock(block: SerializedLayoutBlock): ExportBlock | null {
  if (block.kind === "table") {
    return {
      kind: "table",
      role: "table",
      estimatedHeight: block.estimatedHeight,
      meaningful: true,
      headerHtml: block.headerHtml ?? "",
      rowHtml: block.rowHtml ?? [],
      rowHeights: block.rowHeights ?? [],
      plainText: block.plainText,
      variantClass: block.variantClass ?? "technical-table",
    };
  }

  if (!block.html) return null;
  return {
    kind: "html",
    role: block.blockType === "section" ? "heading" : (block.role as Exclude<LayoutBlockType, "table" | "section"> | undefined) ?? "generic",
    html: block.html,
    estimatedHeight: block.estimatedHeight,
    meaningful: true,
    plainText: block.plainText,
    imageKey: block.imageKey,
    imageWidth: block.imageWidth ?? null,
    imageHeight: block.imageHeight ?? null,
    aspectRatio: block.aspectRatio ?? null,
    columnEligible: block.columnEligible,
    fullWidth: block.fullWidth,
    displaySize: block.displaySize,
    variantClass: block.variantClass,
    blockClass: block.blockClass,
  };
}

function createGeneratedLayout(template: ExportTemplateSnapshot, pageModel: ExportPageModel) {
  const pages = pageModel.pages.map((page, pageIndex) => {
    const blocks = page.blocks.filter((block) => block.kind !== "break").map((block, blockIndex) => serializePageBlock(block, pageIndex, blockIndex));
    return {
      pageNumber: pageIndex + 1,
      usedHeight: page.usedHeight,
      bodyHeight: template.layoutDensity === "technical-dense" && template.layoutMode === "two-column" ? 264 : 240,
      warnings: computePageWarnings(pageIndex, pageModel.pages.length, page.usedHeight, blocks),
      blocks,
    } satisfies SerializedLayoutPage;
  });
  return { pages, warnings: pages.flatMap((page) => page.warnings) };
}

function serializePageBlock(block: ExportBlock, pageIndex: number, blockIndex: number): SerializedLayoutBlock {
  if (block.kind === "break") throw new AppError("Break blocks are not persisted in saved layout pages", 500, { code: "DATASHEET_LAYOUT_SERIALIZATION_ERROR" });
  const id = `page-${pageIndex + 1}-block-${blockIndex + 1}`;
  if (block.kind === "table") {
    return {
      id,
      sourceBlockId: null,
      kind: "table",
      blockType: "table",
      column: "full",
      flowSlot: blockIndex,
      hiddenFromExport: false,
      widthPreset: "full",
      keepWithCaption: false,
      keepTogether: true,
      allowSplit: true,
      preventOrphanRows: true,
      pageBreakBefore: false,
      plainText: block.plainText ?? "",
      estimatedHeight: block.estimatedHeight,
      role: block.role,
      variantClass: block.variantClass,
      headerHtml: block.headerHtml,
      rowHtml: block.rowHtml,
      rowHeights: block.rowHeights,
    };
  }

  const blockType = block.role === "heading"
    ? "heading"
    : block.role === "paragraph"
      ? "paragraph"
      : block.role === "list"
        ? "list"
        : block.role === "image"
          ? "image"
          : block.role === "caption"
            ? "caption"
            : block.role === "figure"
              ? "figure"
              : block.role === "rule"
                ? "rule"
                : "generic";

  return {
    id,
    sourceBlockId: null,
    kind: "html",
    blockType,
    column: block.fullWidth ? "full" : block.columnEligible ? (blockIndex % 2 === 0 ? "left" : "right") : "full",
    flowSlot: blockIndex,
    hiddenFromExport: false,
    widthPreset: block.displaySize === "small" ? "small" : block.displaySize === "full" ? "full" : block.fullWidth ? "large" : "medium",
    keepWithCaption: block.role === "figure",
    keepTogether: block.role === "figure" || block.role === "heading",
    allowSplit: block.role !== "figure",
    preventOrphanRows: false,
    pageBreakBefore: false,
    plainText: block.plainText ?? "",
    estimatedHeight: block.estimatedHeight,
    role: block.role,
    html: block.html,
    fullWidth: block.fullWidth,
    columnEligible: block.columnEligible,
    displaySize: block.displaySize,
    variantClass: block.variantClass,
    blockClass: block.blockClass,
    imageKey: block.imageKey,
    imageWidth: block.imageWidth ?? null,
    imageHeight: block.imageHeight ?? null,
    aspectRatio: block.aspectRatio ?? null,
  };
}

function computePageWarnings(pageIndex: number, totalPages: number, usedHeight: number, blocks: SerializedLayoutBlock[]) {
  const warnings: string[] = [];
  if (usedHeight < 90) warnings.push(`Page ${pageIndex + 1} has large blank area`);
  if (pageIndex === totalPages - 1 && usedHeight < 70) warnings.push("Final page has tiny leftover content");
  if (blocks.some((block) => block.kind === "table" && (block.rowHtml?.length ?? 0) <= 1)) warnings.push(`Page ${pageIndex + 1} has a table split that risks an orphan row`);
  if (blocks.some((block) => block.blockType === "image" && block.widthPreset === "full" && block.estimatedHeight > 110)) warnings.push(`Page ${pageIndex + 1} has an image that may be too large for the page`);
  return warnings;
}

function serializeLayout(layout: Record<string, unknown>): SerializedDatasheetLayout {
  return {
    id: String(layout._id),
    projectId: String(layout.projectId),
    datasheetDocumentId: String(layout.datasheetDocumentId),
    exportMode: layout.exportMode === "auto" ? "auto" : "saved",
    templateSnapshot: layout.templateSnapshot as ExportTemplateSnapshot,
    pages: Array.isArray(layout.pages) ? layout.pages as SerializedLayoutPage[] : [],
    warnings: Array.isArray(layout.warnings) ? layout.warnings.map(String) : [],
    lastGeneratedAt: new Date(layout.lastGeneratedAt as Date).toISOString(),
    lastSavedAt: new Date(layout.lastSavedAt as Date).toISOString(),
    updatedAt: new Date(layout.updatedAt as Date).toISOString(),
  };
}

async function buildLayoutSnapshot(params: { projectId: string; ownerId: string }, ids = parseOwnerProjectIds(params)): Promise<LayoutSnapshot> {
  const project = await ProjectModel.exists({ _id: ids.projectObjectId, ownerId: ids.ownerObjectId });
  if (!project) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });

  const document = await DatasheetDocumentModel.findOne({ projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).sort({ createdAt: -1 }).lean<Record<string, unknown>>();
  if (!document) throw new AppError("Create an editable datasheet before opening the paged layout editor", 400, { code: "DATASHEET_REQUIRED" });

  const template = await DatasheetTemplateSettingsModel.findOne({ _id: document.templateSettingsId, projectId: ids.projectObjectId, ownerId: ids.ownerObjectId }).lean<Record<string, unknown>>();
  if (!template) throw new AppError("Template settings not found", 404, { code: "TEMPLATE_NOT_FOUND" });

  return {
    documentId: document._id as Types.ObjectId,
    document: {
      title: String(document.title ?? "Editable Datasheet"),
      productCode: String(document.productCode ?? ""),
      productCategory: String(document.productCategory ?? ""),
      editorJson: editorJsonSchema.parse(document.editorJson),
    },
    template: {
      logoAssetPath: String(template.logoAssetPath ?? "/branding/vellore-semicon-logo.svg"),
      companyName: String(template.companyName ?? "Vellore Semicon"),
      website: String(template.website ?? "www.velloresemicon.com"),
      productCode: String(template.productCode ?? document.productCode ?? ""),
      productTitle: String(template.productTitle ?? document.productCategory ?? document.title ?? ""),
      documentStatus: String(template.documentStatus ?? "Preliminary Datasheet"),
      revision: String(template.revision ?? "Rev. A"),
      layoutMode: template.layoutMode === "single-column" ? "single-column" : "two-column",
      layoutDensity: template.layoutDensity === "comfortable" ? "comfortable" : "technical-dense",
      pageFillStrategy: template.pageFillStrategy === "safe" ? "safe" : template.pageFillStrategy === "aggressive" ? "aggressive" : "balanced",
      primaryColor: String(template.primaryColor ?? "#0D2B55"),
      accentColor: String(template.accentColor ?? "#D6533E"),
    },
  };
}

function parseOwnerProjectIds(params: { projectId: string; ownerId: string }) {
  if (!Types.ObjectId.isValid(params.projectId)) throw new AppError("Project not found", 404, { code: "PROJECT_NOT_FOUND" });
  if (!Types.ObjectId.isValid(params.ownerId)) throw new AppError("Authentication required", 401, { code: "AUTHENTICATION_REQUIRED" });
  return { projectObjectId: new Types.ObjectId(params.projectId), ownerObjectId: new Types.ObjectId(params.ownerId) };
}



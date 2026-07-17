import { z } from "zod";

export const DATASHEET_DOCUMENT_STATUSES = ["DRAFT", "READY_FOR_EDIT", "EDITING", "READY_FOR_EXPORT", "EXPORTED"] as const;
export type DatasheetDocumentStatus = (typeof DATASHEET_DOCUMENT_STATUSES)[number];

export const cleanupReasonCodes = [
  "REPEATED_HEADER_TEXT",
  "REPEATED_FOOTER_TEXT",
  "REPEATED_HEADER_IMAGE",
  "REPEATED_FOOTER_IMAGE",
  "PAGE_NUMBER",
  "URL_IN_FOOTER",
  "DATE_REVISION_FOOTER",
  "POSSIBLE_SOURCE_LOGO",
  "LOW_CONFIDENCE",
  "MANUAL_RESTORED",
  "MANUAL_REMOVED"
] as const;

export type CleanupReasonCode = (typeof cleanupReasonCodes)[number];

export const tiptapMarkSchema: z.ZodType<Record<string, unknown>> = z.object({
  type: z.string().min(1),
  attrs: z.record(z.unknown()).optional()
});

export const tiptapNodeSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.unknown()).optional(),
    content: z.array(tiptapNodeSchema).optional(),
    text: z.string().optional(),
    marks: z.array(tiptapMarkSchema).optional()
  })
);

export const editorJsonSchema = z.object({
  type: z.literal("doc"),
  content: z.array(tiptapNodeSchema).default([])
});

export const templateSettingsPatchSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  website: z.string().trim().min(1).max(200).optional(),
  productCode: z.string().trim().max(120).optional(),
  productTitle: z.string().trim().max(200).optional(),
  documentStatus: z.string().trim().max(80).optional(),
  revision: z.string().trim().max(80).optional(),
  layoutMode: z.enum(["two-column", "single-column"]).optional(),
  layoutDensity: z.enum(["comfortable", "technical-dense"]).optional(),
  pageFillStrategy: z.enum(["safe", "balanced", "aggressive"]).optional(),
  pageSize: z.enum(["A4"]).optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  footerText: z.string().trim().max(160).optional(),
  showPageNumbers: z.boolean().optional(),
  logoStorageKey: z.string().trim().max(500).nullable().optional(),
  logoAssetPath: z.string().trim().max(500).optional()
});

export const datasheetPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  productCode: z.string().trim().max(120).optional(),
  productCategory: z.string().trim().max(160).optional(),
  editorJson: editorJsonSchema.optional(),
  status: z.enum(DATASHEET_DOCUMENT_STATUSES).optional()
});

export const datasheetLayoutExportModeSchema = z.enum(["auto", "saved"]);

export const datasheetLayoutBlockSchema = z.object({
  id: z.string().min(1),
  sourceBlockId: z.string().min(1).nullable().optional(),
  kind: z.enum(["html", "table"]),
  blockType: z.enum(["heading", "paragraph", "list", "table", "image", "caption", "section", "rule", "generic", "figure"]),
  column: z.enum(["left", "right", "full"]).default("full"),
  flowSlot: z.number().int().min(0),
  hiddenFromExport: z.boolean().default(false),
  widthPreset: z.enum(["small", "medium", "large", "full", "auto"]).default("auto"),
  keepWithCaption: z.boolean().default(false),
  keepTogether: z.boolean().default(false),
  allowSplit: z.boolean().default(true),
  preventOrphanRows: z.boolean().default(false),
  pageBreakBefore: z.boolean().default(false),
  html: z.string().optional(),
  plainText: z.string().default(""),
  estimatedHeight: z.number().nonnegative().default(0),
  role: z.string().optional(),
  fullWidth: z.boolean().optional(),
  columnEligible: z.boolean().optional(),
  displaySize: z.enum(["small", "medium", "full"]).optional(),
  variantClass: z.string().optional(),
  blockClass: z.string().optional(),
  imageKey: z.string().optional(),
  imageWidth: z.number().nullable().optional(),
  imageHeight: z.number().nullable().optional(),
  aspectRatio: z.number().nullable().optional(),
  headerHtml: z.string().optional(),
  rowHtml: z.array(z.string()).optional(),
  rowHeights: z.array(z.number()).optional(),
});

export const datasheetLayoutPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  usedHeight: z.number().nonnegative().default(0),
  bodyHeight: z.number().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
  blocks: z.array(datasheetLayoutBlockSchema).default([]),
});

export const datasheetLayoutPatchSchema = z.object({
  pages: z.array(datasheetLayoutPageSchema).optional(),
  warnings: z.array(z.string()).optional(),
  exportMode: datasheetLayoutExportModeSchema.optional(),
});

export const cleanupActionSchema = z.object({
  itemId: z.string().min(1)
});

export type TiptapJson = z.infer<typeof editorJsonSchema>;
export type TemplateSettingsPatch = z.infer<typeof templateSettingsPatchSchema>;
export type DatasheetPatch = z.infer<typeof datasheetPatchSchema>;
export type DatasheetLayoutPatch = z.infer<typeof datasheetLayoutPatchSchema>;
export type DatasheetLayoutExportMode = z.infer<typeof datasheetLayoutExportModeSchema>;

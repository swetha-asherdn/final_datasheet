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

export const cleanupActionSchema = z.object({
  itemId: z.string().min(1)
});

export type TiptapJson = z.infer<typeof editorJsonSchema>;
export type TemplateSettingsPatch = z.infer<typeof templateSettingsPatchSchema>;
export type DatasheetPatch = z.infer<typeof datasheetPatchSchema>;

import { z } from "zod";

const isoDatetimeSchema = z.string().datetime({ offset: true });

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
});

export const textBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["heading", "paragraph", "list_item", "header", "footer", "text_block", "unknown_text_block"]),
  text: z.string(),
  pageNumber: z.number().int().positive(),
  boundingBox: boundingBoxSchema,
  fontSize: z.number().nullable().optional(),
  fontFamily: z.string().nullable().optional(),
  fontWeight: z.string().nullable().optional(),
  fontStyle: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
  alignment: z.string().nullable().optional(),
  extractionMethod: z.enum(["native", "ocr"]),
  confidence: z.number().min(0).max(1),
  readingOrderIndex: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([])
});

export const extractedImageSchema = z.object({
  id: z.string().min(1),
  pageNumber: z.number().int().positive(),
  storageKey: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  boundingBox: boundingBoxSchema,
  mimeType: z.string().min(1),
  originalFormat: z.string().nullable().optional(),
  extractionMethod: z.string().min(1),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([])
});

export const tableCellSchema = z.object({ text: z.string(), rowSpan: z.number().int().positive(), colSpan: z.number().int().positive() });

export const extractedTableSchema = z.object({
  id: z.string().min(1),
  type: z.literal("table"),
  pageNumber: z.number().int().positive(),
  boundingBox: boundingBoxSchema,
  rows: z.array(z.array(tableCellSchema)),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["pdfplumber", "camelot"]),
  warnings: z.array(z.string()).default([])
});

export const extractedPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number().int(),
  previewStorageKey: z.string().min(1),
  textBlocks: z.array(textBlockSchema),
  images: z.array(extractedImageSchema),
  tables: z.array(extractedTableSchema),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1)
});

export const extractionManifestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  projectId: z.string().min(1),
  sourceFile: z.object({ storageKey: z.string().min(1), originalFileName: z.string().min(1), checksum: z.string().nullable() }),
  pageCount: z.number().int().nonnegative(),
  processing: z.object({
    startedAt: isoDatetimeSchema,
    completedAt: isoDatetimeSchema,
    durationMs: z.number().int().nonnegative(),
    nativeTextDetected: z.boolean(),
    ocrUsed: z.boolean()
  }),
  summary: z.object({
    textBlockCount: z.number().int().nonnegative(),
    imageCount: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative()
  }),
  pages: z.array(extractedPageSchema),
  warnings: z.array(z.string()).default([])
});

export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type ExtractionManifest = z.infer<typeof extractionManifestSchema>;
export type ExtractedPageManifest = z.infer<typeof extractedPageSchema>;
export type ExtractedImageManifest = z.infer<typeof extractedImageSchema>;
export type ExtractedTableManifest = z.infer<typeof extractedTableSchema>;
export type TextBlockManifest = z.infer<typeof textBlockSchema>;

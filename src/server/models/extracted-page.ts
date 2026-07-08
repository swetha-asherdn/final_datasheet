import { Schema, model, models, type InferSchemaType } from "mongoose";

const boundingBoxSchema = new Schema({ x: Number, y: Number, width: Number, height: Number }, { _id: false });
const textBlockSchema = new Schema(
  {
    id: String,
    type: String,
    text: String,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    fontSize: { type: Number, default: null },
    fontFamily: { type: String, default: null },
    fontWeight: { type: String, default: null },
    fontStyle: { type: String, default: null },
    textColor: { type: String, default: null },
    alignment: { type: String, default: null },
    extractionMethod: String,
    confidence: Number,
    readingOrderIndex: Number,
    warnings: { type: [String], default: [] }
  },
  { _id: false }
);
const imageSchema = new Schema(
  {
    id: String,
    pageNumber: Number,
    storageKey: String,
    width: Number,
    height: Number,
    boundingBox: boundingBoxSchema,
    mimeType: String,
    originalFormat: { type: String, default: null },
    extractionMethod: String,
    confidence: Number,
    warnings: { type: [String], default: [] }
  },
  { _id: false }
);
const tableCellSchema = new Schema({ text: String, rowSpan: Number, colSpan: Number }, { _id: false });
const tableSchema = new Schema(
  {
    id: String,
    type: String,
    pageNumber: Number,
    boundingBox: boundingBoxSchema,
    rows: [[tableCellSchema]],
    confidence: Number,
    extractionMethod: String,
    warnings: { type: [String], default: [] }
  },
  { _id: false }
);

const extractedPageSchema = new Schema(
  {
    extractionRunId: { type: Schema.Types.ObjectId, ref: "ExtractionRun", required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pageNumber: { type: Number, required: true, index: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    rotation: { type: Number, default: 0 },
    previewStorageKey: { type: String, required: true },
    textBlocks: { type: [textBlockSchema], default: [] },
    images: { type: [imageSchema], default: [] },
    tables: { type: [tableSchema], default: [] },
    warnings: { type: [String], default: [] },
    confidence: { type: Number, default: 0 }
  },
  { timestamps: true }
);

extractedPageSchema.index({ extractionRunId: 1, pageNumber: 1 }, { unique: true });

export type ExtractedPageDocument = InferSchemaType<typeof extractedPageSchema> & { _id: unknown };
export const ExtractedPageModel = models.ExtractedPage ?? model("ExtractedPage", extractedPageSchema);

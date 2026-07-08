import { Schema, model, models, type InferSchemaType } from "mongoose";

const extractionRunSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    schemaVersion: { type: String, required: true, default: "1.0" },
    status: { type: String, enum: ["PROCESSING", "COMPLETED", "FAILED"], required: true, default: "PROCESSING", index: true },
    sourceFile: {
      storageKey: { type: String, required: true },
      originalFileName: { type: String, required: true },
      checksum: { type: String, default: null }
    },
    pageCount: { type: Number, required: true, default: 0 },
    summary: {
      textBlockCount: { type: Number, default: 0 },
      imageCount: { type: Number, default: 0 },
      tableCount: { type: Number, default: 0 },
      warningCount: { type: Number, default: 0 },
      ocrUsed: { type: Boolean, default: false },
      nativeTextDetected: { type: Boolean, default: false }
    },
    extractionConfig: {
      ocrLanguages: { type: [String], default: ["eng"] },
      coordinateSystem: { type: String, default: "pdf_points_top_left" }
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    warnings: { type: [String], default: [] },
    errorSummary: { type: String, default: null }
  },
  { timestamps: true }
);

extractionRunSchema.index({ projectId: 1, createdAt: -1 });

export type ExtractionRunDocument = InferSchemaType<typeof extractionRunSchema> & { _id: unknown };
export const ExtractionRunModel = models.ExtractionRun ?? model("ExtractionRun", extractionRunSchema);

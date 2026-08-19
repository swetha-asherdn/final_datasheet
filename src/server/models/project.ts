import { Schema, model, models, type InferSchemaType } from "mongoose";
import { PROJECT_STATUSES } from "@/lib/project-status";

const originalPdfSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    originalFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    pageCount: { type: Number, default: null },
    checksum: { type: String, default: null }
  },
  { _id: false }
);

const extractionSummarySchema = new Schema(
  {
    textBlockCount: { type: Number, default: 0 },
    imageCount: { type: Number, default: 0 },
    tableCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    ocrUsed: { type: Boolean, default: false },
    nativeTextDetected: { type: Boolean, default: false }
  },
  { _id: false }
);

const editableDocxSchema = new Schema(
  {
    storageKey: { type: String, default: null },
    fileSize: { type: Number, default: null },
    lastSavedAt: { type: Date, default: null }
  },
  { _id: false }
);

const projectSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, enum: PROJECT_STATUSES, required: true, default: "DRAFT", index: true },
    originalPdf: { type: originalPdfSchema, required: true },
    editableDocx: { type: editableDocxSchema, default: null },
    latestExtractionRunId: { type: Schema.Types.ObjectId, ref: "ExtractionRun", default: null },
    latestDatasheetDocumentId: { type: Schema.Types.ObjectId, ref: "DatasheetDocument", default: null },
    composerStatus: { type: String, enum: ["NOT_CREATED", "READY_FOR_EDIT", "EDITING", "READY_FOR_EXPORT", "EXPORTED"], default: "NOT_CREATED", index: true },
    templateSummary: {
      productCode: { type: String, default: "" },
      productTitle: { type: String, default: "" },
      revision: { type: String, default: "Rev. A" },
      documentStatus: { type: String, default: "Preliminary Datasheet" }
    },
    pageCount: { type: Number, default: null },
    extractionProgress: { type: Number, required: true, default: 0, min: 0, max: 100 },
    extractionSummary: { type: extractionSummarySchema, default: () => ({}) },
    lastError: { type: String, default: null }
  },
  { timestamps: true }
);

export type ProjectDocument = InferSchemaType<typeof projectSchema> & { _id: unknown };
export const ProjectModel = models.Project ?? model("Project", projectSchema);


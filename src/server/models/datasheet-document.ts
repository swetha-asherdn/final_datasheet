import { Schema, model, models, type InferSchemaType } from "mongoose";
import { DATASHEET_DOCUMENT_STATUSES } from "@/server/datasheet/schema";

const datasheetDocumentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    extractionRunId: { type: Schema.Types.ObjectId, ref: "ExtractionRun", required: true, index: true },
    schemaVersion: { type: String, required: true, default: "1.0" },
    status: { type: String, enum: DATASHEET_DOCUMENT_STATUSES, required: true, default: "READY_FOR_EDIT", index: true },
    templateSettingsId: { type: Schema.Types.ObjectId, ref: "DatasheetTemplateSettings", default: null },
    title: { type: String, required: true, trim: true },
    productCode: { type: String, default: "", trim: true },
    productCategory: { type: String, default: "", trim: true },
    editorJson: { type: Schema.Types.Mixed, required: true },
    sourceCleanupReport: { type: Schema.Types.Mixed, required: true },
    supplierCodeMappings: {
      type: [
        {
          id: { type: String, required: true },
          supplierCode: { type: String, required: true },
          velloreCode: { type: String, required: true },
          pageNumber: { type: Number, default: 1 },
          section: { type: String, default: "body" },
          confidence: { type: Number, default: 1.0 },
          status: { type: String, enum: ["pending", "confirmed", "ignored", "applied"], default: "confirmed" },
        }
      ],
      default: []
    },
    latestReplacementReport: {
      attempted: { type: Number, default: 0 },
      successful: { type: Number, default: 0 },
      keptOriginal: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      warnings: [{ type: String }]
    },
    createdFromExtractionAt: { type: Date, required: true, default: Date.now },
    lastSavedAt: { type: Date, required: true, default: Date.now }
  },
  { timestamps: true }
);

datasheetDocumentSchema.index({ projectId: 1, createdAt: -1 });

export type DatasheetDocumentDocument = InferSchemaType<typeof datasheetDocumentSchema> & { _id: unknown };
export const DatasheetDocumentModel = models.DatasheetDocument ?? model("DatasheetDocument", datasheetDocumentSchema);

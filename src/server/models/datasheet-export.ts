import { Schema, model, models, type InferSchemaType } from "mongoose";

export const DATASHEET_EXPORT_TYPES = ["PDF"] as const;
export const DATASHEET_EXPORT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;

const datasheetExportSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    datasheetDocumentId: { type: Schema.Types.ObjectId, ref: "DatasheetDocument", required: true, index: true },
    type: { type: String, enum: DATASHEET_EXPORT_TYPES, required: true, default: "PDF" },
    status: { type: String, enum: DATASHEET_EXPORT_STATUSES, required: true, default: "PENDING", index: true },
    storageKey: { type: String, default: "" },
    filename: { type: String, required: true },
    fileSize: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    completedAt: { type: Date, default: null },
    metadata: {
      productCode: { type: String, default: "" },
      productTitle: { type: String, default: "" },
      documentStatus: { type: String, default: "" },
      revision: { type: String, default: "" },
      website: { type: String, default: "" },
      primaryColor: { type: String, default: "" },
      accentColor: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

datasheetExportSchema.index({ projectId: 1, createdAt: -1 });
datasheetExportSchema.index({ projectId: 1, ownerId: 1, _id: 1 });

export type DatasheetExportDocument = InferSchemaType<typeof datasheetExportSchema> & { _id: unknown };
export const DatasheetExportModel = models.DatasheetExport ?? model("DatasheetExport", datasheetExportSchema);

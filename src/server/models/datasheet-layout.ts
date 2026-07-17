import { Schema, model, models, type InferSchemaType } from "mongoose";

const datasheetLayoutSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    datasheetDocumentId: { type: Schema.Types.ObjectId, ref: "DatasheetDocument", required: true, index: true },
    schemaVersion: { type: String, required: true, default: "1.0" },
    templateSnapshot: { type: Schema.Types.Mixed, required: true },
    exportMode: { type: String, enum: ["auto", "saved"], required: true, default: "saved" },
    layoutMode: { type: String, enum: ["two-column", "single-column"], required: true, default: "two-column" },
    layoutDensity: { type: String, enum: ["comfortable", "technical-dense"], required: true, default: "technical-dense" },
    pages: { type: [Schema.Types.Mixed], required: true, default: [] },
    warnings: { type: [String], required: true, default: [] },
    lastGeneratedAt: { type: Date, required: true, default: Date.now },
    lastSavedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

datasheetLayoutSchema.index({ projectId: 1, datasheetDocumentId: 1 }, { unique: true });

export type DatasheetLayoutDocument = InferSchemaType<typeof datasheetLayoutSchema> & { _id: unknown };
export const DatasheetLayoutModel = models.DatasheetLayout ?? model("DatasheetLayout", datasheetLayoutSchema);

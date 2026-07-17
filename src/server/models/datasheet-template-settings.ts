import { Schema, model, models, type InferSchemaType } from "mongoose";

const datasheetTemplateSettingsSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    logoStorageKey: { type: String, default: null },
    logoAssetPath: { type: String, required: true, default: "/branding/vellore-semicon-logo.svg" },
    companyName: { type: String, required: true, default: "Vellore Semicon" },
    website: { type: String, required: true, default: "www.velloresemicon.com" },
    productCode: { type: String, default: "" },
    productTitle: { type: String, default: "" },
    documentStatus: { type: String, required: true, default: "Preliminary Datasheet" },
    revision: { type: String, required: true, default: "Rev. A" },
    layoutMode: { type: String, enum: ["two-column", "single-column"], required: true, default: "two-column" },
    layoutDensity: { type: String, enum: ["comfortable", "technical-dense"], required: true, default: "technical-dense" },
    pageFillStrategy: { type: String, enum: ["safe", "balanced", "aggressive"], required: true, default: "balanced" },
    pageSize: { type: String, enum: ["A4"], required: true, default: "A4" },
    orientation: { type: String, enum: ["portrait", "landscape"], required: true, default: "portrait" },
    primaryColor: { type: String, required: true, default: "#0D2B55" },
    accentColor: { type: String, required: true, default: "#D6533E" },
    footerText: { type: String, required: true, default: "Preliminary Datasheet | Rev. A" },
    showPageNumbers: { type: Boolean, required: true, default: true },
    headerConfig: { type: Schema.Types.Mixed, required: true },
    footerConfig: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

datasheetTemplateSettingsSchema.index({ projectId: 1, createdAt: -1 });

export type DatasheetTemplateSettingsDocument = InferSchemaType<typeof datasheetTemplateSettingsSchema> & { _id: unknown };
export const DatasheetTemplateSettingsModel = models.DatasheetTemplateSettings ?? model("DatasheetTemplateSettings", datasheetTemplateSettingsSchema);

import { Schema, model, models, type InferSchemaType } from "mongoose";

const processingJobSchema = new Schema({ projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true, index: true }, queueName: { type: String, required: true, default: "extract-pdf" }, bullJobId: { type: String, default: null }, status: { type: String, enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"], required: true, default: "QUEUED" }, progress: { type: Number, required: true, default: 0, min: 0, max: 100 }, errorSummary: { type: String, default: null }, attempts: { type: Number, required: true, default: 0 } }, { timestamps: true });
export type ProcessingJobDocument = InferSchemaType<typeof processingJobSchema> & { _id: unknown };
export const ProcessingJobModel = models.ProcessingJob ?? model("ProcessingJob", processingJobSchema);

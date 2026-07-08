import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { buildOriginalPdfKey } from "@/lib/storage-key";
import { validatePdf } from "@/lib/pdf-validation";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { ProcessingJobModel } from "@/server/models/processing-job";
import { uploadPrivateObject } from "@/server/storage/s3";
import { getExtractPdfQueue } from "@/server/queue/extract-pdf";
import { retryExtractionForProject } from "@/server/extraction/service";

export const createProjectSchema = z.object({ name: z.string().trim().min(1, "Project name is required").max(120), description: z.string().trim().max(1000).optional().default("") });

export async function createProjectWithUpload(params: { ownerId: string; name: string; description?: string; file: File }) {
  const input = createProjectSchema.parse({ name: params.name, description: params.description ?? "" });
  await connectToDatabase();
  const bytes = Buffer.from(await params.file.arrayBuffer());
  const validation = await validatePdf(params.file.name, params.file.type, bytes);
  const projectId = new Types.ObjectId();
  const storageKey = buildOriginalPdfKey(params.ownerId, String(projectId), params.file.name);
  await uploadPrivateObject({ key: storageKey, body: bytes, contentType: params.file.type, metadata: { ownerId: params.ownerId, projectId: String(projectId) } });
  const project = await ProjectModel.create({
    _id: projectId,
    ownerId: new Types.ObjectId(params.ownerId),
    name: input.name,
    description: input.description,
    status: "QUEUED",
    originalPdf: { storageKey, originalFileName: params.file.name, mimeType: params.file.type, sizeBytes: bytes.length, pageCount: validation.pageCount, checksum: validation.checksum },
    pageCount: validation.pageCount,
    extractionProgress: 0,
    extractionSummary: { textBlockCount: 0, imageCount: 0, tableCount: 0, warningCount: 0, ocrUsed: false, nativeTextDetected: false },
    lastError: null
  });
  await enqueueExtractionJob({ projectId: String(project._id), ownerId: params.ownerId, storageKey });
  return project;
}

export async function enqueueExtractionJob(params: { projectId: string; ownerId: string; storageKey: string }) {
  const existing = await ProcessingJobModel.findOne({ projectId: params.projectId });
  if (existing && ["QUEUED", "PROCESSING"].includes(existing.status)) throw new AppError("This project already has an active processing job", 409, { code: "ACTIVE_EXTRACTION_JOB" });
  const job = await ProcessingJobModel.findOneAndUpdate({ projectId: params.projectId }, { projectId: new Types.ObjectId(params.projectId), queueName: "extract-pdf", status: "QUEUED", progress: 0, errorSummary: null, $inc: { attempts: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await ProjectModel.updateOne({ _id: params.projectId }, { $set: { status: "QUEUED", extractionProgress: 0, lastError: null } });
  const bullJob = await getExtractPdfQueue().add("extract", params, { jobId: params.projectId });
  job.bullJobId = bullJob.id ?? null;
  await job.save();
}

export async function retryProjectJob(projectId: string, ownerId: string) {
  await retryExtractionForProject(projectId, ownerId);
}

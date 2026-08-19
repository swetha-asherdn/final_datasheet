import { Worker, type Job } from "bullmq";
import { Types } from "mongoose";
import { EXTRACT_PDF_QUEUE, getRedisConnection, type ExtractPdfJobData } from "@/server/queue/extract-pdf";
import { connectToDatabase } from "@/server/db";
import { ProjectModel } from "@/server/models/project";
import { ProcessingJobModel } from "@/server/models/processing-job";
import { ExtractionRunModel } from "@/server/models/extraction-run";
import { callPythonExtractionService, callPythonDocxConversionService, createSafeErrorSummary, persistExtractionManifest } from "@/server/extraction/service";

async function updateProgress(projectId: string, progress: number, status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED") {
  const projectStatus = status === "COMPLETED" ? "REVIEW_REQUIRED" : status === "FAILED" ? "FAILED" : status;
  await ProcessingJobModel.updateOne({ projectId: new Types.ObjectId(projectId) }, { $set: { status, progress, errorSummary: null } });
  await ProjectModel.updateOne({ _id: projectId }, { $set: { status: projectStatus, extractionProgress: progress, lastError: null } });
}

export async function processExtractionJob(data: ExtractPdfJobData, job?: Job<ExtractPdfJobData>) {
  await connectToDatabase();
  await updateProgress(data.projectId, 5, "PROCESSING");
  await job?.updateProgress(5);

  const project = await ProjectModel.findOne({ _id: data.projectId, ownerId: new Types.ObjectId(data.ownerId) });
  if (!project) throw new Error("Project not found for extraction job");

  await updateProgress(data.projectId, 10, "PROCESSING");
  await job?.updateProgress(10);

  const run = await ExtractionRunModel.create({
    projectId: project._id,
    ownerId: project.ownerId,
    schemaVersion: "1.0",
    status: "PROCESSING",
    sourceFile: {
      storageKey: project.originalPdf.storageKey,
      originalFileName: project.originalPdf.originalFileName,
      checksum: project.originalPdf.checksum ?? null
    },
    pageCount: project.originalPdf.pageCount ?? 0,
    startedAt: new Date(),
    warnings: [],
    errorSummary: null
  });

  await updateProgress(data.projectId, 20, "PROCESSING");
  await job?.updateProgress(20);

  const manifest = await callPythonExtractionService({
    projectId: data.projectId,
    ownerId: data.ownerId,
    source: {
      storageKey: project.originalPdf.storageKey,
      originalFileName: project.originalPdf.originalFileName,
      mimeType: "application/pdf"
    },
    extractionEngine: data.extractionEngine ?? "native"
  });

  await updateProgress(data.projectId, 70, "PROCESSING");
  await job?.updateProgress(70);
  await persistExtractionManifest({ projectId: data.projectId, ownerId: data.ownerId, manifest });
  
  await updateProgress(data.projectId, 85, "PROCESSING");
  await job?.updateProgress(85);

  try {
    const docxResult = await callPythonDocxConversionService({
      projectId: data.projectId,
      ownerId: data.ownerId,
      source: {
        storageKey: project.originalPdf.storageKey,
        originalFileName: project.originalPdf.originalFileName,
        mimeType: "application/pdf"
      }
    });

    await ProjectModel.updateOne(
      { _id: project._id },
      {
        $set: {
          editableDocx: {
            storageKey: docxResult.storageKey,
            fileSize: docxResult.fileSize,
            lastSavedAt: new Date()
          }
        }
      }
    );
  } catch (docxError) {
    console.error("[worker] PDF to DOCX conversion failed:", docxError);
    await ProjectModel.updateOne(
      { _id: project._id },
      {
        $set: {
          lastError: docxError instanceof Error ? docxError.message : "PDF to DOCX conversion failed"
        }
      }
    );
  }

  await ExtractionRunModel.updateOne({ _id: run._id }, { $set: { status: "COMPLETED", completedAt: new Date(), errorSummary: null } });
  await updateProgress(data.projectId, 100, "COMPLETED");
  await job?.updateProgress(100);
}

export const worker = new Worker<ExtractPdfJobData>(
  EXTRACT_PDF_QUEUE,
  async (job) => {
    await processExtractionJob(job.data, job);
  },
  { connection: getRedisConnection(), concurrency: 2 }
);

export async function handleExtractionFailure(data: ExtractPdfJobData, error: unknown) {
  await connectToDatabase();
  const errorSummary = createSafeErrorSummary(error);
  await ProcessingJobModel.updateOne({ projectId: new Types.ObjectId(data.projectId) }, { $set: { status: "FAILED", errorSummary, progress: 0 } });
  await ProjectModel.updateOne({ _id: data.projectId }, { $set: { status: "FAILED", lastError: errorSummary, extractionProgress: 0 } });
  await ExtractionRunModel.findOneAndUpdate(
    { projectId: new Types.ObjectId(data.projectId), status: "PROCESSING" },
    { $set: { status: "FAILED", completedAt: new Date(), errorSummary } },
    { sort: { createdAt: -1 } }
  );
  console.error("[extraction] project marked FAILED", {
    projectId: data.projectId,
    ownerId: data.ownerId,
    errorSummary
  });
}

worker.on("failed", async (job, error) => {
  if (!job) return;
  await handleExtractionFailure(job.data, error);
});

if (require.main === module) console.log(`Node worker listening on ${EXTRACT_PDF_QUEUE}`);

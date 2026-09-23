import { beforeEach, describe, expect, it, vi } from "vitest";

const workerOnMock = vi.hoisted(() => vi.fn());
const projectFindOneMock = vi.hoisted(() => vi.fn());
const projectUpdateOneMock = vi.hoisted(() => vi.fn(async () => undefined));
const jobUpdateOneMock = vi.hoisted(() => vi.fn(async () => undefined));
const runCreateMock = vi.hoisted(() => vi.fn(async () => ({ _id: "run1" })));
const runFindOneAndUpdateMock = vi.hoisted(() => vi.fn(async () => undefined));
const runUpdateOneMock = vi.hoisted(() => vi.fn(async () => undefined));
const callPythonMock = vi.hoisted(() => vi.fn());
const persistMock = vi.hoisted(() => vi.fn(async () => ({ _id: "run1" })));

vi.mock("bullmq", () => ({ Worker: vi.fn().mockImplementation(() => ({ on: workerOnMock })) }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/models/project", () => ({ ProjectModel: { findOne: projectFindOneMock, updateOne: projectUpdateOneMock } }));
vi.mock("@/server/models/processing-job", () => ({ ProcessingJobModel: { updateOne: jobUpdateOneMock } }));
vi.mock("@/server/models/extraction-run", () => ({ ExtractionRunModel: { create: runCreateMock, updateOne: runUpdateOneMock, findOneAndUpdate: runFindOneAndUpdateMock } }));
vi.mock("@/server/queue/extract-pdf", () => ({ EXTRACT_PDF_QUEUE: "extract-pdf", getRedisConnection: () => ({} as object) }));
vi.mock("@/server/extraction/service", () => ({
  callPythonExtractionService: callPythonMock,
  createSafeErrorSummary: (error: unknown) => (error instanceof Error ? error.message : "Extraction failed"),
  persistExtractionManifest: persistMock
}));

const jobData = { projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000", storageKey: "source.pdf" };
const manifest = { schemaVersion: "1.0", projectId: jobData.projectId, pages: [] };

describe("Node extraction worker", () => {
  beforeEach(() => {
    projectFindOneMock.mockReset();
    projectUpdateOneMock.mockClear();
    jobUpdateOneMock.mockClear();
    runCreateMock.mockClear();
    runFindOneAndUpdateMock.mockClear();
    runUpdateOneMock.mockClear();
    callPythonMock.mockReset();
    persistMock.mockClear();
  });

  it("persists a successful extraction manifest", async () => {
    projectFindOneMock.mockResolvedValue({
      _id: jobData.projectId,
      ownerId: jobData.ownerId,
      originalPdf: { storageKey: jobData.storageKey, originalFileName: "sample.pdf", mimeType: "application/pdf", checksum: null, pageCount: null }
    });
    callPythonMock.mockResolvedValue(manifest);
    const { processExtractionJob } = await import("@/server/queue/worker");
    await processExtractionJob(jobData);
    expect(callPythonMock).toHaveBeenCalledWith(expect.objectContaining({ projectId: jobData.projectId, source: expect.objectContaining({ storageKey: jobData.storageKey }) }));
    expect(persistMock).toHaveBeenCalledWith({ projectId: jobData.projectId, ownerId: jobData.ownerId, manifest });
    expect(projectUpdateOneMock).toHaveBeenCalledWith({ _id: jobData.projectId }, expect.objectContaining({ $set: expect.objectContaining({ status: "REVIEW_REQUIRED", extractionProgress: 100 }) }));
  });

  it("preserves the review-ready state when a stale job reports progress after completion", async () => {
    projectFindOneMock.mockResolvedValue({
      _id: jobData.projectId,
      ownerId: jobData.ownerId,
      status: "REVIEW_REQUIRED",
      latestExtractionRunId: "run1",
      latestDatasheetDocumentId: "doc1",
      originalPdf: { storageKey: jobData.storageKey, originalFileName: "sample.pdf", mimeType: "application/pdf", checksum: null, pageCount: null }
    });
    callPythonMock.mockResolvedValue({ ...manifest, projectId: jobData.projectId, pages: [] });

    const { processExtractionJob } = await import("@/server/queue/worker");
    await processExtractionJob(jobData);

    const hasProcessingUpdate = projectUpdateOneMock.mock.calls.some((call: any) => JSON.stringify(call?.[1] ?? {}).includes('\"status\":\"PROCESSING\"'));
    expect(hasProcessingUpdate).toBe(false);
    expect(projectUpdateOneMock).toHaveBeenCalledWith({ _id: jobData.projectId }, expect.objectContaining({ $set: expect.objectContaining({ status: "REVIEW_REQUIRED" }) }));
  });

  it("marks project and job failed when extraction fails", async () => {
    const { handleExtractionFailure } = await import("@/server/queue/worker");
    await handleExtractionFailure(jobData, new Error("Python worker unavailable"));
    expect(jobUpdateOneMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED", errorSummary: "Python worker unavailable" }) }));
    expect(projectUpdateOneMock).toHaveBeenCalledWith({ _id: jobData.projectId }, expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED", lastError: "Python worker unavailable" }) }));
  });

  it("marks project failed when manifest validation fails", async () => {
    const { handleExtractionFailure } = await import("@/server/queue/worker");
    await handleExtractionFailure(jobData, new Error("Extraction manifest validation failed"));
    expect(jobUpdateOneMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED", errorSummary: "Extraction manifest validation failed", progress: 0 }) })
    );
    expect(projectUpdateOneMock).toHaveBeenCalledWith(
      { _id: jobData.projectId },
      expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED", lastError: "Extraction manifest validation failed", extractionProgress: 0 }) })
    );
  });
});

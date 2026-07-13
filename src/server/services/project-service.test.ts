import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocumentMock = vi.hoisted(() => vi.fn());
const uploadPrivateObjectMock = vi.hoisted(() => vi.fn(async () => undefined));
const addToQueueMock = vi.hoisted(() => vi.fn(async () => ({ id: "bull-job-1" })));
const createProjectMock = vi.hoisted(() => vi.fn(async (doc: Record<string, unknown>) => doc));
const updateProjectMock = vi.hoisted(() => vi.fn(async () => undefined));
const findJobMock = vi.hoisted(() => vi.fn(async () => null));
const saveJobMock = vi.hoisted(() => vi.fn(async () => undefined));
const findJobAndUpdateMock = vi.hoisted(() => vi.fn(async () => ({ bullJobId: null, save: saveJobMock })));
const retryExtractionForProjectMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: getDocumentMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/storage/s3", () => ({ uploadPrivateObject: uploadPrivateObjectMock }));
vi.mock("@/server/queue/extract-pdf", () => ({ getExtractPdfQueue: () => ({ add: addToQueueMock }) }));
vi.mock("@/server/extraction/service", () => ({ retryExtractionForProject: retryExtractionForProjectMock }));
vi.mock("@/server/models/project", () => ({ ProjectModel: { create: createProjectMock, updateOne: updateProjectMock } }));
vi.mock("@/server/models/processing-job", () => ({ ProcessingJobModel: { findOne: findJobMock, findOneAndUpdate: findJobAndUpdateMock } }));

describe("createProjectWithUpload", () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
    uploadPrivateObjectMock.mockClear();
    addToQueueMock.mockClear();
    createProjectMock.mockClear();
    updateProjectMock.mockClear();
    findJobMock.mockClear();
    findJobAndUpdateMock.mockClear();
    saveJobMock.mockClear();
    retryExtractionForProjectMock.mockClear();
  });

  it("continues project creation when page-count extraction fails", async () => {
    getDocumentMock.mockImplementation(() => ({ promise: Promise.reject(new Error("Unexpected server PDF.js failure")) }));
    const { createProjectWithUpload } = await import("@/server/services/project-service");
    const file = new File([Buffer.from("%PDF-1.7\nphase1")], "sample.pdf", { type: "application/pdf" });

    const project = await createProjectWithUpload({ ownerId: "64f000000000000000000000", name: "Datasheet", description: "Phase 1 validation", file });

    expect(project).toEqual(expect.objectContaining({ _id: expect.anything() }));
    expect(uploadPrivateObjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock).toHaveBeenCalledWith(expect.objectContaining({ originalPdf: expect.objectContaining({ originalFileName: "sample.pdf", pageCount: null, mimeType: "application/pdf" }) }));
    expect(addToQueueMock).toHaveBeenCalledWith("extract", expect.objectContaining({ ownerId: "64f000000000000000000000" }), { jobId: expect.any(String) });
    expect(saveJobMock).toHaveBeenCalledTimes(1);
  }, 10000);

  it("delegates retry eligibility to the extraction service", async () => {
    const { retryProjectJob } = await import("@/server/services/project-service");
    await retryProjectJob("64f000000000000000000001", "64f000000000000000000000");
    expect(retryExtractionForProjectMock).toHaveBeenCalledWith("64f000000000000000000001", "64f000000000000000000000");
  });
});

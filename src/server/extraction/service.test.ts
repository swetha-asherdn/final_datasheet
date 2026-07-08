import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindOneMock = vi.hoisted(() => vi.fn());
const projectExistsMock = vi.hoisted(() => vi.fn());
const projectUpdateOneMock = vi.hoisted(() => vi.fn(async () => undefined));
const extractionRunFindOneMock = vi.hoisted(() => vi.fn());
const extractedPageFindMock = vi.hoisted(() => vi.fn());
const extractedPageFindOneMock = vi.hoisted(() => vi.fn());
const extractedPageCountDocumentsMock = vi.hoisted(() => vi.fn());
const getPrivateObjectMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/models/project", () => ({ ProjectModel: { findOne: projectFindOneMock, exists: projectExistsMock, updateOne: projectUpdateOneMock } }));
vi.mock("@/server/models/extraction-run", () => ({ ExtractionRunModel: { findOne: extractionRunFindOneMock } }));
vi.mock("@/server/models/extracted-page", () => ({ ExtractedPageModel: { find: extractedPageFindMock, findOne: extractedPageFindOneMock, countDocuments: extractedPageCountDocumentsMock } }));
vi.mock("@/server/models/processing-job", () => ({ ProcessingJobModel: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock("@/server/storage/s3", () => ({ getPrivateObject: getPrivateObjectMock }));
vi.mock("@/server/queue/extract-pdf", () => ({ getExtractPdfQueue: () => ({ add: vi.fn() }) }));

const projectId = "64f000000000000000000001";
const ownerId = "64f000000000000000000000";
const runRecord = {
  _id: "run1",
  projectId,
  ownerId,
  schemaVersion: "1.0",
  status: "COMPLETED",
  sourceFile: { storageKey: "users/u/projects/p/original/file.pdf", originalFileName: "file.pdf", checksum: null },
  pageCount: 1,
  summary: { textBlockCount: 1, imageCount: 1, tableCount: 0, warningCount: 0, ocrUsed: false, nativeTextDetected: true },
  extractionConfig: { ocrLanguages: ["eng"], coordinateSystem: "pdf_points_top_left" },
  startedAt: new Date("2026-07-08T14:30:12.345Z"),
  completedAt: new Date("2026-07-08T14:30:13.456Z"),
  durationMs: 1111,
  warnings: [],
  errorSummary: null,
  createdAt: new Date("2026-07-08T14:30:12.345Z"),
  updatedAt: new Date("2026-07-08T14:30:13.456Z")
};

const extractedPageRecord = {
  _id: "page1",
  pageNumber: 1,
  width: 612,
  height: 792,
  rotation: 0,
  previewStorageKey: "users/u/projects/p/previews/page-1.jpg",
  textBlocks: [],
  images: [
    {
      id: "image-1",
      pageNumber: 1,
      storageKey: "users/u/projects/p/extracted/images/page-1/image-1.png",
      width: 320,
      height: 180,
      boundingBox: { x: 0, y: 0, width: 320, height: 180 },
      mimeType: "image/png",
      extractionMethod: "pymupdf",
      confidence: 0.85,
      warnings: []
    }
  ],
  tables: [],
  warnings: [],
  confidence: 0.92
};

function createStream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}

function mockLeanQuery(mock: ReturnType<typeof vi.fn>, value: unknown) {
  mock.mockReturnValue({ lean: vi.fn().mockResolvedValue(value) });
}

function mockSortedLeanQuery(mock: ReturnType<typeof vi.fn>, value: unknown) {
  mock.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });
}

function mockFindPages(value: unknown) {
  extractedPageFindMock.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      skip: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(value)
        })
      })
    })
  });
}

describe("extraction artifact URLs and proxies", () => {
  beforeEach(() => {
    projectFindOneMock.mockReset();
    projectExistsMock.mockReset();
    projectUpdateOneMock.mockClear();
    extractionRunFindOneMock.mockReset();
    extractedPageFindMock.mockReset();
    extractedPageFindOneMock.mockReset();
    extractedPageCountDocumentsMock.mockReset();
    getPrivateObjectMock.mockReset();
  });

  it("returns browser-safe preview URLs in extraction summary", async () => {
    mockLeanQuery(projectFindOneMock, { _id: projectId });
    mockSortedLeanQuery(extractionRunFindOneMock, runRecord);
    mockFindPages([extractedPageRecord]);
    extractedPageCountDocumentsMock.mockResolvedValue(1);

    const { getExtractionForProject } = await import("@/server/extraction/service");
    const result = await getExtractionForProject({ projectId, ownerId, page: 1, pageSize: 8 });

    expect(result?.pages[0]?.previewUrl).toBe(`/api/projects/${projectId}/artifacts/pages/1/preview`);
  });

  it("returns browser-safe preview and image URLs for extraction page detail", async () => {
    projectExistsMock.mockResolvedValue(true);
    mockSortedLeanQuery(extractionRunFindOneMock, runRecord);
    mockLeanQuery(extractedPageFindOneMock, extractedPageRecord);

    const { getExtractionPageForProject } = await import("@/server/extraction/service");
    const result = await getExtractionPageForProject({ projectId, ownerId, pageNumber: 1 });

    expect(result?.page.previewUrl).toBe(`/api/projects/${projectId}/artifacts/pages/1/preview`);
    expect(result?.page.images[0]?.url).toBe(`/api/projects/${projectId}/artifacts/pages/1/images/image-1`);
  });

  it("streams a known preview artifact with its content type", async () => {
    mockLeanQuery(extractedPageFindOneMock, extractedPageRecord);
    getPrivateObjectMock.mockResolvedValue({ body: createStream("jpg"), contentType: "image/jpeg", contentLength: 3 });

    const { getPagePreviewArtifactForProject } = await import("@/server/extraction/service");
    const artifact = await getPagePreviewArtifactForProject({ projectId, ownerId, pageNumber: 1 });

    expect(getPrivateObjectMock).toHaveBeenCalledWith("users/u/projects/p/previews/page-1.jpg");
    expect(artifact?.contentType).toBe("image/jpeg");
    expect(artifact?.contentLength).toBe(3);
  });

  it("returns null for an unknown extracted image artifact", async () => {
    mockLeanQuery(extractedPageFindOneMock, { ...extractedPageRecord, images: [] });

    const { getExtractedImageArtifactForProject } = await import("@/server/extraction/service");
    const artifact = await getExtractedImageArtifactForProject({ projectId, ownerId, pageNumber: 1, imageId: "missing-image" });

    expect(artifact).toBeNull();
  });
});

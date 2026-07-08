import { describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000", email: "owner@example.com" }));
const getExtractedImageArtifactForProjectMock = vi.fn<() => Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength?: number; cacheControl: string; } | null>>(async () => null);

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/extraction/service", () => ({ getExtractedImageArtifactForProject: getExtractedImageArtifactForProjectMock }));

function createStream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}

describe("GET /api/projects/[projectId]/artifacts/pages/[pageNumber]/images/[imageId]", () => {
  it("rejects unknown artifact keys", async () => {
    getExtractedImageArtifactForProjectMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/projects/[projectId]/artifacts/pages/[pageNumber]/images/[imageId]/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/artifacts/pages/1/images/missing-image"), { params: Promise.resolve({ projectId: "64f000000000000000000001", pageNumber: "1", imageId: "missing-image" }) });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("ARTIFACT_NOT_FOUND");
  });

  it("streams a known extracted image with the correct content type", async () => {
    getExtractedImageArtifactForProjectMock.mockResolvedValueOnce({ body: createStream("png"), contentType: "image/png", contentLength: 3, cacheControl: "private, max-age=60" });
    const { GET } = await import("@/app/api/projects/[projectId]/artifacts/pages/[pageNumber]/images/[imageId]/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/artifacts/pages/1/images/image-1"), { params: Promise.resolve({ projectId: "64f000000000000000000001", pageNumber: "1", imageId: "image-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("png");
  });
});


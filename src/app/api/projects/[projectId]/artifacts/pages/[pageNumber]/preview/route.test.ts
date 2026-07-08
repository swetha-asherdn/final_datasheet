import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000", email: "owner@example.com" }));
const getPagePreviewArtifactForProjectMock = vi.fn<() => Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength?: number; cacheControl: string; } | null>>(async () => null);

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/extraction/service", () => ({ getPagePreviewArtifactForProject: getPagePreviewArtifactForProjectMock }));

function createStream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}

describe("GET /api/projects/[projectId]/artifacts/pages/[pageNumber]/preview", () => {
  it("rejects unauthenticated access", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { GET } = await import("@/app/api/projects/[projectId]/artifacts/pages/[pageNumber]/preview/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/artifacts/pages/1/preview"), { params: Promise.resolve({ projectId: "64f000000000000000000001", pageNumber: "1" }) });
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Authentication required");
  });

  it("rejects non-owner access with not found", async () => {
    getPagePreviewArtifactForProjectMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/projects/[projectId]/artifacts/pages/[pageNumber]/preview/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/artifacts/pages/1/preview"), { params: Promise.resolve({ projectId: "64f000000000000000000001", pageNumber: "1" }) });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("ARTIFACT_NOT_FOUND");
  });

  it("streams a known preview with the correct content type", async () => {
    getPagePreviewArtifactForProjectMock.mockResolvedValueOnce({ body: createStream("jpg"), contentType: "image/jpeg", contentLength: 3, cacheControl: "private, max-age=60" });
    const { GET } = await import("@/app/api/projects/[projectId]/artifacts/pages/[pageNumber]/preview/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/artifacts/pages/1/preview"), { params: Promise.resolve({ projectId: "64f000000000000000000001", pageNumber: "1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("jpg");
  });
});


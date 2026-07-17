import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const getPreviewMock = vi.fn(async () => "<html><body><section class=\"pdf-page\"></section></body></html>");

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/export-service", () => ({ getPdfExportHtmlPreviewForProject: getPreviewMock }));

describe("GET /api/projects/[projectId]/datasheet/export/preview", () => {
  it("requires authentication", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/export/preview/route");
    const response = await GET(new Request("http://localhost/api/projects/p/datasheet/export/preview"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(401);
  });

  it("returns owner-protected HTML preview output", async () => {
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/export/preview/route");
    const response = await GET(new Request("http://localhost/api/projects/p/datasheet/export/preview"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getPreviewMock).toHaveBeenCalledWith({ projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000", preferredMode: undefined });
    expect(body).toContain('class="pdf-page"');
  });

  it("passes explicit preview mode through to the export service", async () => {
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/export/preview/route");
    getPreviewMock.mockClear();

    await GET(new Request("http://localhost/api/projects/p/datasheet/export/preview?mode=auto"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });
    await GET(new Request("http://localhost/api/projects/p/datasheet/export/preview?mode=saved"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(getPreviewMock).toHaveBeenNthCalledWith(1, { projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000", preferredMode: "auto" });
    expect(getPreviewMock).toHaveBeenNthCalledWith(2, { projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000", preferredMode: "saved" });
  });
});



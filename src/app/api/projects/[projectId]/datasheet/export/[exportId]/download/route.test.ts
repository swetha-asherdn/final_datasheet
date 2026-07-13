import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const getDownloadMock = vi.fn(async () => ({
  body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([37, 80, 68, 70])); controller.close(); } }),
  contentType: "application/pdf",
  contentLength: 4,
  filename: "vellore-semicon-test.pdf"
}));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/export-service", () => ({ getPdfExportDownloadForProject: getDownloadMock }));

describe("GET /api/projects/[projectId]/datasheet/export/[exportId]/download", () => {
  it("requires owner authentication", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/export/[exportId]/download/route");
    const response = await GET(new Request("http://localhost/api/projects/p/datasheet/export/e/download"), { params: Promise.resolve({ projectId: "64f000000000000000000001", exportId: "64f000000000000000000002" }) });

    expect(response.status).toBe(401);
  });

  it("streams a completed PDF with download headers", async () => {
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/export/[exportId]/download/route");
    const response = await GET(new Request("http://localhost/api/projects/p/datasheet/export/e/download"), { params: Promise.resolve({ projectId: "64f000000000000000000001", exportId: "64f000000000000000000002" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(getDownloadMock).toHaveBeenCalledWith({ projectId: "64f000000000000000000001", exportId: "64f000000000000000000002", ownerId: "64f000000000000000000000" });
  });
});

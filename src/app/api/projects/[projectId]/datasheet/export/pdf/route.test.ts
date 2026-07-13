import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const createPdfExportMock = vi.fn(async () => ({ id: "export1", status: "COMPLETED", filename: "vellore-semicon-test.pdf" }));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/export-service", () => ({ createPdfExportForProject: createPdfExportMock }));

describe("POST /api/projects/[projectId]/datasheet/export/pdf", () => {
  it("requires authentication", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/export/pdf/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/export/pdf", { method: "POST" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(401);
  });

  it("fails clearly when no datasheet document exists", async () => {
    createPdfExportMock.mockRejectedValueOnce(new AppError("Create an editable datasheet before exporting PDF", 400, { code: "DATASHEET_REQUIRED" }));
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/export/pdf/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/export/pdf", { method: "POST" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("DATASHEET_REQUIRED");
  });

  it("creates a PDF export for the owner", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/export/pdf/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/export/pdf", { method: "POST" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(201);
    expect(createPdfExportMock).toHaveBeenCalledWith({ projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000" });
  });
});

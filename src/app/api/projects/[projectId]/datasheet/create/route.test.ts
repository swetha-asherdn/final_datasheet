import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const createDatasheetMock = vi.fn(async () => ({ document: { id: "doc1" }, template: { id: "tpl1" } }));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/service", () => ({ createDatasheetFromExtraction: createDatasheetMock }));

describe("POST /api/projects/[projectId]/datasheet/create", () => {
  it("requires authentication", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/create/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/create", { method: "POST", body: "{}" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(401);
  });

  it("surfaces extraction-required failures", async () => {
    createDatasheetMock.mockRejectedValueOnce(new AppError("Create an editable datasheet after extraction completes", 409, { code: "EXTRACTION_REQUIRED" }));
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/create/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/create", { method: "POST", body: "{}" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("EXTRACTION_REQUIRED");
  });

  it("creates or returns an idempotent datasheet for the owner", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/create/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/create", { method: "POST", body: "{}" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(201);
    expect(createDatasheetMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "64f000000000000000000000", force: false }));
  });
});

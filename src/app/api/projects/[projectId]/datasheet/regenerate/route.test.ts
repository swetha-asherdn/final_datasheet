import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const regenerateDatasheetMock = vi.fn(async () => ({
  document: { id: "doc1" },
  template: { id: "tpl1" },
  qualitySummary: { sectionsDetected: 12, tablesDetected: 5, figuresDetected: 3, warningsCount: 2, unresolvedSymbolsCount: 0, warnings: [] }
}));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/service", () => ({ regenerateDatasheetFromExtraction: regenerateDatasheetMock }));

describe("POST /api/projects/[projectId]/datasheet/regenerate", () => {
  it("requires authentication", async () => {
    requireUserMock.mockRejectedValueOnce(new AppError("Authentication required", 401));
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/regenerate/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/regenerate", { method: "POST" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(401);
  });

  it("regenerates the datasheet draft for the owner", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/datasheet/regenerate/route");
    const response = await POST(new Request("http://localhost/api/projects/p/datasheet/regenerate", { method: "POST" }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(200);
    expect(regenerateDatasheetMock).toHaveBeenCalledWith({ projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000" });
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ qualitySummary: expect.objectContaining({ sectionsDetected: 12 }) }));
  });
});
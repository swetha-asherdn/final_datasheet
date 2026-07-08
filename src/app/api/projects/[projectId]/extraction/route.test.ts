import { describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000", email: "owner@example.com" }));
const getExtractionForProjectMock = vi.fn(async () => null);

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/extraction/service", () => ({ getExtractionForProject: getExtractionForProjectMock }));

describe("GET /api/projects/[projectId]/extraction", () => {
  it("uses the authenticated owner id and returns 404 when project is not owned", async () => {
    const { GET } = await import("@/app/api/projects/[projectId]/extraction/route");
    const response = await GET(new Request("http://localhost/api/projects/64f000000000000000000001/extraction"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });
    const body = (await response.json()) as { error: { code: string } };
    expect(response.status).toBe(404);
    expect(body.error.code).toBe("PROJECT_NOT_FOUND");
    expect(getExtractionForProjectMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "64f000000000000000000000" }));
  });
});

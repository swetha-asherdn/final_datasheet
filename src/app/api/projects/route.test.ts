import { describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000", email: "admin@example.com" }));
const createProjectMock = vi.fn(async () => ({ _id: "64f000000000000000000001" }));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/server/repositories/projects", () => ({ listProjects: vi.fn() }));
vi.mock("@/server/services/project-service", () => ({ createProjectWithUpload: createProjectMock }));

describe("POST /api/projects", () => {
  it("accepts multipart project creation and returns the new project id", async () => {
    const { POST } = await import("@/app/api/projects/route");
    const form = new FormData();
    const file = new File([Buffer.from("%PDF-1.7")], "sample.pdf", { type: "application/pdf" });
    form.set("name", "Datasheet");
    form.set("description", "Phase 1 test");
    form.set("file", file);

    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: form }));
    const body = (await response.json()) as { id: string };

    expect(response.status).toBe(201);
    expect(body.id).toBe("64f000000000000000000001");
    expect(requireUserMock).toHaveBeenCalled();
    expect(createProjectMock).toHaveBeenCalledWith(expect.objectContaining({ name: "Datasheet", description: "Phase 1 test", file: expect.any(File) }));
  });
});
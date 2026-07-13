import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const updateTemplateMock = vi.fn(async () => ({ document: { id: "doc1" }, template: { id: "tpl1" } }));

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/service", () => ({ updateTemplateForProject: updateTemplateMock }));

describe("PATCH /api/projects/[projectId]/datasheet/template", () => {
  it("rejects invalid template payloads", async () => {
    updateTemplateMock.mockRejectedValueOnce(new ZodError([]));
    const { PATCH } = await import("@/app/api/projects/[projectId]/datasheet/template/route");
    const response = await PATCH(new Request("http://localhost/api/projects/p/datasheet/template", { method: "PATCH", body: JSON.stringify({ primaryColor: "navy" }) }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(422);
  });
});

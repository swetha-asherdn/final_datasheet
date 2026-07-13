import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { editorJsonSchema } from "@/server/datasheet/schema";

const requireUserMock = vi.fn(async () => ({ id: "64f000000000000000000000" }));
const getDatasheetMock = vi.fn(async () => ({ document: { id: "doc1" }, template: { id: "tpl1" } }));
const updateDatasheetMock = vi.fn(async ({ input }: { input: unknown }) => {
  editorJsonSchema.parse((input as { editorJson?: unknown }).editorJson);
  return { document: { id: "doc1" }, template: { id: "tpl1" } };
});

vi.mock("@/server/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/server/db", () => ({ connectToDatabase: vi.fn(async () => undefined) }));
vi.mock("@/server/datasheet/service", () => ({ getDatasheetForProject: getDatasheetMock, updateDatasheetForProject: updateDatasheetMock }));

describe("/api/projects/[projectId]/datasheet", () => {
  it("uses owner protection when getting a datasheet", async () => {
    const { GET } = await import("@/app/api/projects/[projectId]/datasheet/route");
    const response = await GET(new Request("http://localhost/api/projects/p/datasheet"), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(200);
    expect(getDatasheetMock).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "64f000000000000000000000" }));
  });

  it("rejects invalid editor JSON", async () => {
    updateDatasheetMock.mockRejectedValueOnce(new ZodError([]));
    const { PATCH } = await import("@/app/api/projects/[projectId]/datasheet/route");
    const response = await PATCH(new Request("http://localhost/api/projects/p/datasheet", { method: "PATCH", body: JSON.stringify({ editorJson: { type: "paragraph" } }) }), { params: Promise.resolve({ projectId: "64f000000000000000000001" }) });

    expect(response.status).toBe(422);
  });
});

import { describe, expect, it } from "vitest";
import { assertProjectStatusTransition, canTransitionProjectStatus } from "@/lib/project-status";
describe("project status transitions", () => { it("allows the upload to review flow", () => { expect(canTransitionProjectStatus("UPLOADED", "QUEUED")).toBe(true); expect(canTransitionProjectStatus("QUEUED", "PROCESSING")).toBe(true); expect(canTransitionProjectStatus("PROCESSING", "REVIEW_REQUIRED")).toBe(true); }); it("blocks invalid jumps", () => { expect(() => assertProjectStatusTransition("DRAFT", "COMPLETED")).toThrow(/invalid/i); }); });

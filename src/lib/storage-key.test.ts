import { describe, expect, it } from "vitest";
import { buildExtractedImageKey, buildOriginalPdfKey, buildPreviewKey, sanitizeFileName } from "@/lib/storage-key";

describe("storage key helpers", () => {
  it("sanitizes unsafe file names", () => {
    expect(sanitizeFileName(" ACME datasheet (rev 1).pdf ")).toBe("ACME-datasheet-rev-1-.pdf");
  });

  it("builds deterministic original pdf keys", () => {
    expect(buildOriginalPdfKey("user1", "project1", "chip spec.pdf")).toBe("users/user1/projects/project1/original/chip-spec.pdf");
  });

  it("builds deterministic Phase 2 artifact keys", () => {
    expect(buildPreviewKey("user1", "project1", 3)).toBe("users/user1/projects/project1/previews/page-3.jpg");
    expect(buildExtractedImageKey("user1", "project1", 3, "image 1")).toBe("users/user1/projects/project1/extracted/images/page-3/image-1.png");
  });
});

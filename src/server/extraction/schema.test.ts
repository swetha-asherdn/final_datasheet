import { describe, expect, it } from "vitest";
import { extractionManifestSchema } from "@/server/extraction/schema";

const manifest = {
  schemaVersion: "1.0",
  projectId: "64f000000000000000000001",
  sourceFile: { storageKey: "users/u/projects/p/original/file.pdf", originalFileName: "file.pdf", checksum: null },
  pageCount: 1,
  processing: { startedAt: "2026-07-07T10:00:00.000Z", completedAt: "2026-07-07T10:00:02.000Z", durationMs: 2000, nativeTextDetected: true, ocrUsed: false },
  summary: { textBlockCount: 1, imageCount: 0, tableCount: 0, warningCount: 0 },
  pages: [
    {
      pageNumber: 1,
      width: 612,
      height: 792,
      rotation: 0,
      previewStorageKey: "users/u/projects/p/previews/page-1.jpg",
      textBlocks: [
        {
          id: "p1-text-0",
          type: "paragraph",
          text: "Hello PDF",
          pageNumber: 1,
          boundingBox: { x: 10, y: 20, width: 100, height: 20 },
          extractionMethod: "native",
          confidence: 0.92,
          readingOrderIndex: 0,
          warnings: []
        }
      ],
      images: [],
      tables: [],
      warnings: [],
      confidence: 0.9
    }
  ],
  warnings: []
};

describe("extraction manifest schema", () => {
  it("accepts a valid manifest", () => {
    expect(extractionManifestSchema.parse(manifest).pageCount).toBe(1);
  });

  it("accepts Python-style UTC datetimes serialized with Z", () => {
    const parsed = extractionManifestSchema.parse({
      ...manifest,
      processing: {
        ...manifest.processing,
        startedAt: "2026-07-08T14:30:12.345Z",
        completedAt: "2026-07-08T14:30:13.456Z"
      }
    });

    expect(parsed.processing.startedAt).toBe("2026-07-08T14:30:12.345Z");
  });

  it("accepts offset datetimes from Python and allows later normalization", () => {
    const parsed = extractionManifestSchema.parse({
      ...manifest,
      processing: {
        ...manifest.processing,
        startedAt: "2026-07-08T14:30:12.345+00:00",
        completedAt: "2026-07-08T14:30:13.456+00:00"
      }
    });

    expect(parsed.processing.completedAt).toBe("2026-07-08T14:30:13.456+00:00");
  });

  it("rejects unsupported schema versions", () => {
    expect(() => extractionManifestSchema.parse({ ...manifest, schemaVersion: "2.0" })).toThrow();
  });
});

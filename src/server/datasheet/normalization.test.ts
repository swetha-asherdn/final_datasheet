import { describe, expect, it } from "vitest";
import { normalizeDatasheetExtraction, convertToTiptapJson, type NormalizablePage } from "@/server/datasheet/normalization";

function basePage(pageNumber: number, overrides: Partial<NormalizablePage> = {}): NormalizablePage {
  return {
    pageNumber,
    width: 595,
    height: 842,
    textBlocks: [
      { id: `header-${pageNumber}`, pageNumber, text: "SOURCE COMPANY", boundingBox: { x: 30, y: 30, width: 180, height: 18 }, fontSize: 10, confidence: 0.9, readingOrderIndex: 0 },
      { id: `title-${pageNumber}`, pageNumber, text: pageNumber === 1 ? "GENERIC POWER REGULATOR" : "Electrical Characteristics", boundingBox: { x: 50, y: pageNumber === 1 ? 120 : 110, width: 360, height: 22 }, fontSize: pageNumber === 1 ? 18 : 15, confidence: 0.92, readingOrderIndex: 1 },
      { id: `body-${pageNumber}`, pageNumber, text: "Operating voltage supports industrial temperature ranges.", boundingBox: { x: 50, y: 180, width: 420, height: 40 }, fontSize: 10, confidence: 0.93, readingOrderIndex: 2 },
      { id: `url-${pageNumber}`, pageNumber, text: "www.source-example.com", boundingBox: { x: 30, y: 805, width: 200, height: 16 }, fontSize: 8, confidence: 0.88, readingOrderIndex: 3 },
      { id: `page-${pageNumber}`, pageNumber, text: String(pageNumber), boundingBox: { x: 290, y: 805, width: 20, height: 16 }, fontSize: 8, confidence: 0.88, readingOrderIndex: 4 }
    ],
    images: [
      { id: `logo-${pageNumber}`, pageNumber, storageKey: `users/u/projects/project-1/extracted/images/page-${pageNumber}/logo.png`, width: 120, height: 40, boundingBox: { x: 34, y: 20, width: 120, height: 40 }, mimeType: "image/png", confidence: 0.8 },
      { id: `diagram-${pageNumber}`, pageNumber, storageKey: `users/u/projects/project-1/extracted/images/page-${pageNumber}/diagram.png`, width: 460, height: 220, boundingBox: { x: 55, y: 310, width: 460, height: 220 }, mimeType: "image/png", confidence: 0.86 }
    ],
    tables: [
      { id: `table-${pageNumber}`, pageNumber, confidence: 0.8, boundingBox: { x: 60, y: 420, width: 300, height: 80 }, rows: [[{ text: "Parameter" }, { text: "Value" }], [{ text: "VIN" }, { text: "5 V" }]] }
    ],
    ...overrides
  };
}

describe("generic datasheet normalization", () => {
  it("removes repeated header/footer branding without vendor-specific strings", () => {
    const normalized = normalizeDatasheetExtraction([basePage(1), basePage(2), basePage(3)]);
    const removedText = normalized.cleanupReport.removedTextBlocks.map((item) => item.text);

    expect(removedText).toContain("SOURCE COMPANY");
    expect(removedText).toContain("www.source-example.com");
    expect(normalized.cleanupReport.reasonCodes).toContain("REPEATED_HEADER_TEXT");
    expect(normalized.cleanupReport.reasonCodes).toContain("URL_IN_FOOTER");
  });

  it("splits combined repeated header text into product code and title/category", () => {
    const pages = [1, 2, 3].map((pageNumber) => basePage(pageNumber, {
      textBlocks: [
        { id: `combined-${pageNumber}`, pageNumber, text: "CW29150R-XX/CW29150R-ADJ/CW29151R-XX Low-Dropout Regulators", boundingBox: { x: 250, y: 28, width: 290, height: 18 }, fontSize: 10, readingOrderIndex: 0 },
        { id: `status-${pageNumber}`, pageNumber, text: "Preliminary Datasheet", boundingBox: { x: 320, y: 48, width: 170, height: 14 }, fontSize: 9, readingOrderIndex: 1 },
        { id: `bad-row-${pageNumber}`, pageNumber, text: "Regulator Output Current Shutdown", boundingBox: { x: 55, y: 210, width: 260, height: 18 }, fontSize: 10, readingOrderIndex: 2 },
        { id: `bad-row-two-${pageNumber}`, pageNumber, text: "Output Leakage Current", boundingBox: { x: 55, y: 238, width: 220, height: 18 }, fontSize: 10, readingOrderIndex: 3 }
      ],
      images: [],
      tables: []
    }));

    const normalized = normalizeDatasheetExtraction(pages);

    expect(normalized.productCode).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(normalized.productCategory).toBe("Low-Dropout Regulators");
    expect(normalized.title).toBe("Low-Dropout Regulators");
    expect(normalized.productCategory).not.toBe("Regulator Output Current Shutdown");
    expect(normalized.productCategory).not.toBe("Output Leakage Current");
    expect(normalized.documentStatus).toBe("Preliminary Datasheet");
  });

  it("does not derive revision from noisy body text and keeps status separate", () => {
    const pages = [1, 2, 3].map((pageNumber) => basePage(pageNumber, {
      textBlocks: [
        { id: `combined-${pageNumber}`, pageNumber, text: "CW29150R-XX/CW29150R-ADJ/CW29151R-XX Low-Dropout Regulators", boundingBox: { x: 250, y: 28, width: 290, height: 18 }, fontSize: 10, readingOrderIndex: 0 },
        { id: `status-${pageNumber}`, pageNumber, text: "Preliminary Datasheet", boundingBox: { x: 320, y: 48, width: 170, height: 14 }, fontSize: 9, readingOrderIndex: 1 },
        { id: `noise-${pageNumber}`, pageNumber, text: "Reversed supply current reserved regulation", boundingBox: { x: 55, y: 210, width: 320, height: 18 }, fontSize: 10, readingOrderIndex: 2 },
        { id: `noise-two-${pageNumber}`, pageNumber, text: "Rev. ERSED", boundingBox: { x: 55, y: 236, width: 120, height: 16 }, fontSize: 10, readingOrderIndex: 3 }
      ],
      images: [],
      tables: []
    }));

    const normalized = normalizeDatasheetExtraction(pages);

    expect(normalized.documentStatus).toBe("Preliminary Datasheet");
    expect(normalized.productCategory).toBe("Low-Dropout Regulators");
    expect(normalized.revision).toBe("");
    expect(normalized.revision).not.toBe("Rev. ERSED");
  });

  it("orders two-column text left-to-right by column instead of interleaving rows", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "left-1", pageNumber: 1, text: "Left column intro", boundingBox: { x: 48, y: 140, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 0 },
        { id: "right-1", pageNumber: 1, text: "Right column intro", boundingBox: { x: 330, y: 142, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 1 },
        { id: "left-2", pageNumber: 1, text: "Left column follow-up", boundingBox: { x: 48, y: 180, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 2 },
        { id: "right-2", pageNumber: 1, text: "Right column follow-up", boundingBox: { x: 330, y: 182, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 3 },
        { id: "left-3", pageNumber: 1, text: "Left column end", boundingBox: { x: 48, y: 220, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 4 },
        { id: "right-3", pageNumber: 1, text: "Right column end", boundingBox: { x: 330, y: 222, width: 180, height: 18 }, fontSize: 10, readingOrderIndex: 5 }
      ],
      images: [],
      tables: []
    })]);

    const textSequence = JSON.stringify(json.content);
    expect(textSequence.indexOf("Left column intro")).toBeLessThan(textSequence.indexOf("Left column follow-up"));
    expect(textSequence.indexOf("Left column end")).toBeLessThan(textSequence.indexOf("Right column intro"));
  });

  it("suppresses flattened table text when a reliable table is rendered", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "cell-1", pageNumber: 1, text: "VIN", boundingBox: { x: 70, y: 430, width: 60, height: 14 }, fontSize: 10, readingOrderIndex: 0 },
        { id: "cell-2", pageNumber: 1, text: "5 V", boundingBox: { x: 140, y: 430, width: 60, height: 14 }, fontSize: 10, readingOrderIndex: 1 }
      ]
    })]);

    const serialized = JSON.stringify(json);
    expect(serialized).toContain("tableHeader");
    expect(serialized.match(/"VIN"/g)?.length).toBe(1);
  });

  it("uses a review fallback for unreliable tables without scattered pseudo-table text", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "noisy-1", pageNumber: 1, text: "VIN   Typ   Max", boundingBox: { x: 60, y: 420, width: 220, height: 16 }, fontSize: 10, readingOrderIndex: 0 }
      ],
      tables: [{ id: "noisy", pageNumber: 1, confidence: 0.35, boundingBox: { x: 58, y: 418, width: 280, height: 60 }, rows: [[{ text: "VIN" }], [{ text: "5 V" }, { text: "Typ" }, { text: "Max" }]] }]
    })]);

    const serialized = JSON.stringify(json);
    expect(serialized).toContain("Table extraction needs review");
    expect(serialized).not.toContain("Source page");
  });

  it("converts section headings and inline bullets into heading and list nodes", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "heading", pageNumber: 1, text: "GENERAL DESCRIPTION", boundingBox: { x: 50, y: 100, width: 300, height: 18 }, fontSize: 11, readingOrderIndex: 0 },
        { id: "bullets", pageNumber: 1, text: "Low dropout voltage • Fast transient response • Enable input", boundingBox: { x: 50, y: 140, width: 420, height: 40 }, fontSize: 10, readingOrderIndex: 1 }
      ],
      images: [],
      tables: []
    })]);

    expect(json.content.some((node) => node.type === "heading")).toBe(true);
    const bulletList = json.content.find((node) => node.type === "bulletList");
    expect(JSON.stringify(bulletList)).toContain("Fast transient response");
  });

  it("pairs nearby figure captions with images and avoids duplicate caption paragraphs", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "caption", pageNumber: 1, text: "Figure 1. Typical application", boundingBox: { x: 120, y: 540, width: 220, height: 16 }, fontSize: 9, readingOrderIndex: 0 }
      ],
      images: [{ id: "diagram-1", pageNumber: 1, storageKey: "users/u/projects/project-1/extracted/images/page-1/diagram.png", width: 420, height: 180, boundingBox: { x: 90, y: 330, width: 420, height: 180 }, mimeType: "image/png", confidence: 0.9 }],
      tables: []
    })]);

    const imageNode = json.content.find((node) => node.type === "image");
    const captionParagraphs = json.content.filter((node) => node.type === "paragraph" && JSON.stringify(node).includes("Figure 1. Typical application"));

    expect(JSON.stringify(imageNode)).toContain("Figure 1. Typical application");
    expect(captionParagraphs).toHaveLength(1);
  });

  it("does not insert visible source page markers into the editor body", () => {
    const json = convertToTiptapJson([basePage(1)]);
    expect(JSON.stringify(json)).not.toContain("Source page");
  });
});

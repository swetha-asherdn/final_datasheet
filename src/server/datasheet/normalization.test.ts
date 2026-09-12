import { describe, expect, it } from "vitest";
import { convertToTiptapJson, normalizeDatasheetExtraction, type NormalizablePage } from "@/server/datasheet/normalization";

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

  it("classifies repeated supplier company names and supplier URLs as branding cleanup candidates", () => {
    const pages = [1, 2, 3].map((pageNumber) => basePage(pageNumber, {
      textBlocks: [
        { id: `brand-${pageNumber}`, pageNumber, text: "ACME SEMICONDUCTOR", boundingBox: { x: 35, y: 28, width: 180, height: 16 }, fontSize: 10, confidence: 0.92, readingOrderIndex: 0 },
        { id: `footer-${pageNumber}`, pageNumber, text: "www.acme-semi.com © 2024", boundingBox: { x: 30, y: 805, width: 220, height: 18 }, fontSize: 8, confidence: 0.9, readingOrderIndex: 3 },
        { id: `title-${pageNumber}`, pageNumber, text: pageNumber === 1 ? "GENERIC POWER REGULATOR" : "Electrical Characteristics", boundingBox: { x: 50, y: pageNumber === 1 ? 120 : 110, width: 360, height: 22 }, fontSize: pageNumber === 1 ? 18 : 15, confidence: 0.92, readingOrderIndex: 1 },
        { id: `body-${pageNumber}`, pageNumber, text: "Operating voltage supports industrial temperature ranges.", boundingBox: { x: 50, y: 180, width: 420, height: 40 }, fontSize: 10, confidence: 0.93, readingOrderIndex: 2 }
      ],
      images: [],
      tables: []
    }));

    const normalized = normalizeDatasheetExtraction(pages);
    const removedText = normalized.cleanupReport.removedTextBlocks.map((item) => item.text);

    expect(removedText).toContain("ACME SEMICONDUCTOR");
    expect(removedText).toContain("www.acme-semi.com © 2024");
    expect(normalized.cleanupReport.reasonCodes).toContain("BRAND_COMPANY_NAME");
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
        { id: "bullets", pageNumber: 1, text: "Low dropout voltage \u2022 Fast transient response \u2022 Enable input", boundingBox: { x: 50, y: 140, width: 420, height: 40 }, fontSize: 10, readingOrderIndex: 1 }
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

  it("preserves rating section headings before technical tables", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "abs-heading", pageNumber: 1, text: "ABSOLUTE MAXIMUM RATINGS", boundingBox: { x: 55, y: 395, width: 300, height: 18 }, fontSize: 12, readingOrderIndex: 0 },
        { id: "cell-1", pageNumber: 1, text: "Supply Voltage", boundingBox: { x: 80, y: 430, width: 110, height: 12 }, fontSize: 9, readingOrderIndex: 1 }
      ],
      tables: [{ id: "ratings", pageNumber: 1, confidence: 0.86, boundingBox: { x: 70, y: 420, width: 320, height: 84 }, rows: [[{ text: "Parameter" }, { text: "Rating" }], [{ text: "Supply Voltage" }, { text: "20 V" }]] }],
      images: []
    })]);

    const headings = json.content.filter((node) => node.type === "heading").map((node) => JSON.stringify(node));
    expect(headings.some((value) => value.includes("ABSOLUTE MAXIMUM RATINGS"))).toBe(true);
  });

  it("keeps electrical notes attached after electrical characteristics", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "electrical", pageNumber: 1, text: "ELECTRICAL CHARACTERISTICS", boundingBox: { x: 50, y: 120, width: 320, height: 18 }, fontSize: 12, readingOrderIndex: 0 },
        { id: "body-1", pageNumber: 1, text: "Output voltage is measured at room temperature.", boundingBox: { x: 50, y: 160, width: 420, height: 18 }, fontSize: 10, readingOrderIndex: 1 },
        { id: "error", pageNumber: 1, text: "ERROR FLAG", boundingBox: { x: 50, y: 240, width: 140, height: 18 }, fontSize: 12, readingOrderIndex: 2 },
        { id: "note-1", pageNumber: 1, text: "Note 1 Output current is limited by thermal conditions.", boundingBox: { x: 50, y: 270, width: 440, height: 18 }, fontSize: 9, readingOrderIndex: 3 }
      ],
      images: [],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    expect(serialized.indexOf("ELECTRICAL CHARACTERISTICS")).toBeLessThan(serialized.indexOf("Note 1 Output current is limited by thermal conditions."));
    expect(serialized.indexOf("Note 1 Output current is limited by thermal conditions.")).toBeLessThan(serialized.indexOf("ERROR FLAG"));
  });


  it("creates clean headings and compact lists for features and applications", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "features-heading", pageNumber: 1, text: "FEATURES", boundingBox: { x: 50, y: 110, width: 160, height: 16 }, fontSize: 13, readingOrderIndex: 0 },
        { id: "feature-1", pageNumber: 1, text: "Low Dropout Voltage", boundingBox: { x: 55, y: 140, width: 220, height: 14 }, fontSize: 10, readingOrderIndex: 1 },
        { id: "feature-2a", pageNumber: 1, text: "Also Characterized For Smaller Loads With", boundingBox: { x: 55, y: 160, width: 260, height: 14 }, fontSize: 10, readingOrderIndex: 2 },
        { id: "feature-2b", pageNumber: 1, text: "Industry-Leading Performance Specifications", boundingBox: { x: 55, y: 178, width: 280, height: 14 }, fontSize: 10, readingOrderIndex: 3 },
        { id: "applications-heading", pageNumber: 1, text: "APPLICATIONS", boundingBox: { x: 50, y: 220, width: 160, height: 16 }, fontSize: 13, readingOrderIndex: 4 },
        { id: "app-1a", pageNumber: 1, text: "High-Efficiency Post-Regulator For Switching", boundingBox: { x: 55, y: 250, width: 290, height: 14 }, fontSize: 10, readingOrderIndex: 5 },
        { id: "app-1b", pageNumber: 1, text: "Supply", boundingBox: { x: 55, y: 268, width: 80, height: 14 }, fontSize: 10, readingOrderIndex: 6 }
      ],
      images: [],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    const featuresHeadingIndex = serialized.indexOf("FEATURES");
    const applicationsHeadingIndex = serialized.indexOf("APPLICATIONS");
    expect(featuresHeadingIndex).toBeGreaterThan(-1);
    expect(applicationsHeadingIndex).toBeGreaterThan(featuresHeadingIndex);
    expect(serialized).toContain("Also Characterized For Smaller Loads With Industry-Leading Performance Specifications");
    expect(serialized).toContain("High-Efficiency Post-Regulator For Switching Supply");
    const featureHeadingBullet = json.content.find((node) => node.type === "bulletList" && JSON.stringify(node).includes("FEATURES"));
    expect(featureHeadingBullet).toBeUndefined();
  });

  it("splits merged heading paragraph text into heading and body paragraph", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "merged-general", pageNumber: 1, text: "GENERAL DESCRIPTION The device is a low-dropout regulator.", boundingBox: { x: 50, y: 110, width: 420, height: 30 }, fontSize: 11, readingOrderIndex: 0 },
        { id: "merged-pinout", pageNumber: 1, text: "PINOUT On all devices the tab is internally connected.", boundingBox: { x: 50, y: 160, width: 420, height: 30 }, fontSize: 11, readingOrderIndex: 1 }
      ],
      images: [],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    expect(serialized.indexOf("GENERAL DESCRIPTION")).toBeLessThan(serialized.indexOf("The device is a low-dropout regulator."));
    expect(serialized.indexOf("PINOUT")).toBeLessThan(serialized.indexOf("On all devices the tab is internally connected."));
  });

  it("removes image placeholder text while preserving real captions", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "placeholder", pageNumber: 1, text: "Image from source page 1", boundingBox: { x: 80, y: 290, width: 200, height: 16 }, fontSize: 9, readingOrderIndex: 0 },
        { id: "caption", pageNumber: 1, text: "Figure 1. Fixed output voltage", boundingBox: { x: 90, y: 520, width: 260, height: 16 }, fontSize: 9, readingOrderIndex: 1 }
      ],
      images: [{ id: "figure-1", pageNumber: 1, storageKey: "users/u/projects/project-1/extracted/images/page-1/figure.png", width: 360, height: 180, boundingBox: { x: 90, y: 320, width: 360, height: 180 }, mimeType: "image/png", confidence: 0.9 }],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    expect(serialized).not.toContain("Image from source page 1");
    expect(serialized).toContain("Figure 1. Fixed output voltage");
    expect(json.content.some((node) => node.type === "image")).toBe(true);
  });

  it("keeps tables under inferred canonical table sections and cleans cells", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "electrical", pageNumber: 1, text: "ELECTRICAL CHARACTERISTICS", boundingBox: { x: 50, y: 110, width: 310, height: 16 }, fontSize: 12, readingOrderIndex: 0 },
        { id: "pad", pageNumber: 1, text: "PAD LOCATION AND COORDINATES", boundingBox: { x: 50, y: 360, width: 310, height: 16 }, fontSize: 12, readingOrderIndex: 1 },
        { id: "assembly", pageNumber: 1, text: "ASSEMBLY CHARACTERISTICS", boundingBox: { x: 50, y: 560, width: 310, height: 16 }, fontSize: 12, readingOrderIndex: 2 }
      ],
      images: [],
      tables: [
        { id: "electrical-table", pageNumber: 1, confidence: 0.88, boundingBox: { x: 60, y: 140, width: 400, height: 120 }, rows: [[{ text: "Parameter" }, { text: "Conditions" }, { text: "Min" }, { text: "Typ" }, { text: "Max" }], [{ text: "Output Current" }, { text: "10mAI 1.5A" }, { text: "" }, { text: "" }, { text: "A" }]] },
        { id: "pad-table", pageNumber: 1, confidence: 0.88, boundingBox: { x: 60, y: 390, width: 320, height: 80 }, rows: [[{ text: "Pad" }, { text: "X" }, { text: "Y" }], [{ text: "1" }, { text: "10" }, { text: "20" }]] },
        { id: "assembly-table", pageNumber: 1, confidence: 0.88, boundingBox: { x: 60, y: 590, width: 320, height: 80 }, rows: [[{ text: "Assembly" }, { text: "Value" }], [{ text: "Die Attach" }, { text: "Conductive epoxy" }]] }
      ]
    })]);

    const serialized = JSON.stringify(json.content);
    const lessThanOrEqual = String.fromCharCode(0x2264);
    expect(serialized.indexOf("ELECTRICAL CHARACTERISTICS")).toBeLessThan(serialized.indexOf(`10mA ${lessThanOrEqual} IOUT ${lessThanOrEqual} 1.5A`));
    expect(serialized.indexOf("PAD LOCATION AND COORDINATES")).toBeLessThan(serialized.indexOf("Pad"));
    expect(serialized.indexOf("ASSEMBLY CHARACTERISTICS")).toBeLessThan(serialized.indexOf("Die Attach"));
    expect(serialized.indexOf("ASSEMBLY CHARACTERISTICS")).toBeGreaterThan(serialized.indexOf("PAD LOCATION AND COORDINATES"));
  });

  it("preserves notes after electrical characteristics in canonical order", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "electrical", pageNumber: 1, text: "ELECTRICAL CHARACTERISTICS", boundingBox: { x: 50, y: 110, width: 310, height: 16 }, fontSize: 12, readingOrderIndex: 0 },
        { id: "note-1", pageNumber: 1, text: "Note 1 Output current is pulse tested.", boundingBox: { x: 50, y: 150, width: 420, height: 16 }, fontSize: 9, readingOrderIndex: 1 },
        { id: "note-9", pageNumber: 1, text: "Note 9 Thermal limits apply.", boundingBox: { x: 50, y: 170, width: 420, height: 16 }, fontSize: 9, readingOrderIndex: 2 },
        { id: "app-info", pageNumber: 1, text: "APPLICATION INFORMATION", boundingBox: { x: 50, y: 220, width: 310, height: 16 }, fontSize: 12, readingOrderIndex: 3 }
      ],
      images: [],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    expect(serialized.indexOf("ELECTRICAL CHARACTERISTICS")).toBeLessThan(serialized.indexOf("Note 1 Output current is pulse tested."));
    expect(serialized.indexOf("Note 9 Thermal limits apply.")).toBeLessThan(serialized.indexOf("APPLICATION INFORMATION"));
  });


  it("splits figure captions out of applications bullets and keeps captions separate", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "applications", pageNumber: 1, text: "APPLICATIONS", boundingBox: { x: 50, y: 100, width: 160, height: 16 }, fontSize: 13, readingOrderIndex: 0 },
        { id: "app-1", pageNumber: 1, text: "Battery Powered Equipment", boundingBox: { x: 55, y: 130, width: 220, height: 14 }, fontSize: 10, readingOrderIndex: 1 },
        { id: "app-2", pageNumber: 1, text: "High-Efficiency Post-Regulator For Switching Supply Figure 1. Fixed output voltage", boundingBox: { x: 55, y: 150, width: 430, height: 14 }, fontSize: 10, readingOrderIndex: 2 },
        { id: "figure-2-caption", pageNumber: 1, text: "Figure 2. Adjustable output voltage configuration", boundingBox: { x: 90, y: 420, width: 280, height: 14 }, fontSize: 9, readingOrderIndex: 3 }
      ],
      images: [{ id: "figure-2", pageNumber: 1, storageKey: "users/u/projects/project-1/extracted/images/page-1/figure-2.png", width: 360, height: 160, boundingBox: { x: 90, y: 240, width: 360, height: 160 }, mimeType: "image/png", confidence: 0.9 }],
      tables: []
    })]);

    const applicationList = json.content.find((node) => node.type === "bulletList");
    const listText = JSON.stringify(applicationList);
    const serialized = JSON.stringify(json.content);
    expect(listText).toContain("High-Efficiency Post-Regulator For Switching Supply");
    expect(listText).not.toContain("Figure 1.");
    expect(serialized).toContain("Figure 1. Fixed output voltage");
    expect(serialized).toContain("Figure 2. Adjustable output voltage configuration");
  });

  it("keeps page-one intro sections in canonical reference order", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "general", pageNumber: 1, text: "GENERAL DESCRIPTION", boundingBox: { x: 50, y: 100, width: 220, height: 16 }, fontSize: 13, readingOrderIndex: 0 },
        { id: "typical", pageNumber: 1, text: "TYPICAL APPLICATION", boundingBox: { x: 50, y: 130, width: 220, height: 16 }, fontSize: 13, readingOrderIndex: 1 },
        { id: "applications", pageNumber: 1, text: "APPLICATIONS", boundingBox: { x: 50, y: 160, width: 180, height: 16 }, fontSize: 13, readingOrderIndex: 2 },
        { id: "pin-config", pageNumber: 1, text: "PIN CONFIGURATION", boundingBox: { x: 50, y: 190, width: 220, height: 16 }, fontSize: 13, readingOrderIndex: 3 },
        { id: "pinout", pageNumber: 1, text: "PINOUT", boundingBox: { x: 50, y: 220, width: 120, height: 16 }, fontSize: 13, readingOrderIndex: 4 },
        { id: "features", pageNumber: 1, text: "FEATURES", boundingBox: { x: 50, y: 250, width: 120, height: 16 }, fontSize: 13, readingOrderIndex: 5 }
      ],
      images: [],
      tables: []
    })]);

    const headings = json.content.filter((node) => node.type === "heading").map((node) => JSON.stringify(node)).join(" ");
    expect(headings.indexOf("GENERAL DESCRIPTION")).toBeLessThan(headings.indexOf("PIN CONFIGURATION"));
    expect(headings.indexOf("PIN CONFIGURATION")).toBeLessThan(headings.indexOf("PINOUT"));
    expect(headings.indexOf("PINOUT")).toBeLessThan(headings.indexOf("FEATURES"));
    expect(headings.indexOf("FEATURES")).toBeLessThan(headings.indexOf("TYPICAL APPLICATION"));
    expect(headings.indexOf("TYPICAL APPLICATION")).toBeLessThan(headings.indexOf("APPLICATIONS"));
  });

  it("removes duplicated rating headings while preserving table-specific headings", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "abs-1", pageNumber: 1, text: "ABSOLUTE MAXIMUM RATINGS", boundingBox: { x: 50, y: 100, width: 300, height: 16 }, fontSize: 13, readingOrderIndex: 0 },
        { id: "abs-2", pageNumber: 1, text: "ABSOLUTE MAXIMUM RATINGS", boundingBox: { x: 50, y: 120, width: 300, height: 16 }, fontSize: 13, readingOrderIndex: 1 },
        { id: "rec", pageNumber: 1, text: "RECOMMENDED OPERATING CONDITIONS", boundingBox: { x: 50, y: 300, width: 340, height: 16 }, fontSize: 13, readingOrderIndex: 2 },
        { id: "elec", pageNumber: 1, text: "ELECTRICAL CHARACTERISTICS", boundingBox: { x: 50, y: 480, width: 300, height: 16 }, fontSize: 13, readingOrderIndex: 3 }
      ],
      images: [],
      tables: [
        { id: "abs-table", pageNumber: 1, confidence: 0.9, boundingBox: { x: 60, y: 150, width: 360, height: 80 }, rows: [[{ text: "Parameter" }, { text: "Rating" }], [{ text: "Storage Temperature" }, { text: "150 C" }]] },
        { id: "rec-table", pageNumber: 1, confidence: 0.9, boundingBox: { x: 60, y: 330, width: 360, height: 80 }, rows: [[{ text: "Input Voltage" }, { text: "Recommended" }], [{ text: "VIN" }, { text: "20V" }]] },
        { id: "elec-table", pageNumber: 1, confidence: 0.9, boundingBox: { x: 60, y: 510, width: 360, height: 80 }, rows: [[{ text: "Parameter" }, { text: "Min" }, { text: "Typ" }, { text: "Max" }], [{ text: "Flag Output" }, { text: "" }, { text: "" }, { text: "" }]] }
      ]
    })]);

    const headings = json.content.filter((node) => node.type === "heading").map((node) => JSON.stringify(node));
    expect(headings.filter((item) => item.includes("ABSOLUTE MAXIMUM RATINGS"))).toHaveLength(1);
    const serialized = JSON.stringify(json.content);
    expect(serialized.indexOf("ABSOLUTE MAXIMUM RATINGS")).toBeLessThan(serialized.indexOf("Storage Temperature"));
    expect(serialized.indexOf("RECOMMENDED OPERATING CONDITIONS")).toBeLessThan(serialized.indexOf("Recommended"));
    expect(serialized.indexOf("ELECTRICAL CHARACTERISTICS")).toBeLessThan(serialized.indexOf("Flag Output"));
  });

  it("associates images with nearby figure sections instead of appending them at page end", () => {
    const json = convertToTiptapJson([basePage(1, {
      textBlocks: [
        { id: "pin-heading", pageNumber: 1, text: "PIN CONFIGURATION", boundingBox: { x: 50, y: 100, width: 220, height: 16 }, fontSize: 13, readingOrderIndex: 0 },
        { id: "pinout-heading", pageNumber: 1, text: "PINOUT", boundingBox: { x: 50, y: 350, width: 100, height: 16 }, fontSize: 13, readingOrderIndex: 2 },
        { id: "pinout-body", pageNumber: 1, text: "On all devices the tab is internally connected.", boundingBox: { x: 50, y: 380, width: 360, height: 16 }, fontSize: 10, readingOrderIndex: 3 }
      ],
      images: [{ id: "pin-image", pageNumber: 1, storageKey: "users/u/projects/project-1/extracted/images/page-1/pin.png", width: 240, height: 180, boundingBox: { x: 120, y: 140, width: 240, height: 180 }, mimeType: "image/png", confidence: 0.9 }],
      tables: []
    })]);

    const serialized = JSON.stringify(json.content);
    expect(serialized.indexOf("PIN CONFIGURATION")).toBeLessThan(serialized.indexOf("pin-image"));
    expect(serialized.indexOf("pin-image")).toBeLessThan(serialized.indexOf("PINOUT"));
  });

  it("does not insert visible source page markers into the editor body", () => {
    const json = convertToTiptapJson([basePage(1)]);
    expect(JSON.stringify(json)).not.toContain("Source page");
  });
});



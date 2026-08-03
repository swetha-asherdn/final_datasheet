import { beforeEach, describe, expect, it, vi } from "vitest";

const documentFindOneMock = vi.hoisted(() => vi.fn());
const templateFindOneMock = vi.hoisted(() => vi.fn());
const extractionRunFindOneMock = vi.hoisted(() => vi.fn());
const extractedPageFindMock = vi.hoisted(() => vi.fn());
const projectUpdateOneMock = vi.hoisted(() => vi.fn(async () => undefined));
const projectExistsMock = vi.hoisted(() => vi.fn(async () => true));
const normalizeMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/models/datasheet-document", () => ({ DatasheetDocumentModel: { findOne: documentFindOneMock, create: vi.fn() } }));
vi.mock("@/server/models/datasheet-template-settings", () => ({ DatasheetTemplateSettingsModel: { findOne: templateFindOneMock, create: vi.fn() } }));
vi.mock("@/server/models/extraction-run", () => ({ ExtractionRunModel: { findOne: extractionRunFindOneMock } }));
vi.mock("@/server/models/extracted-page", () => ({ ExtractedPageModel: { find: extractedPageFindMock } }));
vi.mock("@/server/models/project", () => ({ ProjectModel: { findOne: vi.fn(), exists: projectExistsMock, updateOne: projectUpdateOneMock } }));
vi.mock("@/server/datasheet/normalization", async () => {
  const actual = await vi.importActual<typeof import("@/server/datasheet/normalization")>("@/server/datasheet/normalization");
  return { ...actual, normalizeDatasheetExtraction: normalizeMock };
});

import { regenerateDatasheetFromExtraction } from "@/server/datasheet/service";

function sortedDoc(value: unknown) {
  return { sort: vi.fn().mockResolvedValue(value) };
}

function sortedLean(value: unknown) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function leanDoc(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("regenerateDatasheetFromExtraction", () => {
  beforeEach(() => {
    documentFindOneMock.mockReset();
    templateFindOneMock.mockReset();
    extractionRunFindOneMock.mockReset();
    extractedPageFindMock.mockReset();
    projectUpdateOneMock.mockClear();
    projectExistsMock.mockResolvedValue(true);
    normalizeMock.mockReset();
  });

  it("overwrites editorJson and inferred document metadata", async () => {
    const documentRecord = {
      _id: "doc1",
      projectId: "64f000000000000000000001",
      extractionRunId: "run-old",
      title: "Regulator Output Current Shutdown",
      productCode: "OLD-1",
      productCategory: "Regulator Output Current Shutdown",
      editorJson: { type: "doc", content: [] },
      sourceCleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
      templateSettingsId: "tpl1",
      status: "EDITING",
      createdFromExtractionAt: new Date("2026-07-08T09:00:00.000Z"),
      lastSavedAt: new Date("2026-07-08T10:00:00.000Z"),
      markModified: vi.fn(),
      save: vi.fn(async () => undefined),
      toObject: vi.fn(() => ({ _id: "doc1", productCode: "OLD-1", title: "Regulator Output Current Shutdown", productCategory: "Regulator Output Current Shutdown" }))
    };
    const templateRecord = {
      productCode: "OLD-1",
      productTitle: "Regulator Output Current Shutdown",
      documentStatus: "Preliminary Datasheet",
      revision: "Rev. ERSED",
      footerText: "Preliminary Datasheet | Rev. ERSED",
      save: vi.fn(async () => undefined)
    };

    documentFindOneMock
      .mockReturnValueOnce(sortedDoc(documentRecord))
      .mockReturnValueOnce(sortedLean({
        _id: "doc1",
        projectId: "64f000000000000000000001",
        extractionRunId: "run-new",
        schemaVersion: "1.0",
        status: "READY_FOR_EDIT",
        title: "Low-Dropout Regulators",
        productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
        productCategory: "Low-Dropout Regulators",
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fresh draft" }] }] },
        sourceCleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
        createdFromExtractionAt: new Date("2026-07-08T09:00:00.000Z"),
        lastSavedAt: new Date("2026-07-09T09:00:00.000Z")
      }));
    templateFindOneMock
      .mockReturnValueOnce(Promise.resolve(templateRecord))
      .mockReturnValueOnce(leanDoc({
        _id: "tpl1",
        logoStorageKey: null,
        logoAssetPath: "/branding/vellore-semicon-logo.svg",
        companyName: "Vellore Semicon",
        website: "www.velloresemicon.com",
        productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
        productTitle: "Low-Dropout Regulators",
        documentStatus: "Preliminary Datasheet",
        revision: "Rev. A",
        pageSize: "A4",
        orientation: "portrait",
        primaryColor: "#0D2B55",
        accentColor: "#D6533E",
        footerText: "Preliminary Datasheet | Rev. A",
        showPageNumbers: true,
        headerConfig: {},
        footerConfig: {}
      }));
    extractionRunFindOneMock.mockReturnValue(sortedLean({ _id: "run-new" }));
    extractedPageFindMock.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ pageNumber: 1, width: 595, height: 842, textBlocks: [], images: [], tables: [], warnings: [] }]) }) });
    normalizeMock.mockReturnValue({
      pages: [],
      cleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
      editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fresh draft" }] }] },
      title: "Low-Dropout Regulators",
      productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
      productCategory: "Low-Dropout Regulators",
      documentStatus: "Preliminary Datasheet",
      revision: "",
      qualitySummary: { sectionsDetected: 3, tablesDetected: 1, figuresDetected: 0, warningsCount: 0, unresolvedSymbolsCount: 0, warnings: [] }
    });

    const result = await regenerateDatasheetFromExtraction({ projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000" });

    expect(documentRecord.extractionRunId).toBe("run-new");
    expect(documentRecord.title).toBe("Low-Dropout Regulators");
    expect(documentRecord.productCode).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(documentRecord.productCategory).toBe("Low-Dropout Regulators");
    expect(documentRecord.editorJson).toEqual(expect.objectContaining({ type: "doc" }));
    expect(documentRecord.status).toBe("READY_FOR_EDIT");
    expect(documentRecord.markModified).toHaveBeenCalledWith("editorJson");
    expect(documentRecord.markModified).toHaveBeenCalledWith("sourceCleanupReport");
    expect(documentRecord.save).toHaveBeenCalledTimes(1);
    expect(templateRecord.productCode).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(templateRecord.productTitle).toBe("Low-Dropout Regulators");
    expect(templateRecord.documentStatus).toBe("Preliminary Datasheet");
    expect(templateRecord.revision).toBe("Rev. A");
    expect(projectUpdateOneMock).toHaveBeenCalledTimes(1);
    expect(result?.document.productCode).toBe("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(result?.qualitySummary).toEqual(expect.objectContaining({ sectionsDetected: 3, tablesDetected: 1 }));
  });

  it("preserves existing custom template settings where possible", async () => {
    const documentRecord = {
      _id: "doc1",
      projectId: "64f000000000000000000001",
      extractionRunId: "run-old",
      title: "Old title",
      productCode: "OLD-1",
      productCategory: "Old category",
      editorJson: { type: "doc", content: [] },
      sourceCleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
      templateSettingsId: "tpl1",
      status: "EDITING",
      createdFromExtractionAt: new Date("2026-07-08T09:00:00.000Z"),
      lastSavedAt: new Date("2026-07-08T10:00:00.000Z"),
      markModified: vi.fn(),
      save: vi.fn(async () => undefined),
      toObject: vi.fn(() => ({ _id: "doc1", productCode: "OLD-1", title: "Old title", productCategory: "Old category" }))
    };
    const templateRecord = {
      productCode: "CUSTOM-CODE",
      productTitle: "Custom Template Title",
      documentStatus: "Custom Status",
      revision: "Rev. C",
      footerText: "Custom Status | Rev. C",
      save: vi.fn(async () => undefined)
    };

    documentFindOneMock
      .mockReturnValueOnce(sortedDoc(documentRecord))
      .mockReturnValueOnce(sortedLean({
        _id: "doc1",
        projectId: "64f000000000000000000001",
        extractionRunId: "run-new",
        schemaVersion: "1.0",
        status: "READY_FOR_EDIT",
        title: "Low-Dropout Regulators",
        productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
        productCategory: "Low-Dropout Regulators",
        editorJson: { type: "doc", content: [] },
        sourceCleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
        createdFromExtractionAt: new Date("2026-07-08T09:00:00.000Z"),
        lastSavedAt: new Date("2026-07-09T09:00:00.000Z")
      }));
    templateFindOneMock
      .mockReturnValueOnce(Promise.resolve(templateRecord))
      .mockReturnValueOnce(leanDoc({
        _id: "tpl1",
        logoStorageKey: null,
        logoAssetPath: "/branding/vellore-semicon-logo.svg",
        companyName: "Vellore Semicon",
        website: "www.velloresemicon.com",
        productCode: "CUSTOM-CODE",
        productTitle: "Custom Template Title",
        documentStatus: "Custom Status",
        revision: "Rev. C",
        pageSize: "A4",
        orientation: "portrait",
        primaryColor: "#0D2B55",
        accentColor: "#D6533E",
        footerText: "Custom Status | Rev. C",
        showPageNumbers: true,
        headerConfig: {},
        footerConfig: {}
      }));
    extractionRunFindOneMock.mockReturnValue(sortedLean({ _id: "run-new" }));
    extractedPageFindMock.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ pageNumber: 1, width: 595, height: 842, textBlocks: [], images: [], tables: [], warnings: [] }]) }) });
    normalizeMock.mockReturnValue({
      pages: [],
      cleanupReport: { removedTextBlocks: [], removedImages: [], keptTextBlocks: [], keptImages: [], uncertainItems: [], confidence: 0.9, reasonCodes: [] },
      editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fresh draft" }] }] },
      title: "Low-Dropout Regulators",
      productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
      productCategory: "Low-Dropout Regulators",
      documentStatus: "Preliminary Datasheet",
      revision: "Rev. B",
      qualitySummary: { sectionsDetected: 3, tablesDetected: 1, figuresDetected: 0, warningsCount: 0, unresolvedSymbolsCount: 0, warnings: [] }
    });

    const result = await regenerateDatasheetFromExtraction({ projectId: "64f000000000000000000001", ownerId: "64f000000000000000000000" });

    expect(templateRecord.productCode).toBe("CUSTOM-CODE");
    expect(templateRecord.productTitle).toBe("Custom Template Title");
    expect(templateRecord.documentStatus).toBe("Custom Status");
    expect(templateRecord.revision).toBe("Rev. C");
    expect(result?.template.productCode).toBe("CUSTOM-CODE");
    expect(result?.template.productTitle).toBe("Custom Template Title");
    expect(result?.template.documentStatus).toBe("Custom Status");
  });
});

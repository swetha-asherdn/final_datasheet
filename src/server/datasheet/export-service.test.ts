import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindOneMock = vi.hoisted(() => vi.fn());
const projectExistsMock = vi.hoisted(() => vi.fn());
const documentFindOneMock = vi.hoisted(() => vi.fn());
const templateFindOneMock = vi.hoisted(() => vi.fn());
const layoutFindOneMock = vi.hoisted(() => vi.fn());
const exportCreateMock = vi.hoisted(() => vi.fn());
const exportFindMock = vi.hoisted(() => vi.fn());
const exportFindOneMock = vi.hoisted(() => vi.fn());
const uploadPrivateObjectMock = vi.hoisted(() => vi.fn(async () => undefined));
const getPrivateObjectMock = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());
const resolveChromiumMock = vi.hoisted(() => vi.fn(() => "C:\\Tools\\chrome.exe"));
const getDocumentMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/models/project", () => ({ ProjectModel: { findOne: projectFindOneMock, exists: projectExistsMock } }));
vi.mock("@/server/models/datasheet-document", () => ({ DatasheetDocumentModel: { findOne: documentFindOneMock } }));
vi.mock("@/server/models/datasheet-template-settings", () => ({ DatasheetTemplateSettingsModel: { findOne: templateFindOneMock } }));
vi.mock("@/server/models/datasheet-layout", () => ({ DatasheetLayoutModel: { findOne: layoutFindOneMock } }));
vi.mock("@/server/models/datasheet-export", () => ({ DatasheetExportModel: { create: exportCreateMock, find: exportFindMock, findOne: exportFindOneMock } }));
vi.mock("@/server/extraction/service", () => ({ getExtractedImageArtifactForProject: vi.fn(async () => null) }));
vi.mock("@/server/storage/s3", () => ({ uploadPrivateObject: uploadPrivateObjectMock, getPrivateObject: getPrivateObjectMock }));
vi.mock("puppeteer-core", () => ({ default: { launch: launchMock } }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: getDocumentMock }));
vi.mock("@/server/datasheet/chromium", () => ({ resolveChromiumExecutablePath: resolveChromiumMock }));

import {
  createPdfExportForProject,
  getPdfExportHtmlPreviewForProject,
} from "@/server/datasheet/export-service";

const projectId = "64f000000000000000000001";
const ownerId = "64f000000000000000000000";
const documentId = "64f000000000000000000002";
const templateId = "64f000000000000000000003";

function sortedLean(value: unknown) {
  return { sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function leanDoc(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function createExportRecord() {
  const record = {
    _id: "64f000000000000000000004",
    projectId,
    ownerId,
    datasheetDocumentId: documentId,
    type: "PDF",
    status: "PENDING",
    storageKey: "",
    filename: "vellore-semicon-test.pdf",
    fileSize: null as number | null,
    errorMessage: null as string | null,
    completedAt: null as Date | null,
    createdAt: new Date("2026-07-13T10:00:00.000Z"),
    metadata: {
      productCode: "VS123",
      productTitle: "Low-Dropout Regulators",
      documentStatus: "Preliminary Datasheet",
      revision: "Rev. A",
      website: "www.velloresemicon.com",
      primaryColor: "#0D2B55",
      accentColor: "#D6533E",
    },
    save: vi.fn(async () => undefined),
    toObject() {
      return { ...record };
    },
  };
  return record;
}

beforeEach(() => {
  projectFindOneMock.mockReset();
  projectExistsMock.mockReset();
  documentFindOneMock.mockReset();
  templateFindOneMock.mockReset();
  layoutFindOneMock.mockReset();
  exportCreateMock.mockReset();
  exportFindMock.mockReset();
  exportFindOneMock.mockReset();
  uploadPrivateObjectMock.mockClear();
  getPrivateObjectMock.mockReset();
  launchMock.mockReset();
  resolveChromiumMock.mockClear();
  getDocumentMock.mockReset();

  projectFindOneMock.mockReturnValue(leanDoc({ _id: projectId, name: "Test Project" }));
  projectExistsMock.mockResolvedValue(true);
  documentFindOneMock.mockReturnValue(sortedLean({
    _id: documentId,
    templateSettingsId: templateId,
    title: "Low-Dropout Regulators",
    productCode: "VS123",
    productCategory: "Low-Dropout Regulators",
    editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Editable body" }] }] },
  }));
  layoutFindOneMock.mockReturnValue(leanDoc(null));
  templateFindOneMock.mockReturnValue(leanDoc({
    _id: templateId,
    logoAssetPath: "/branding/vellore-semicon-logo.svg",
    companyName: "Vellore Semicon",
    website: "www.velloresemicon.com",
    productCode: "VS123",
    productTitle: "Low-Dropout Regulators",
    documentStatus: "Preliminary Datasheet",
    revision: "Rev. A",
    primaryColor: "#0D2B55",
    accentColor: "#D6533E",
  }));
  getDocumentMock.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, destroy: vi.fn(async () => undefined) }),
  });
});

describe("createPdfExportForProject", () => {
  it("marks the export completed, uploads the PDF, and uses exact zero-margin page-container PDF settings", async () => {
    const record = createExportRecord();
    exportCreateMock.mockResolvedValue(record);
    const pdfMock = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    launchMock.mockResolvedValue({
      newPage: vi.fn(async () => ({
        setViewport: vi.fn(async () => undefined),
        setContent: vi.fn(async () => undefined),
        waitForNetworkIdle: vi.fn(async () => undefined),
        emulateMediaType: vi.fn(async () => undefined),
        pdf: pdfMock,
      })),
      close: vi.fn(async () => undefined),
    });

    const result = await createPdfExportForProject({ projectId, ownerId });

    expect(resolveChromiumMock).toHaveBeenCalled();
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({ executablePath: "C:\\Tools\\chrome.exe" }));
    expect(record.status).toBe("COMPLETED");
    expect(record.fileSize).toBe(4);
    expect(record.storageKey).toContain("/exports/64f000000000000000000004/");
    expect(uploadPrivateObjectMock).toHaveBeenCalledWith(expect.objectContaining({ contentType: "application/pdf" }));
    const browser = await launchMock.mock.results[0].value;
    const page = await browser.newPage.mock.results[0].value;
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
      printBackground: true,
      scale: 1,
    }));
    expect(result.downloadUrl).toBe(`/api/projects/${projectId}/datasheet/export/${record._id}/download`);
  });

  it("returns owner-protected preview HTML using preview-mode styling", async () => {
    const html = await getPdfExportHtmlPreviewForProject({ projectId, ownerId });

    expect(html).toContain('class="pdf-page"');
    expect(html).toContain('class="pdf-header"');
    expect(html).toContain('class="pdf-footer"');
    expect(html).toContain("Editable body");
    expect(html).toContain("export-mode-preview");
    expect(html).toContain("box-shadow: 0 1mm 4mm rgba(15, 23, 42, 0.08);");
  });

  it("adds the Phase 7B debug marker to preview HTML only when debug layout logging is enabled", async () => {
    const previous = process.env.DEBUG_EXPORT_LAYOUT;
    process.env.DEBUG_EXPORT_LAYOUT = "1";

    try {
      const html = await getPdfExportHtmlPreviewForProject({ projectId, ownerId, preferredMode: "auto" });
      expect(html).toContain("PHASE_7B_FILL_FORWARD_ACTIVE");
    } finally {
      process.env.DEBUG_EXPORT_LAYOUT = previous;
    }
  });

  it("fails the export when physical PDF page count does not match the page model", async () => {
    const record = createExportRecord();
    exportCreateMock.mockResolvedValue(record);
    const pdfMock = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    launchMock.mockResolvedValue({
      newPage: vi.fn(async () => ({
        setViewport: vi.fn(async () => undefined),
        setContent: vi.fn(async () => undefined),
        waitForNetworkIdle: vi.fn(async () => undefined),
        emulateMediaType: vi.fn(async () => undefined),
        pdf: pdfMock,
      })),
      close: vi.fn(async () => undefined),
    });
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 3, destroy: vi.fn(async () => undefined) }),
    });

    const result = await createPdfExportForProject({ projectId, ownerId });

    expect(record.status).toBe("FAILED");
    expect(record.errorMessage).toContain("PDF physical page count mismatch");
    expect(uploadPrivateObjectMock).not.toHaveBeenCalled();
    expect(result.downloadUrl).toBeNull();
  });

  it("marks the export failed when PDF rendering fails", async () => {
    const record = createExportRecord();
    exportCreateMock.mockResolvedValue(record);
    launchMock.mockRejectedValue(new Error("Chromium unavailable"));

    const result = await createPdfExportForProject({ projectId, ownerId });

    expect(record.status).toBe("FAILED");
    expect(record.errorMessage).toBe("Chromium unavailable");
    expect(result.downloadUrl).toBeNull();
  });
});


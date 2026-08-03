/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatasheetComposer } from "@/components/datasheet-composer";

const initialBundle = {
  document: {
    id: "doc1",
    status: "READY_FOR_EDIT",
    title: "Generic Datasheet",
    productCode: "VS123",
    productCategory: "Regulator",
    editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Editable body" }] }] },
    sourceCleanupReport: {
      removedTextBlocks: [
        { id: "text:1:h", itemType: "text", pageNumber: 1, text: "SOURCE HEADER", confidence: 0.86, reasons: ["REPEATED_HEADER_TEXT"], decision: "removed" },
        { id: "text:2:restored", itemType: "text", pageNumber: 2, text: "RESTORED HEADER", confidence: 0.75, reasons: ["REPEATED_HEADER_TEXT", "MANUAL_RESTORED"], decision: "kept" }
      ],
      removedImages: [{ id: "image:1:logo", itemType: "image", pageNumber: 1, storageKey: "logos/source.png", confidence: 0.8, reasons: ["REPEATED_HEADER_IMAGE"], decision: "removed" }],
      uncertainItems: [{ id: "text:3:maybe", itemType: "text", pageNumber: 3, text: "MAYBE HEADER", confidence: 0.42, reasons: ["LOW_CONFIDENCE"], decision: "uncertain" }],
      confidence: 0.86,
      reasonCodes: ["REPEATED_HEADER_TEXT", "REPEATED_HEADER_IMAGE", "LOW_CONFIDENCE"]
    },
    lastSavedAt: "2026-07-08T10:00:00.000Z"
  },
  template: {
    id: "tpl1",
    logoAssetPath: "/branding/vellore-semicon-logo.svg",
    companyName: "Vellore Semicon",
    website: "www.velloresemicon.com",
    productCode: "VS123",
    productTitle: "Generic Datasheet",
    documentStatus: "Preliminary Datasheet",
    revision: "Rev. A",
    layoutMode: "two-column",
    layoutDensity: "technical-dense",
    primaryColor: "#0D2B55",
    accentColor: "#D6533E",
    footerText: "Preliminary Datasheet | Rev. A",
    showPageNumbers: true
  }
};

const completedExport = {
  id: "export1",
  status: "COMPLETED",
  filename: "vellore-semicon-vs123-2026-07-13.pdf",
  fileSize: 4096,
  errorMessage: null,
  completedAt: "2026-07-13T10:00:00.000Z",
  createdAt: "2026-07-13T09:59:00.000Z",
  downloadUrl: "/api/projects/project-1/datasheet/export/export1/download"
};

const experimentalLayout = {
  id: "layout1",
  projectId: "project-1",
  datasheetDocumentId: "doc1",
  exportMode: "saved",
  templateSnapshot: {
    logoAssetPath: "/branding/vellore-semicon-logo.svg",
    companyName: "Vellore Semicon",
    website: "www.velloresemicon.com",
    productCode: "VS123",
    productTitle: "Generic Datasheet",
    documentStatus: "Preliminary Datasheet",
    revision: "Rev. A",
    layoutMode: "two-column",
    layoutDensity: "technical-dense",
    pageFillStrategy: "balanced",
    primaryColor: "#0D2B55",
    accentColor: "#D6533E"
  },
  pages: [{
    pageNumber: 1,
    usedHeight: 120,
    bodyHeight: 264,
    warnings: [],
    blocks: [{
      id: "page-1-block-1",
      kind: "html",
      blockType: "paragraph",
      column: "left",
      flowSlot: 0,
      hiddenFromExport: false,
      widthPreset: "medium",
      keepWithCaption: false,
      keepTogether: false,
      allowSplit: true,
      preventOrphanRows: false,
      pageBreakBefore: false,
      plainText: "Experimental layout body",
      estimatedHeight: 24,
      role: "paragraph",
      html: "<p>Experimental layout body</p>",
      fullWidth: false,
      columnEligible: true
    }]
  }],
  warnings: [],
  lastGeneratedAt: "2026-07-13T10:00:00.000Z",
  lastSavedAt: "2026-07-13T10:00:00.000Z",
  updatedAt: "2026-07-13T10:00:00.000Z"
};

const regeneratedBundle = {
  ...initialBundle,
  document: {
    ...initialBundle.document,
    title: "Low-Dropout Regulators",
    productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
    productCategory: "Low-Dropout Regulators",
    editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Fresh draft" }] }] },
    lastSavedAt: "2026-07-09T09:00:00.000Z"
  },
  template: {
    ...initialBundle.template,
    productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
    productTitle: "Low-Dropout Regulators",
    revision: "Rev. B",
    layoutMode: "two-column",
    layoutDensity: "technical-dense"
  },
  qualitySummary: {
    sectionsDetected: 12,
    tablesDetected: 5,
    figuresDetected: 3,
    warningsCount: 2,
    unresolvedSymbolsCount: 0,
    warnings: ["Duplicate heading removed", "Placeholder image text removed"]
  }
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let failNextDocumentSave = false;
let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  failNextDocumentSave = false;
  confirmMock = vi.fn(() => true);
  Object.defineProperty(window, "confirm", { value: confirmMock, configurable: true });
  Object.defineProperty(window.HTMLElement.prototype, "getClientRects", { value: () => [{ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }], configurable: true });
  Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", { value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }), configurable: true });
  Object.defineProperty(window.Range.prototype, "getClientRects", { value: () => [{ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }], configurable: true });
  Object.defineProperty(window.Range.prototype, "getBoundingClientRect", { value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }), configurable: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/projects/project-1/datasheet") && !init?.method) return new Response(JSON.stringify({ error: { code: "DATASHEET_NOT_FOUND" } }), { status: 404 });
    if (url.endsWith("/api/projects/project-1/datasheet/create")) return jsonResponse(initialBundle, 201);
    if (url.endsWith("/api/projects/project-1/datasheet/regenerate")) return jsonResponse(regeneratedBundle, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/export") && !init?.method) return jsonResponse({ exports: [completedExport] }, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/layout") && !init?.method) return new Response(JSON.stringify({ error: { code: "DATASHEET_LAYOUT_NOT_FOUND" } }), { status: 404 });
    if (url.endsWith("/api/projects/project-1/datasheet/layout/generate")) return jsonResponse(experimentalLayout, 201);
    if (url.endsWith("/api/projects/project-1/datasheet/layout/reset")) return jsonResponse(experimentalLayout, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/layout") && init?.method === "PATCH") return jsonResponse(experimentalLayout, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/layout") && !init?.method) return new Response(JSON.stringify({ error: { code: "DATASHEET_LAYOUT_NOT_FOUND" } }), { status: 404 });
    if (url.endsWith("/api/projects/project-1/datasheet/layout/generate")) return jsonResponse(experimentalLayout, 201);
    if (url.endsWith("/api/projects/project-1/datasheet/layout/reset")) return jsonResponse(experimentalLayout, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/layout") && init?.method === "PATCH") return jsonResponse(experimentalLayout, 200);
    if (url.endsWith("/api/projects/project-1/datasheet/export/pdf")) return jsonResponse(completedExport, 201);
    if (url.endsWith("/api/projects/project-1/datasheet") && init?.method === "PATCH") {
      if (failNextDocumentSave) return jsonResponse({ error: { message: "Invalid request", code: "VALIDATION_ERROR" } }, 422);
      return jsonResponse({ ...initialBundle, document: { ...initialBundle.document, lastSavedAt: "2026-07-08T10:05:00.000Z" } }, 200);
    }
    if (url.endsWith("/api/projects/project-1/datasheet/template")) return jsonResponse({ ...regeneratedBundle, template: { ...regeneratedBundle.template, revision: "Rev. C" } }, 200);
    return jsonResponse({ run: null, pages: [], pagination: { page: 1, pageSize: 0, total: 0, pageCount: 0 } }, 200);
  });
  globalThis.fetch = fetchMock as typeof fetch;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderComposer() {
  await act(async () => {
    root.render(<DatasheetComposer projectId="project-1" status="REVIEW_REQUIRED" originalPdfUrl="/original.pdf" />);
  });
  await flush();
}

async function createDatasheet() {
  await renderComposer();
  await act(async () => clickButton("Create editable datasheet"));
  await flush();
}

async function regenerateDatasheet() {
  await createDatasheet();
  await act(async () => clickButton("Regenerate editable datasheet from extraction"));
  await flush();
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function clickTool(label: string) {
  const button = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  expect(button).not.toBeNull();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("DatasheetComposer", () => {
  it("creates an editable datasheet from the extracted project", async () => {
    await createDatasheet();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/create", expect.objectContaining({ method: "POST" }));
    expect(container.textContent).toContain("Datasheet Editor");
  });
  it("renders a Word-like editor workspace and keeps advanced layout controls collapsed", async () => {
    await createDatasheet();

    const workspace = container.querySelector('[data-testid="editor-workspace"]');
    const canvas = container.querySelector('[data-testid="editor-document-canvas"]');
    const advanced = container.querySelector('[data-testid="advanced-layout-controls"]') as HTMLDetailsElement | null;

    expect(workspace?.className).toContain("bg-slate-200");
    expect(canvas?.className).toContain("max-w-[794px]");
    expect(canvas?.className).toContain("shadow-lg");
    expect(container.textContent).toContain("Header/Footer Settings");
    expect(container.textContent).toContain("Format");
    expect(container.textContent).toContain("Lists");
    expect(container.textContent).toContain("Table");
    expect(container.textContent).toContain("Layout");
    expect(container.textContent).toContain("Image");
    expect(container.textContent).toContain("Advanced layout controls");
    expect(advanced?.open).toBe(false);
    expect(container.querySelector('button[aria-label="Bold"]')?.className).toContain("gap-1.5");
  });


  it("keeps generated datasheet list spacing compact in editor CSS", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain(".ProseMirror ul { @apply mb-2 list-disc space-y-0.5 pl-5; }");
    expect(css).toContain(".ProseMirror li p { @apply mb-0; }");
  });


  it("saves the datasheet editor payload successfully", async () => {
    await createDatasheet();
    await act(async () => clickButton("Save"));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet", expect.objectContaining({ method: "PATCH" }));
    expect(container.textContent).toContain("Saved");
  });

  it("shows the safe save failure message", async () => {
    failNextDocumentSave = true;
    await createDatasheet();
    await act(async () => clickButton("Save"));
    await flush();

    expect(container.textContent).toContain("Save failed: Invalid request");
  });

  it("shows regenerate after a datasheet exists and calls the route", async () => {
    await createDatasheet();
    expect(container.textContent).toContain("Regenerate editable datasheet from extraction");

    await act(async () => clickButton("Regenerate editable datasheet from extraction"));
    await flush();

    expect(confirmMock).toHaveBeenCalledWith("This will overwrite the current editable draft. Template settings will be preserved.");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/regenerate", expect.objectContaining({ method: "POST" }));
    expect(container.textContent).toContain("Editable datasheet regenerated: 12 sections, 5 tables, 3 figures, 2 warnings, 0 unresolved symbols.");
    const inputs = Array.from(container.querySelectorAll("input")).map((input) => input.value);
    expect(inputs).toContain("Low-Dropout Regulators");
    expect(container.textContent).toContain("Fresh draft");
  });

  it("supports long product code preview without breaking the template header layout", async () => {
    await regenerateDatasheet();
    await act(async () => clickButton("Branding Template"));
    await flush();

    const productCodePreview = container.querySelector('[data-testid="template-preview-product-code"]');
    const productTitlePreview = container.querySelector('[data-testid="template-preview-product-title"]');

    expect(productCodePreview?.textContent).toContain("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(productCodePreview?.className).toContain("whitespace-normal");
    expect(productCodePreview?.className).toContain("break-words");
    expect(productTitlePreview?.textContent).toContain("Low-Dropout Regulators");
  });

  it("filters cleanup review items", async () => {
    await createDatasheet();
    await act(async () => clickButton("Cleanup Review"));

    expect(container.textContent).toContain("All (4)");
    await act(async () => clickButton("Removed images"));
    expect(container.textContent).toContain("logos/source.png");
    expect(container.textContent).not.toContain("SOURCE HEADER");
    await act(async () => clickButton("Manually restored"));
    expect(container.textContent).toContain("RESTORED HEADER");
  });


  it("exports a branded PDF and shows download history", async () => {
    await createDatasheet();
    await act(async () => clickButton("Exports"));
    await flush();
    expect(container.textContent).toContain("Branded PDF Export");
    expect(container.textContent).toContain("Current export mode: Auto flow.");
    expect(container.textContent).toContain("Current export mode: Auto flow.");
    expect(container.textContent).toContain("vellore-semicon-vs123-2026-07-13.pdf");

    const buttonsBefore = fetchMock.mock.calls.length;
    await act(async () => clickButton("Export PDF"));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/export/pdf", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(buttonsBefore);
    expect(container.textContent).toContain("Download PDF");
  });

  it("prevents export while editor changes are unsaved", async () => {
    await createDatasheet();
    const titleInput = Array.from(container.querySelectorAll("input")).find((input) => input.value === "Generic Datasheet");
    expect(titleInput).toBeDefined();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(titleInput, "Changed title");
      titleInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => clickButton("Exports"));
    await flush();

    expect(container.textContent).toContain("Save changes to update preview/export.");
    const exportButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Export PDF"));
    expect(exportButton).toHaveProperty("disabled", true);
  });

  it("marks the saved layout editor experimental and keeps it collapsed by default", async () => {
    await createDatasheet();
    await act(async () => clickButton("Paged Layout Editor"));
    await flush();

    expect(container.textContent).toContain("Visual layout editor is experimental.");
    expect(container.textContent).toContain("Auto Flow is still the recommended workflow");
    const details = container.querySelector('[data-testid="experimental-saved-layout-editor"]') as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  it("renders the Paged Preview tab with zoom controls and the protected HTML preview route", async () => {
    await createDatasheet();
    await act(async () => clickButton("Paged Preview"));
    await flush();

    expect(container.textContent).toContain("Paged Preview");
    expect(container.textContent).toContain("Saved datasheet rendered through the same A4 layout used for branded PDF export.");
    expect(container.textContent).toContain("Preview mode: Auto flow.");
    expect(container.textContent).toContain("Fit width");
    expect(container.textContent).toContain("75%");
    expect(container.textContent).toContain("100%");
    expect(container.textContent).toContain("Open in new tab");
    const frame = container.querySelector('[data-testid="paged-preview-frame"]') as HTMLIFrameElement | null;
    expect(frame?.getAttribute("src")).toContain("/api/projects/project-1/datasheet/export/preview");
    expect(frame?.className).toContain("max-w-[980px]");

    await act(async () => clickButton("75%"));
    expect(frame?.className).toContain("w-[75%]");
  });

  it("shows the preview/export warning when paged preview has unsaved editor changes", async () => {
    await createDatasheet();
    const titleInput = Array.from(container.querySelectorAll("input")).find((input) => input.value === "Generic Datasheet");
    expect(titleInput).toBeDefined();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(titleInput, "Changed title");
      titleInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => clickButton("Paged Preview"));
    await flush();

    expect(container.textContent).toContain("Save changes to update preview/export.");
  });

  it("stores keep-with-next metadata in editorJson when saved", async () => {
    await createDatasheet();
    await act(async () => clickTool("Keep with next"));
    await act(async () => clickButton("Save"));
    await flush();

    const saveCall = [...fetchMock.mock.calls].reverse().find((call) => String(call[0]).endsWith("/api/projects/project-1/datasheet") && (call[1] as RequestInit | undefined)?.method === "PATCH");
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
    expect(JSON.stringify(body.editorJson)).toContain('"keepWithNext":true');
  });

  it("stores an inserted page break in editorJson and shows its editor marker", async () => {
    await createDatasheet();
    await act(async () => clickTool("Insert page break"));
    expect(container.textContent).toContain("Page Break");
    await act(async () => clickButton("Save"));
    await flush();

    const saveCall = [...fetchMock.mock.calls].reverse().find((call) => String(call[0]).endsWith("/api/projects/project-1/datasheet") && (call[1] as RequestInit | undefined)?.method === "PATCH");
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
    expect(JSON.stringify(body.editorJson)).toContain('"type":"pageBreak"');
  });

  it("marks preview/export dirty when header/footer settings are edited", async () => {
    await createDatasheet();
    const websiteInput = Array.from(container.querySelectorAll("input")).find((input) => input.value === "www.velloresemicon.com");
    expect(websiteInput).toBeDefined();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(websiteInput, "docs.velloresemicon.com");
      websiteInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Unsaved header/footer changes");

    await act(async () => clickButton("Paged Preview"));
    await flush();
    expect(container.textContent).toContain("Save changes to update preview/export.");
  });

  it("saves header/footer settings from the editor panel", async () => {
    await createDatasheet();
    const websiteInput = Array.from(container.querySelectorAll("input")).find((input) => input.value === "www.velloresemicon.com");
    expect(websiteInput).toBeDefined();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(websiteInput, "docs.velloresemicon.com");
      websiteInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => clickButton("Save header/footer"));
    await flush();

    const templateCall = [...fetchMock.mock.calls].reverse().find((call) => String(call[0]).endsWith("/api/projects/project-1/datasheet/template") && (call[1] as RequestInit | undefined)?.method === "PATCH");
    expect(templateCall).toBeDefined();
    const body = JSON.parse(String((templateCall?.[1] as RequestInit).body));
    expect(body.website).toBe("docs.velloresemicon.com");
  });

  it("shows and saves layout mode and density from the shared template settings panel", async () => {
    await createDatasheet();
    expect(container.textContent).toContain("Layout: Two-column technical datasheet. Density: Technical dense.");
    await act(async () => clickButton("Paged Preview"));
    expect(container.textContent).toContain("Current layout: Two-column technical datasheet. Density: Technical dense.");
    await act(async () => clickButton("Datasheet Editor"));
    const selects = Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
    const layoutModeSelect = selects[0] ?? null;
    const layoutDensitySelect = selects[1] ?? null;
    expect(layoutModeSelect?.value).toBe("two-column");
    expect(layoutDensitySelect?.value).toBe("technical-dense");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
      setter?.call(layoutModeSelect, "single-column");
      layoutModeSelect!.dispatchEvent(new Event("change", { bubbles: true }));
      setter?.call(layoutDensitySelect, "comfortable");
      layoutDensitySelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Unsaved header/footer changes");
    await act(async () => clickButton("Save header/footer"));
    await flush();

    const templateCall = [...fetchMock.mock.calls].reverse().find((call) => String(call[0]).endsWith("/api/projects/project-1/datasheet/template") && (call[1] as RequestInit | undefined)?.method === "PATCH");
    const body = JSON.parse(String((templateCall?.[1] as RequestInit).body));
    expect(body.layoutMode).toBe("single-column");
    expect(body.layoutDensity).toBe("comfortable");
  });

  it("saves branding template fields", async () => {
    await createDatasheet();
    await act(async () => clickButton("Branding Template"));
    await act(async () => clickButton("Save template"));

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/template", expect.objectContaining({ method: "PATCH" }));
    expect(container.textContent).toContain("Saved");
  });
});



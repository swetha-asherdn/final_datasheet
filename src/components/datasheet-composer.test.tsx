/** @vitest-environment jsdom */

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
    primaryColor: "#0D2B55",
    accentColor: "#D6533E",
    footerText: "Preliminary Datasheet | Rev. A",
    showPageNumbers: true
  }
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
    revision: "Rev. B"
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/projects/project-1/datasheet") && !init?.method) return new Response(JSON.stringify({ error: { code: "DATASHEET_NOT_FOUND" } }), { status: 404 });
    if (url.endsWith("/api/projects/project-1/datasheet/create")) return jsonResponse(initialBundle, 201);
    if (url.endsWith("/api/projects/project-1/datasheet/regenerate")) return jsonResponse(regeneratedBundle, 200);
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

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("DatasheetComposer", () => {
  it("creates an editable datasheet from the extracted project", async () => {
    await createDatasheet();

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/create", expect.objectContaining({ method: "POST" }));
    expect(container.textContent).toContain("Datasheet Editor");
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
    expect(container.textContent).toContain("Editable datasheet regenerated from the latest extraction.");
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

  it("saves branding template fields", async () => {
    await createDatasheet();
    await act(async () => clickButton("Branding Template"));
    await act(async () => clickButton("Save template"));

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/datasheet/template", expect.objectContaining({ method: "PATCH" }));
    expect(container.textContent).toContain("Saved");
  });
});

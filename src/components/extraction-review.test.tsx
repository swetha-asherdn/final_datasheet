/** @vitest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionReview } from "@/components/extraction-review";

type JsonResponseBody = Record<string, unknown>;

const summaryResponse = {
  run: {
    id: "run1",
    status: "COMPLETED",
    pageCount: 2,
    summary: { textBlockCount: 4, imageCount: 2, tableCount: 1, warningCount: 0, ocrUsed: false, nativeTextDetected: true },
    warnings: [],
    errorSummary: null
  },
  pages: [
    { pageNumber: 1, width: 612, height: 792, textBlockCount: 2, imageCount: 1, tableCount: 0, warnings: [], confidence: 0.9, previewUrl: "/api/projects/project-1/artifacts/pages/1/preview" },
    { pageNumber: 2, width: 612, height: 792, textBlockCount: 2, imageCount: 1, tableCount: 1, warnings: [], confidence: 0.88, previewUrl: "/api/projects/project-1/artifacts/pages/2/preview" }
  ],
  pagination: { page: 1, pageSize: 8, total: 2, pageCount: 1 }
};

const pageResponses: Record<string, JsonResponseBody> = {
  "/api/projects/project-1/extraction/pages/1": {
    page: {
      pageNumber: 1,
      width: 612,
      height: 792,
      textBlockCount: 2,
      imageCount: 1,
      tableCount: 0,
      warnings: [],
      confidence: 0.9,
      previewUrl: "/api/projects/project-1/artifacts/pages/1/preview",
      textBlocks: [{ id: "block-1", type: "paragraph", text: "Page one text", extractionMethod: "native", confidence: 0.9, readingOrderIndex: 0 }],
      images: [{ id: "image-1", pageNumber: 1, width: 200, height: 100, mimeType: "image/png", confidence: 0.8, warnings: [], url: "/api/projects/project-1/artifacts/pages/1/images/image-1" }],
      tables: []
    }
  },
  "/api/projects/project-1/extraction/pages/2": {
    page: {
      pageNumber: 2,
      width: 612,
      height: 792,
      textBlockCount: 2,
      imageCount: 1,
      tableCount: 1,
      warnings: [],
      confidence: 0.88,
      previewUrl: "/api/projects/project-1/artifacts/pages/2/preview",
      textBlocks: [{ id: "block-2", type: "paragraph", text: "Page two text", extractionMethod: "native", confidence: 0.92, readingOrderIndex: 0 }],
      images: [{ id: "image-2", pageNumber: 2, width: 220, height: 120, mimeType: "image/png", confidence: 0.82, warnings: [], url: "/api/projects/project-1/artifacts/pages/2/images/image-2" }],
      tables: [{ id: "table-1", confidence: 0.7, warnings: [], rows: [[{ text: "R1C1", rowSpan: 1, colSpan: 1 }]] }]
    }
  }
};

const imageOutcomes = new Map<string, "load" | "error">();
const originalImage = globalThis.Image;

class MockImage {
  onload: ((event?: Event) => void) | null = null;
  onerror: ((event?: Event) => void) | null = null;
  private value = "";

  set src(next: string) {
    this.value = next;
    queueMicrotask(() => {
      const outcome = imageOutcomes.get(next) ?? "load";
      if (outcome === "error") {
        this.onerror?.(new Event("error"));
        return;
      }
      this.onload?.(new Event("load"));
    });
  }

  get src() {
    return this.value;
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  imageOutcomes.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  globalThis.Image = MockImage as unknown as typeof Image;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/api/projects/project-1/extraction")) {
      return new Response(JSON.stringify(summaryResponse), { status: 200, headers: { "content-type": "application/json" } });
    }

    const pageResponse = pageResponses[url.replace("http://localhost", "")];
    if (pageResponse) {
      return new Response(JSON.stringify(pageResponse), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  globalThis.Image = originalImage;
  vi.restoreAllMocks();
});

async function renderReview() {
  await act(async () => {
    root.render(<ExtractionReview projectId="project-1" status="REVIEW_REQUIRED" originalPdfUrl="/original.pdf" />);
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await flush();
    }
  }
}

describe("ExtractionReview preview rendering", () => {
  it("renders the selected page preview URL from the page API response", async () => {
    await renderReview();

    await waitFor(() => {
      const image = container.querySelector('img[alt="Extracted page 1"]') as HTMLImageElement | null;
      expect(image).not.toBeNull();
      expect(image?.getAttribute("src")).toBe("/api/projects/project-1/artifacts/pages/1/preview");
    });
  });

  it("clears the loading state when the selected preview image loads", async () => {
    await renderReview();

    await waitFor(() => {
      expect(container.textContent).not.toContain("Loading page preview...");
      expect(container.querySelector('img[alt="Extracted page 1"]')).not.toBeNull();
    });
  });

  it("shows an error fallback and retry button when the selected preview image fails", async () => {
    imageOutcomes.set("/api/projects/project-1/artifacts/pages/1/preview", "error");
    await renderReview();

    await waitFor(() => {
      expect(container.textContent).toContain("Preview could not be loaded");
      const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Retry preview"));
      expect(retryButton).toBeDefined();
    });
  });

  it("switches the selected preview when the user changes pages", async () => {
    await renderReview();

    await waitFor(() => {
      expect(container.querySelector('img[alt="Extracted page 1"]')).not.toBeNull();
    });

    const pageTwoButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Page 2"));
    expect(pageTwoButton).toBeDefined();

    await act(async () => {
      pageTwoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      const image = container.querySelector('img[alt="Extracted page 2"]') as HTMLImageElement | null;
      expect(image).not.toBeNull();
      expect(image?.getAttribute("src")).toBe("/api/projects/project-1/artifacts/pages/2/preview");
      expect(container.textContent).toContain("Page two text");
    });
  });
});




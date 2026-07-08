import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocumentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: { MAX_UPLOAD_BYTES: 1024 } }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: getDocumentMock }));

import { AppError } from "@/lib/errors";
import { validatePdf, validatePdfBasics } from "@/lib/pdf-validation";

describe("validatePdfBasics", () => {
  it("rejects non-pdf files", () => {
    expect(() => validatePdfBasics("sample.txt", "text/plain", Buffer.from("hello"))).toThrow(AppError);
  });

  it("rejects invalid pdf signatures", () => {
    expect(() => validatePdfBasics("sample.pdf", "application/pdf", Buffer.from("hello"))).toThrow(
      /valid PDF/i
    );
  });

  it("rejects oversized files", () => {
    expect(() => validatePdfBasics("sample.pdf", "application/pdf", Buffer.alloc(2048, "a"))).toThrow(/limit/i);
  });
});

describe("validatePdf", () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
  });

  it("returns page count for a valid pdf when PDF.js succeeds", async () => {
    const destroyMock = vi.fn(async () => undefined);
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({ numPages: 4, destroy: destroyMock })
    });

    await expect(validatePdf("sample.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"))).resolves.toEqual({
      checksum: expect.any(String),
      pageCount: 4
    });
    expect(getDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Uint8Array),
        disableWorker: true,
        isEvalSupported: false,
        useWorkerFetch: false
      })
    );
    expect(destroyMock).toHaveBeenCalled();
  });

  it("returns a null page count when PDF.js parsing fails", async () => {
    getDocumentMock.mockReturnValue({
      promise: {
        then: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error("Invalid PDF structure"))
      }
    });

    await expect(validatePdf("sample.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"))).resolves.toEqual({
      checksum: expect.any(String),
      pageCount: null
    });
  });
});

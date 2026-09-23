import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfDocumentLoadMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: { MAX_UPLOAD_BYTES: 1024 } }));
vi.mock("pdf-lib", () => ({ PDFDocument: { load: pdfDocumentLoadMock } }));

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
    pdfDocumentLoadMock.mockReset();
  });

  it("returns page count for a valid pdf when PDF parsing succeeds", async () => {
    pdfDocumentLoadMock.mockResolvedValue({ getPageCount: () => 4 });

    await expect(validatePdf("sample.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"))).resolves.toEqual({
      checksum: expect.any(String),
      pageCount: 4
    });
    expect(pdfDocumentLoadMock).toHaveBeenCalledWith(expect.any(Buffer), { ignoreEncryption: true });
  });

  it("returns a null page count when PDF parsing fails", async () => {
    pdfDocumentLoadMock.mockRejectedValue(new Error("Invalid PDF structure"));

    await expect(validatePdf("sample.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"))).resolves.toEqual({
      checksum: expect.any(String),
      pageCount: null
    });
  });
});

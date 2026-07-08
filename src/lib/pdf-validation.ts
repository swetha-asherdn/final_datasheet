import { createHash } from "crypto";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export type ValidatedPdf = { checksum: string; pageCount: number | null };

const PDF_SIGNATURE = "%PDF-";

type PdfJsGetDocument = typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument;
type PdfJsDocumentInit = Parameters<PdfJsGetDocument>[0] & {
  disableWorker?: boolean;
  useWorkerFetch?: boolean;
};

export function validatePdfBasics(fileName: string, mimeType: string, bytes: Buffer) {
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    throw new AppError("Only .pdf files are accepted", 422, { code: "INVALID_FILE_EXTENSION" });
  }

  if (mimeType !== "application/pdf") {
    throw new AppError("The uploaded file must use the application/pdf MIME type", 422, { code: "INVALID_MIME_TYPE" });
  }

  if (bytes.length === 0) {
    throw new AppError("The PDF file is empty", 422, { code: "EMPTY_FILE" });
  }

  if (bytes.length > env.MAX_UPLOAD_BYTES) {
    throw new AppError(`PDF exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`, 413, {
      code: "FILE_TOO_LARGE"
    });
  }

  if (bytes.subarray(0, PDF_SIGNATURE.length).toString("ascii") !== PDF_SIGNATURE) {
    throw new AppError("The file does not look like a valid PDF", 422, { code: "INVALID_PDF_SIGNATURE" });
  }
}

export async function validatePdf(fileName: string, mimeType: string, bytes: Buffer): Promise<ValidatedPdf> {
  validatePdfBasics(fileName, mimeType, bytes);

  return {
    checksum: createHash("sha256").update(bytes).digest("hex"),
    pageCount: await detectPageCount(bytes)
  };
}

async function detectPageCount(bytes: Buffer): Promise<number | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const documentInit: PdfJsDocumentInit = {
      data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false
    };
    const loadingTask = pdfjs.getDocument(documentInit);
    const document = await loadingTask.promise;

    try {
      return Number.isFinite(document.numPages) ? document.numPages : null;
    } finally {
      await document.destroy();
    }
  } catch (error) {
    logPdfParseError(error);
    return null;
  }
}

function logPdfParseError(error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  console.error("[pdf-validation] PDF page-count detection failed", error);
}

import fs from "fs";
import { PDFDocument } from "pdf-lib";

async function main() {
  const f = "c:/Users/Sandy/Downloads/vellore-semicon-vs-cw29150r-xx-vs-cw29151r-xx-vs-cw29150r-adj-2026-10-06.pdf";
  const doc = await PDFDocument.load(fs.readFileSync(f));
  console.log("Total pages:", doc.getPageCount());
  // Let's use pdfjs or text extraction if possible, or just dump basic info
}

main().catch(console.error);

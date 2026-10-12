import fs from "fs";
import { PDFDocument } from "pdf-lib";

async function main() {
  const f = "scratch/CW29150_fixed.export.pdf";
  if (fs.existsSync(f)) {
    const doc = await PDFDocument.load(fs.readFileSync(f));
    console.log(f, "pages:", doc.getPageCount());
  }
}

main().catch(console.error);

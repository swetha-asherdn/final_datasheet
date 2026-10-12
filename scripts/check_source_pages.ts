import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

async function main() {
  const files = [
    'CW29150R-XX CW29150R-ADJ CW29151R-XX_vsp (2).pdf',
    'scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json'
  ];
  for (const f of files) {
    if (fs.existsSync(f)) {
      if (f.endsWith('.pdf')) {
        const doc = await PDFDocument.load(fs.readFileSync(f));
        console.log(f, 'page count:', doc.getPageCount());
      } else {
        const m = JSON.parse(fs.readFileSync(f, 'utf8'));
        console.log(f, 'page count:', m.pages.length);
      }
    }
  }
}
main().catch(console.error);

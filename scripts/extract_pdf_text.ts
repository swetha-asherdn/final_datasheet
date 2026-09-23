import fs from 'fs';
import path from 'path';
async function extractText(pdfPath: string) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  // Load pdfjs at runtime with fallbacks to avoid static import errors during typecheck
  let getDocument: any;
  try {
    // prefer legacy build if available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getDocument = require('pdfjs-dist/legacy/build/pdf.js').getDocument;
  } catch (err) {
    // fallback to dynamic ESM import if installed under a different entry
    // this keeps the script optional and avoids blocking the typechecker
    // when `pdfjs-dist` is not available in the environment.
    const pd = await import('pdfjs-dist').catch(() => null);
    getDocument = pd ? (pd.getDocument || (pd as any).default?.getDocument) : undefined;
  }
  if (!getDocument) throw new Error('pdfjs-dist not available at runtime');
  const doc = await getDocument({ data }).promise;
  let full = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str || '').join(' ');
    full += strings + '\n';
  }
  return full;
}

async function main() {
  const pdfPath = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(2);
  }
  const text = await extractText(pdfPath);
  const out = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.pdf.txt');
  fs.writeFileSync(out, text, 'utf-8');
  console.log('Wrote extracted text to', out);
}

main().catch((err) => { console.error(err); process.exit(1); });

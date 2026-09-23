import fs from 'fs';
import path from 'path';

async function main() {
  const htmlPath = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('Export HTML not found:', htmlPath);
    process.exit(2);
  }
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const { renderHtmlToPdf } = await import('../src/server/datasheet/export-service');
  try {
    const pdf = await renderHtmlToPdf(html);
    const out = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.pdf');
    fs.writeFileSync(out, pdf);
    console.log('Wrote PDF to', out);
  } catch (err) {
    console.error('PDF render failed:', err);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

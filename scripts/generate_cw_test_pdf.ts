import fs from 'fs';
import path from 'path';
import { applySupplierProductCodeMappings } from '../src/lib/supplier-product-code-mapping';
import { renderHtmlToPdf } from '../src/server/datasheet/export-service';

async function main() {
  const codes = ['CW29150R-XX', 'CW29150R-ADJ', 'CW29151R-XX'];
  const mappings = codes.map((c, i) => ({
    id: `t-${i}`,
    supplierCode: c,
    velloreCode: `VS-${c}`,
    pageNumber: 1,
    section: 'body',
    confidence: 0.99,
    status: 'confirmed',
  }));

  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><title>CW Test</title></head><body>
  <header><h1>Product family: ${codes.join(' / ')}</h1><div class="product-header">Header code: ${codes[0]}</div></header>
  <main>
    <h2>Overview</h2>
    <p>The regulator ${codes[0]} is ideal for testing replacements. Variant ${codes[1]} supports adjustable output.</p>
    <section>
      <h3>Pin descriptions</h3>
      <p>Pin 1: IN, Pin 2: OUT (${codes[2]}), Pin 3: GND</p>
    </section>
    <section>
      <h3>Table</h3>
      <table border="1"><tr><th>Part</th><th>Value</th></tr>
        <tr><td>${codes[0]}</td><td>Some spec 10V</td></tr>
        <tr><td>${codes[1]}</td><td>Adj range</td></tr>
      </table>
    </section>
    <figure>
      <img src="data:image/png;base64,iVBORw0KGgo=" alt="figure" />
      <figcaption>Package drawing for ${codes[2]}</figcaption>
    </figure>
  </main>
  <footer>Document reference: ${codes[0]} Rev A</footer>
  </body></html>`;

  // Apply mappings to HTML text using existing mapping function
  const applyResult = applySupplierProductCodeMappings({ text: html, mappings });
  const outHtml = applyResult.text;

  const outDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'cw_test.html');
  fs.writeFileSync(htmlPath, outHtml, 'utf-8');
  console.log('Wrote test HTML to', htmlPath);

  // Render PDF
  const pdf = await renderHtmlToPdf(outHtml);
  const pdfPath = path.join(outDir, 'cw_test.pdf');
  fs.writeFileSync(pdfPath, pdf);
  console.log('Wrote PDF to', pdfPath);

  const bin = pdf.toString('utf8');
  const stats = codes.map((c) => ({ code: c, occurrences: (bin.match(new RegExp(c, 'g')) || []).length }));
  const replacedStats = codes.map((c) => ({ code: `VS-${c}`, occurrences: (bin.match(new RegExp(`VS-${c}`, 'g')) || []).length }));

  console.log('Replacement apply result:', { replacedCount: applyResult.replacedCount, warnings: applyResult.warnings });
  console.log('Original code occurrences in PDF (binary substring count):', stats);
  console.log('Expected VS- code occurrences in PDF (binary substring count):', replacedStats);
}

main().catch((err) => { console.error(err); process.exit(1); });

import fs from 'fs';
import path from 'path';
import { detectSupplierProductCodes, buildSuggestedSupplierMappings, applySupplierProductCodeMappings } from '../src/lib/supplier-product-code-mapping';
import { renderHtmlToPdf } from '../src/server/datasheet/export-service';

async function extractTextFromPdfBuffer(buffer: Buffer) {
  // runtime load pdfjs
  let getDocument: any;
  try {
    getDocument = require('pdfjs-dist/legacy/build/pdf.js').getDocument;
  } catch (err) {
    const pd = await import('pdfjs-dist').catch(() => null);
    getDocument = pd ? (pd.getDocument || (pd as any).default?.getDocument) : undefined;
  }
  if (!getDocument) throw new Error('pdfjs-dist not available at runtime');
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
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
  const parsedPath = path.resolve(process.cwd(), 'scratch', 'CW29150_parsed.txt');
  if (!fs.existsSync(parsedPath)) {
    console.error('Parsed text not found at', parsedPath);
    process.exit(2);
  }
  const raw = fs.readFileSync(parsedPath, 'utf-8');
  const pages = raw.split('\n\n---PAGE---\n\n').map((p) => p.trim());

  const candidates = detectSupplierProductCodes(pages.map((text, i) => ({ pageNumber: i + 1, text })));
  const mappings = buildSuggestedSupplierMappings(candidates, 'VS');

  console.log('Detected candidates:', candidates.map((c) => c.supplierCode));
  console.log('Suggested mappings count:', mappings.length);

  // Build simple HTML preserving page breaks
  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  const htmlPages = pages.map((p) => `<div style="white-space:pre-wrap; font-family: Arial, Helvetica, sans-serif; font-size:10pt;">${escapeHtml(p)}</div>`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm} .page{page-break-after:always}</style></head><body>${htmlPages.map((h) => `<div class="page">${h}</div>`).join('')}</body></html>`;

  // Apply mappings
  const applyResult = applySupplierProductCodeMappings({ text: html, mappings });
  const outHtml = applyResult.text;

  const outDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'cw29150_parsed.html');
  fs.writeFileSync(htmlPath, outHtml, 'utf-8');
  console.log('Wrote HTML to', htmlPath);

  // Render PDF
  const pdfBuf = await renderHtmlToPdf(outHtml);
  const pdfPath = path.join(outDir, 'CW29150_parsed_replaced.pdf');
  fs.writeFileSync(pdfPath, pdfBuf);
  console.log('Wrote PDF to', pdfPath);

  // Extract text from PDF
  let extracted = '';
  try {
    extracted = await extractTextFromPdfBuffer(pdfBuf);
  } catch (err) {
    console.error('Failed to extract text from PDF:', err);
  }
  const extractedPath = path.join(outDir, 'CW29150_parsed_replaced.pdf.txt');
  fs.writeFileSync(extractedPath, extracted, 'utf-8');
  console.log('Wrote extracted text to', extractedPath);

  // Save replaced source text
  const replacedTextPath = path.join(outDir, 'CW29150_parsed_replaced.txt');
  fs.writeFileSync(replacedTextPath, applyResult.text, 'utf-8');
  console.log('Wrote replaced source to', replacedTextPath);

  // Verification checks
  const report: any = { mappings: [] };
  for (const m of mappings) {
    const orig = m.supplierCode;
    const repl = m.velloreCode;
    const escOrig = orig.replace(/[\\-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const escRepl = repl.replace(/[\\-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const before = (raw.match(new RegExp(escOrig, 'g')) || []).length;
    const after = (extracted.match(new RegExp(escRepl, 'g')) || []).length;
    const remaining = (extracted.match(new RegExp(escOrig, 'g')) || []).length;
    report.mappings.push({ supplierCode: orig, velloreCode: repl, before, replacedInPdf: after, remainingOriginalInPdf: remaining });
  }

  // Count total occurrences
  report.totalReplacedReportedByFunction = applyResult.replacedCount;
  report.warnings = applyResult.warnings;

  const reportPath = path.join(outDir, 'CW29150_mapping_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('Wrote mapping report to', reportPath);

  console.log('Done. Summary:');
  console.log('Mappings detected:', report.mappings.length);
  for (const m of report.mappings) {
    console.log(`${m.supplierCode} -> ${m.velloreCode}: before=${m.before}, replacedInPdf=${m.replacedInPdf}, remainingOriginalInPdf=${m.remainingOriginalInPdf}`);
  }
  console.log('Replacements applied (function):', applyResult.replacedCount, 'warnings:', applyResult.warnings);
}

main().catch((err) => { console.error(err); process.exit(1); });

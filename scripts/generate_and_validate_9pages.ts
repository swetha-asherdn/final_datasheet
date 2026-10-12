import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { resolveChromiumExecutablePath } from '../src/server/datasheet/chromium';
import { PDFDocument } from 'pdf-lib';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';
import { renderExportDocumentHtml, buildExportPageModel } from '../src/server/datasheet/export-renderer';

async function main() {
  const manifestPath = 'scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log('--- 1. Normalizing Extraction ---');
  const normalized = normalizeDatasheetExtraction(manifest.pages);

  console.log('Removed text blocks count:', normalized.cleanupReport.removedTextBlocks.length);
  console.log('Removed images count:', normalized.cleanupReport.removedImages.length);
  normalized.cleanupReport.removedImages.forEach((img) => {
    console.log(`  Removed image: ${img.sourceId} (page ${img.pageNumber}) - reasons: ${img.reasons.join(', ')}`);
  });

  console.log('\nKept images count:', normalized.cleanupReport.keptImages.length);
  normalized.cleanupReport.keptImages.forEach((img) => {
    console.log(`  Kept image: ${img.sourceId} (page ${img.pageNumber})`);
  });

  const template: any = {
    logoAssetPath: 'public/branding/vellore-semicon-logo.svg',
    companyName: 'Vellore Semicon',
    website: 'www.velloresemicon.com',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productTitle: '1.5A Low-Dropout Regulators',
    documentStatus: 'Preliminary Datasheet',
    revision: 'Rev. A',
    layoutMode: 'two-column',
    layoutDensity: 'technical-dense',
    pageFillStrategy: 'balanced',
    primaryColor: '#0D2B55',
    accentColor: '#D6533E'
  };

  console.log('\n--- 2. Building Export Page Model ---');
  const pageModel = buildExportPageModel({
    document: {
      title: '1.5A Low-Dropout Regulators',
      productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
      productCategory: '1.5A Low-Dropout Regulators',
      editorJson: normalized.editorJson
    },
    template
  });

  console.log('Model generated pages count:', pageModel.pages.length);
  pageModel.pages.forEach((p, idx) => {
    console.log(`Page ${idx + 1}: height=${p.usedHeight}mm, blocks=${p.blocks.length}`);
  });

  console.log('\n--- 3. Rendering HTML ---');
  const html = renderExportDocumentHtml(pageModel, template, { mode: 'pdf' });
  const htmlPath = 'scratch/rendered_9pages.html';
  fs.writeFileSync(htmlPath, html);
  console.log('Wrote HTML to', htmlPath);

  console.log('\n--- 4. Generating PDF with Puppeteer ---');
  const browser = await puppeteer.launch({
    executablePath: resolveChromiumExecutablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfPath = 'scratch/vellore_semicon_validated_9pages.pdf';
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  console.log('Wrote PDF to', pdfPath);

  const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
  console.log('Actual PDF page count:', pdfDoc.getPageCount());

  console.log('\n--- 5. Capturing Page Screenshots ---');
  const outDir = 'scratch/page_screenshots';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const pageElements = await page.$$('.pdf-page');
  console.log(`Found ${pageElements.length} .pdf-page elements`);
  for (let i = 0; i < pageElements.length; i++) {
    const shotPath = path.join(outDir, `page_${i + 1}.png`);
    await pageElements[i].screenshot({ path: shotPath });
    console.log(`Saved screenshot for Page ${i + 1} -> ${shotPath}`);
  }

  await browser.close();
  console.log('\nValidation script finished successfully!');
}

main().catch((err) => {
  console.error('Error in validation script:', err);
  process.exit(1);
});

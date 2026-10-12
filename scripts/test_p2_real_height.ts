import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { renderExportDocumentHtml } from '../src/server/datasheet/export-renderer';

async function main() {
  const p2Tiptap = JSON.parse(fs.readFileSync('scratch/p2_tiptap.json', 'utf8'));

  const template: any = {
    logoAssetPath: '/branding/vellore-semicon-logo.svg',
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

  const { renderTiptapNodesToExportBlocks } = await import('../src/server/datasheet/export-renderer');
  const blocks = renderTiptapNodesToExportBlocks(p2Tiptap.content, { layoutMode: 'two-column', layoutDensity: 'technical-dense' });

  // Put all blocks on ONE single page without splitting
  const pageModel = {
    title: '1.5A Low-Dropout Regulators',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    logoSrc: '/branding/vellore-semicon-logo.svg',
    pages: [{ blocks, usedHeight: 200 }]
  };

  const html = renderExportDocumentHtml(pageModel, template, { mode: 'preview' });
  fs.writeFileSync('scratch/p2_test_single_page.html', html);

  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });

  const metrics = await page.evaluate(() => {
    const pdfPage = document.querySelector('.pdf-page');
    const pdfBody = document.querySelector('.pdf-body');
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      rows: t.querySelectorAll('tr').length,
      heightPx: t.getBoundingClientRect().height,
      heightMm: (t.getBoundingClientRect().height * 25.4) / 96
    }));
    return {
      bodyHeightMm: pdfBody ? ((pdfBody as HTMLElement).getBoundingClientRect().height * 25.4) / 96 : 0,
      bodyScrollHeightMm: pdfBody ? ((pdfBody as HTMLElement).scrollHeight * 25.4) / 96 : 0,
      tables
    };
  });

  await browser.close();

  console.log('Real DOM metrics for Page 2 with ALL tables:');
  console.log(`  Body container height: ${metrics.bodyHeightMm.toFixed(1)} mm`);
  console.log(`  Body content scrollHeight: ${metrics.bodyScrollHeightMm.toFixed(1)} mm`);
  console.log('  Tables:', metrics.tables);
}

main().catch(console.error);

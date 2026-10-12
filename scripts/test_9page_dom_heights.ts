import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import {
  normalizeDatasheetExtraction,
  convertToTiptapJson
} from '../src/server/datasheet/normalization';
import {
  renderTiptapNodesToExportBlocks,
  renderExportDocumentHtml,
  ExportPageModel
} from '../src/server/datasheet/export-renderer';

async function main() {
  const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

  // Filter vector-diagram duplicates and refine table bounding boxes
  for (const p of manifest.pages) {
    if (p.pageNumber === 2) {
      p.tables[0].boundingBox = { x: 54, y: 142, width: 512, height: 70 };
      p.tables[1].boundingBox = { x: 54, y: 234, width: 512, height: 45 };
      p.tables[2].boundingBox = { x: 54, y: 338, width: 512, height: 438 };
      p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
    } else if (p.pageNumber === 3) {
      p.tables[0].boundingBox = { x: 54, y: 125, width: 512, height: 245 };
      p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
    } else if (p.pageNumber === 7) {
      p.tables[0].boundingBox = { x: 56, y: 535, width: 474, height: 160 };
      p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
    } else if (p.pageNumber === 9) {
      p.tables[0].boundingBox = { x: 56, y: 163, width: 510, height: 166 };
      p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
    }
  }

  const normalized = normalizeDatasheetExtraction(manifest.pages);
  const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
  const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

  const allContent: any[] = [];
  for (let i = 0; i < manifest.pages.length; i++) {
    const p = manifest.pages[i];
    const pageTiptap = convertToTiptapJson([p], removedTextIds, removedImgIds);
    if (pageTiptap.content) {
      allContent.push(...pageTiptap.content);
    }
    if (i < manifest.pages.length - 1) {
      allContent.push({ type: 'pageBreak' });
    }
  }

  const layoutOptions: any = { layoutMode: 'two-column', layoutDensity: 'technical-dense' };
  const blocks = renderTiptapNodesToExportBlocks(allContent, layoutOptions);

  let currentBlocks: any[] = [];
  const exportPages: any[] = [];
  for (const b of blocks) {
    if (b.kind === 'break') {
      exportPages.push({ blocks: currentBlocks, usedHeight: 200, locked: true });
      currentBlocks = [];
      continue;
    }
    currentBlocks.push(b);
  }
  if (currentBlocks.length > 0) {
    exportPages.push({ blocks: currentBlocks, usedHeight: 200, locked: true });
  }

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

  const pageModel: ExportPageModel = {
    title: '1.5A Low-Dropout Regulators',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    logoSrc: '/branding/vellore-semicon-logo.svg',
    pages: exportPages
  };

  const html = renderExportDocumentHtml(pageModel, template, { mode: 'preview' });
  const htmlPath = path.resolve('scratch', 'test_9pages.html');
  fs.writeFileSync(htmlPath, html);

  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });

  const pageMetrics = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.pdf-page'));
    return pages.map((p, idx) => {
      const body = p.querySelector('.pdf-body') as HTMLElement;
      const clientH = body ? (body.clientHeight * 25.4) / 96 : 0;
      const scrollH = body ? (body.scrollHeight * 25.4) / 96 : 0;
      return {
        pageNumber: idx + 1,
        clientH: Number(clientH.toFixed(1)),
        scrollH: Number(scrollH.toFixed(1)),
        overflow: scrollH > clientH + 1.0
      };
    });
  });

  await browser.close();

  console.log('Real DOM measurements for each of the 9 pages:');
  pageMetrics.forEach(m => {
    console.log(`Page ${m.pageNumber}: clientHeight=${m.clientH}mm, scrollHeight=${m.scrollH}mm, overflows=${m.overflow}`);
  });
}

main().catch(console.error);

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import {
  normalizeDatasheetExtraction,
  convertToTiptapJson
} from '../src/server/datasheet/normalization';
import {
  buildExportPageModel,
  renderExportDocumentHtml
} from '../src/server/datasheet/export-renderer';

async function main() {
  const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

  // 1. Filter vector-diagram duplicates and refine table bounding boxes
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

  // 2. Normalize and compute cleanup report
  const normalized = normalizeDatasheetExtraction(manifest.pages);
  const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
  const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

  // 3. Convert per page with pageBreaks
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

  const pageModel = buildExportPageModel({
    document: {
      title: '1.5A Low-Dropout Regulators',
      productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
      productCategory: '1.5A Low-Dropout Regulators',
      editorJson: { type: 'doc', content: allContent }
    },
    template
  });

  console.log(`\nExport pageModel page count: ${pageModel.pages.length}`);
  pageModel.pages.forEach((p, i) => {
    console.log(`Page ${i + 1}: ${p.blocks.length} blocks, height=${p.usedHeight}, locked=${p.locked}`);
  });
}

main().catch(console.error);

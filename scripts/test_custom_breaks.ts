import fs from 'fs';
import path from 'path';
import {
  normalizeDatasheetExtraction,
  convertToTiptapJson
} from '../src/server/datasheet/normalization';
import {
  buildExportPageModel,
  renderExportDocumentHtml,
  renderTiptapNodesToExportBlocks,
  resolvePageCapacity,
  ExportBlock,
  ExportPage
} from '../src/server/datasheet/export-renderer';

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

// Convert per page with pageBreaks
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

// Custom paginateExportBlocks using estimateRenderedPageHeight
const { buildExportPageModel: _ } = require('../src/server/datasheet/export-renderer');

// Let's inspect where breaks are located in blocks:
let pageIdx = 1;
let currentBlocks: any[] = [];
const customPages: any[] = [];

for (const b of blocks) {
  if (b.kind === 'break') {
    customPages.push({ pageNumber: pageIdx++, blocks: currentBlocks });
    currentBlocks = [];
    continue;
  }
  currentBlocks.push(b);
}
if (currentBlocks.length > 0) {
  customPages.push({ pageNumber: pageIdx++, blocks: currentBlocks });
}

console.log(`Custom pages count: ${customPages.length}`);
customPages.forEach(p => {
  console.log(`Page ${p.pageNumber}: ${p.blocks.length} blocks`);
});

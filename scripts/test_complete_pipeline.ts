import fs from 'fs';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import {
  buildExportPageModel,
  renderTiptapNodesToExportBlocks,
  paginateExportBlocks,
  type RenderLayoutOptions,
  type ExportBlock
} from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates
for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

// Convert page by page with pageBreak
const allContent: any[] = [];
for (let i = 0; i < manifest.pages.length; i++) {
  const page = manifest.pages[i];
  const pageTiptap = convertToTiptapJson([page], removedTextIds, removedImgIds);
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

const layoutOptions: any = { layoutMode: 'two-column', layoutDensity: 'technical-dense' };
const blocks = renderTiptapNodesToExportBlocks(allContent, layoutOptions);

console.log('Total blocks:', blocks.length);
let breaks = 0;
blocks.forEach((b: any) => { if (b.kind === 'break') breaks++; });
console.log('Explicit pageBreak blocks:', breaks);

const pageModel = buildExportPageModel({
  document: {
    title: '1.5A Low-Dropout Regulators',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productCategory: '1.5A Low-Dropout Regulators',
    editorJson: { type: 'doc', content: allContent }
  },
  template
});

console.log('\nResulting pages:', pageModel.pages.length);
pageModel.pages.forEach((p, idx) => {
  console.log(`\nPage ${idx + 1} (usedHeight: ${p.usedHeight}mm, blocks: ${p.blocks.length}, locked: ${p.locked})`);
  p.blocks.forEach((b: any) => {
    const text = b.plainText?.slice(0, 45) || (b.kind === 'table' ? `Table (${b.rowHtml?.length} rows)` : b.kind);
    console.log(`  [${b.kind}:${b.role || ''}] h=${b.estimatedHeight.toFixed(1)}: ${text}`);
  });
});

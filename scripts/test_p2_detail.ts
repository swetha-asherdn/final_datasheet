import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { buildExportPageModel } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

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

const p2 = manifest.pages[1];
const p2Tiptap = convertToTiptapJson([p2], removedTextIds, removedImgIds);
console.log('Tiptap nodes on p2:', p2Tiptap.content?.map((n: any) => ({
  type: n.type,
  text: n.content?.[0]?.text?.slice(0, 40),
  rows: n.content?.length
})));

const pageModel = buildExportPageModel({
  document: {
    title: '1.5A Low-Dropout Regulators',
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productCategory: '1.5A Low-Dropout Regulators',
    editorJson: p2Tiptap
  },
  template
});

console.log('Output pages:', pageModel.pages.length);
pageModel.pages.forEach((p, i) => {
  console.log(`Page ${i + 1} height=${p.usedHeight}:`);
  p.blocks.forEach((b: any) => console.log('  ' + b.kind + ' (' + (b.role || '') + ') h=' + b.estimatedHeight + ': ' + (b.plainText || '').slice(0, 40)));
});

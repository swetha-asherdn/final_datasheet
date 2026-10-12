import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';
import { buildExportPageModel } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates
for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
console.log('Normalized quality:', normalized.qualitySummary);
console.log('Editor content nodes:', normalized.editorJson.content?.length);

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
    title: normalized.title,
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productCategory: '1.5A Low-Dropout Regulators',
    editorJson: normalized.editorJson
  },
  template
});

console.log('Resulting pages count:', pageModel.pages.length);
pageModel.pages.forEach((p, i) => console.log('Page ' + (i + 1) + ' blocks: ' + p.blocks.length + ', height: ' + p.usedHeight));

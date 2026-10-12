import fs from 'fs';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { renderTiptapNodesToExportBlocks } from '../src/server/datasheet/export-renderer';

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

const p1Tiptap = convertToTiptapJson([manifest.pages[0]], removedTextIds, removedImgIds);
const blocks = renderTiptapNodesToExportBlocks(p1Tiptap.content as any, { layoutMode: 'two-column', layoutDensity: 'technical-dense' });

// Measure two column height:
let leftH = 0;
let rightH = 0;
blocks.forEach((b: any) => {
  if (leftH <= rightH) leftH += b.estimatedHeight;
  else rightH += b.estimatedHeight;
});
console.log('Single-column sum:', blocks.reduce((s: number, b: any) => s + b.estimatedHeight, 0));
console.log('Two-column split: leftH =', leftH, 'rightH =', rightH, 'max =', Math.max(leftH, rightH));

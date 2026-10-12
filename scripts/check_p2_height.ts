import fs from 'fs';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { renderTiptapNodesToExportBlocks } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

const p2Tiptap = convertToTiptapJson([manifest.pages[1]], removedTextIds, removedImgIds);

// Measure p2 table row heights if row height is 4.5mm - 5mm
let totalP2H = 0;
for (const n of p2Tiptap.content as any[]) {
  if (n.type === 'heading') totalP2H += 8;
  else if (n.type === 'paragraph') totalP2H += 10;
  else if (n.type === 'table') {
    const rows = n.content?.length || 0;
    const h = 8 + rows * 4.5;
    totalP2H += h;
    console.log(`Table with ${rows} rows: estH = ${h}mm`);
  }
}
console.log('Total Page 2 est height with 4.5mm rows:', totalP2H, 'mm (capacity 248mm)');

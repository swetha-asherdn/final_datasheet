import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates
for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

// Set exact table y for page 2
manifest.pages[1].tables[0].boundingBox = { x: 54, y: 142, width: 512, height: 60 };
manifest.pages[1].tables[1].boundingBox = { x: 54, y: 234, width: 512, height: 40 };
manifest.pages[1].tables[2].boundingBox = { x: 54, y: 338, width: 512, height: 420 };

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

const p2Tiptap = convertToTiptapJson([manifest.pages[1]], removedTextIds, removedImgIds);

const keptTextBlocks = manifest.pages[1].textBlocks.filter((tb: any) => !removedTextIds.has(tb.id));
console.log('--- Kept Text Blocks ---');
keptTextBlocks.forEach((tb: any) => console.log(`  y=${tb.boundingBox.y.toFixed(1)}: ${tb.text.trim().slice(0, 40)}`));
console.log('--- Page 2 tables ---');
manifest.pages[1].tables.forEach((t: any, i: number) => {
  console.log('Table', i, t.boundingBox);
});

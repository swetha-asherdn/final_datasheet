import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates and assign exact table coordinates
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

for (let pNum = 1; pNum <= 9; pNum++) {
  const p = manifest.pages[pNum - 1];
  const tiptap = convertToTiptapJson([p], removedTextIds, removedImgIds);
  console.log(`\n=== PAGE ${pNum} ===`);
  tiptap.content?.forEach((n: any, idx: number) => {
    const text = n.content?.[0]?.text?.slice(0, 60) || (n.type === 'table' ? `Table (${n.content?.length} rows)` : n.type);
    console.log(`  ${idx}: [${n.type}] ${text}`);
  });
}

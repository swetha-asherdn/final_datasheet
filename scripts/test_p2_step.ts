import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates and assign exact table coordinates
const p2 = manifest.pages[1];
p2.tables[0].boundingBox = { x: 54, y: 142, width: 512, height: 70 };
p2.tables[1].boundingBox = { x: 54, y: 234, width: 512, height: 45 };
p2.tables[2].boundingBox = { x: 54, y: 338, width: 512, height: 438 };
p2.images = p2.images.filter((img: any) => !img.id.startsWith('vector-diagram'));

const normalized = normalizeDatasheetExtraction([p2]);
console.log('Resulting content on p2:');
normalized.editorJson.content?.forEach((n: any, idx: number) => {
  const text = n.content?.[0]?.text?.slice(0, 50) || (n.type === 'table' ? `Table (${n.content?.length} rows)` : n.type);
  console.log(`  ${idx}: [${n.type}] ${text}`);
});

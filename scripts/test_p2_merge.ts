import fs from 'fs';
import path from 'path';
import {
  orderTextBlocksForPage,
  collectSuppressedTableTextIds,
  pairFigureCaptions,
  compareTables,
  mergeOrderedPageItems
} from '../src/server/datasheet/normalization';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

const p2 = manifest.pages[1];
// Filter vector-diagram duplicates
p2.images = p2.images.filter((img: any) => !img.id.startsWith('vector-diagram'));

// Set exact bounding boxes for p2 tables
p2.tables[0].boundingBox = { x: 54, y: 142, width: 512, height: 60 };
p2.tables[1].boundingBox = { x: 54, y: 234, width: 512, height: 40 };
p2.tables[2].boundingBox = { x: 54, y: 338, width: 512, height: 420 };

const tableSuppressed = collectSuppressedTableTextIds(p2);
console.log('Suppressed text count:', tableSuppressed.size);
p2.textBlocks.forEach((b: any) => {
  if (tableSuppressed.has(b.id)) console.log('  Suppressed: ' + b.text.slice(0, 40));
});

const captionSelections = pairFigureCaptions(p2.textBlocks, []);
const textBlocks = orderTextBlocksForPage(p2).filter((b: any) => !tableSuppressed.has(b.id));

const items = mergeOrderedPageItems(p2, textBlocks, [...p2.tables].sort(compareTables), [], captionSelections);
console.log('\nMerged items:');
items.forEach((item: any) => {
  if (item.kind === 'text') console.log(`  TXT [${Math.round(item.block.boundingBox.y)}]: ${item.block.text.slice(0, 50)}`);
  else if (item.kind === 'table') console.log(`  TABLE [${Math.round(item.table.boundingBox.y)}]: ${item.table.id} (${item.table.rows.length} rows)`);
  else if (item.kind === 'synthetic-heading') console.log(`  SYNTHETIC-HEADING: ${item.text}`);
});

import fs from 'fs';
import path from 'path';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

const p2 = manifest.pages[1];
p2.tables[0].boundingBox = { x: 54, y: 142, width: 512, height: 70 };
p2.tables[1].boundingBox = { x: 54, y: 234, width: 512, height: 45 };
p2.tables[2].boundingBox = { x: 54, y: 338, width: 512, height: 438 };

console.log('compareTables result:');
const sortedTables = [...p2.tables].sort((a: any, b: any) => (a.boundingBox.y - b.boundingBox.y));
sortedTables.forEach(t => console.log('  table ' + t.id + ' y=' + t.boundingBox.y));

console.log('\nText blocks:');
p2.textBlocks.forEach((b: any) => {
  console.log('  block ' + b.id + ' y=' + b.boundingBox.y + ': ' + b.text.slice(0, 40));
});

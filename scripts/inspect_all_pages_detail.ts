import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('scratch', 'CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const pages = manifest.pages || manifest;

for (const p of pages.filter((p: any) => p.pageNumber <= 3)) {
  console.log(`\n================================ PAGE ${p.pageNumber} ================================`);
  console.log(`Dimensions: ${p.width} x ${p.height}`);
  console.log(`Tables (${p.tables?.length || 0}):`);
  p.tables?.forEach((t: any, idx: number) => {
    console.log(`  Table ${idx} [rows=${t.rows?.length}]:`);
    t.rows?.forEach((row: any, rIdx: number) => {
      if (rIdx < 3 || rIdx >= t.rows.length - 2) {
        console.log(`    r${rIdx}: ${row.map((c: any) => c.text.replace(/\n/g, ' ')).join(' | ')}`);
      } else if (rIdx === 3) {
        console.log(`    ... (${t.rows.length - 4} more rows)`);
      }
    });
  });

  console.log(`Images (${p.images?.length || 0}):`);
  p.images?.forEach((img: any, idx: number) => {
    console.log(`  Image ${idx}: id=${img.id}, storageKey=${img.storageKey}, size=${img.width}x${img.height}`);
  });

  console.log(`TextBlocks (${p.textBlocks?.length || 0}):`);
  p.textBlocks?.forEach((tb: any, idx: number) => {
    console.log(`  TB ${idx} [y=${tb.boundingBox?.y?.toFixed(1)}, h=${tb.boundingBox?.height?.toFixed(1)}]: ${tb.text.replace(/\s+/g, ' ').slice(0, 80)}`);
  });
}

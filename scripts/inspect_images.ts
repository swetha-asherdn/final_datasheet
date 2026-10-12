import fs from 'fs';

const m = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));
for (const p of m.pages) {
  console.log(`\nPage ${p.pageNumber}: ${p.images.length} images, ${p.tables.length} tables`);
  for (const img of p.images) {
    console.log(`  IMG: id=${img.id}, w=${img.width}, h=${img.height}, box=(${img.boundingBox.x}, ${img.boundingBox.y}, ${img.boundingBox.width}, ${img.boundingBox.height})`);
  }
  for (const tbl of p.tables) {
    console.log(`  TBL: id=${tbl.id}, rows=${tbl.rows.length}, box=${JSON.stringify(tbl.boundingBox)}`);
  }
}

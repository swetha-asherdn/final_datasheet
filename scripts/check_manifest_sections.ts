import fs from 'fs';
const m = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));
for (const p of m.pages) {
  for (const tb of p.textBlocks) {
    if (tb.text.includes('ABSOLUTE MAXIMUM') || tb.text.includes('RECOMMENDED OPERATING') || tb.text.includes('ELECTRICAL CHARACTERISTICS')) {
      console.log(`Page ${p.pageNumber}: "${tb.text.trim()}" at y=${tb.boundingBox.y}`);
    }
  }
  for (const tbl of p.tables) {
    console.log(`Page ${p.pageNumber} Table ${tbl.id}: rows=${tbl.rows.length}, cell(0,0)="${tbl.rows[0]?.[0]?.text?.slice(0, 30)}"`);
  }
}

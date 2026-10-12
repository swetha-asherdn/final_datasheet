import fs from 'fs';
import path from 'path';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

for (const page of manifest.pages) {
  for (const table of page.tables) {
    if (!table.boundingBox || (table.boundingBox.y === 0 && table.boundingBox.height >= page.height * 0.85)) {
      // Find text blocks whose text matches distinctive cells in this table
      const distinctiveCells = table.rows.flatMap((r: any) =>
        r.map((c: any) => c.text.trim())
      ).filter((t: string) => t.length >= 5 && !/^(parameter|symbol|conditions?|ratings?|unit|min|typ|max)$/i.test(t));

      const matchingY: number[] = [];
      for (const block of page.textBlocks) {
        const bText = block.text.trim().toLowerCase();
        for (const cell of distinctiveCells) {
          const cText = cell.toLowerCase();
          if (bText.includes(cText) || cText.includes(bText)) {
            matchingY.push(block.boundingBox.y);
            break;
          }
        }
      }

      if (matchingY.length > 0) {
        const minY = Math.min(...matchingY);
        const maxY = Math.max(...matchingY);
        console.log(`Page ${page.pageNumber} Table ${table.id} (${table.rows.length} rows): detected minY=${Math.round(minY)}, maxY=${Math.round(maxY)}`);
      } else {
        console.log(`Page ${page.pageNumber} Table ${table.id}: no distinct match found`);
      }
    }
  }
}

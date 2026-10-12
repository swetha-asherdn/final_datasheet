import fs from 'fs';
import path from 'path';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

function refineTableBoundingBoxes(page: any) {
  for (const table of page.tables) {
    if (!table.boundingBox || (table.boundingBox.y === 0 && table.boundingBox.height >= page.height * 0.9)) {
      // Find text blocks matching cells in this table
      const cellTexts = new Set(
        table.rows.flatMap((r: any) => r.map((c: any) => c.text.trim().toLowerCase())).filter((t: string) => t.length > 2)
      );
      const matchingBlocks = page.textBlocks.filter((b: any) => {
        const t = b.text.trim().toLowerCase();
        return Array.from(cellTexts).some((cell: any) => t.includes(cell) || cell.includes(t));
      });
      if (matchingBlocks.length > 0) {
        const minY = Math.min(...matchingBlocks.map((b: any) => b.boundingBox.y));
        const maxY = Math.max(...matchingBlocks.map((b: any) => b.boundingBox.y + b.boundingBox.height));
        const minX = Math.min(...matchingBlocks.map((b: any) => b.boundingBox.x));
        const maxX = Math.max(...matchingBlocks.map((b: any) => b.boundingBox.x + b.boundingBox.width));
        table.boundingBox = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      }
    }
  }
}

manifest.pages.forEach((p: any) => {
  refineTableBoundingBoxes(p);
  p.tables.forEach((t: any) => {
    console.log(`Page ${p.pageNumber} Table ${t.id}: y=${Math.round(t.boundingBox.y)}, h=${Math.round(t.boundingBox.height)}`);
  });
});

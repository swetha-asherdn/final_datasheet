import fs from 'fs';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { renderTiptapNodesToExportBlocks, type RenderLayoutOptions, type ExportBlock } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

const layoutOptions: any = { layoutMode: 'two-column', layoutDensity: 'technical-dense' };

// Test Page 1 and Page 4 blocks
for (const pNum of [1, 4]) {
  const p = manifest.pages[pNum - 1];
  const pTiptap = convertToTiptapJson([p], removedTextIds, removedImgIds);
  const blocks = renderTiptapNodesToExportBlocks(pTiptap.content as any, layoutOptions);
  
  // Calculate two-column estimated height
  let leftH = 0;
  let rightH = 0;
  let totalH = 0;
  blocks.forEach((b: any) => {
    if (b.fullWidth || b.kind === 'table') {
      totalH += Math.max(leftH, rightH) + b.estimatedHeight;
      leftH = 0;
      rightH = 0;
    } else {
      if (leftH <= rightH) leftH += b.estimatedHeight;
      else rightH += b.estimatedHeight;
    }
  });
  totalH += Math.max(leftH, rightH);
  console.log(`Page ${pNum}: total two-column height = ${totalH.toFixed(1)}mm (capacity: 248mm). Fits on 1 page: ${totalH <= 248}`);
}

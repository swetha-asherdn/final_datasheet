import fs from 'fs';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { buildExportPageModel, renderTiptapNodesToExportBlocks, paginateExportBlocks } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

// Filter vector-diagram duplicates
for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

const p1Tiptap = convertToTiptapJson([manifest.pages[0]], removedTextIds, removedImgIds);
console.log('P1 Tiptap nodes count:', p1Tiptap.content?.length);

const blocks = renderTiptapNodesToExportBlocks(p1Tiptap.content as any, { layoutMode: 'two-column', layoutDensity: 'technical-dense' });
console.log('P1 Rendered blocks count:', blocks.length);
blocks.forEach((b: any, idx: number) => {
  console.log(`  B${idx}: [${b.kind}:${b.role}] estH=${b.estimatedHeight} - ${(b.plainText || '').slice(0, 50)}`);
});

const pages = paginateExportBlocks(blocks, 248);
console.log('\nP1 Paginated pages:', pages.length);
pages.forEach((p, idx) => {
  console.log(`Page ${idx + 1} usedHeight: ${p.usedHeight}, blocks: ${p.blocks.length}`);
});

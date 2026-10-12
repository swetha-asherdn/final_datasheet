import fs from 'fs';
import path from 'path';
import { normalizeDatasheetExtraction, convertToTiptapJson } from '../src/server/datasheet/normalization';
import { buildExportPageModel, renderExportDocumentHtml } from '../src/server/datasheet/export-renderer';

const manifest = JSON.parse(fs.readFileSync('scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json', 'utf8'));

for (const p of manifest.pages) {
  if (p.tables.length > 0) {
    p.images = p.images.filter((img: any) => !img.id.startsWith('vector-diagram'));
  }
}

const normalized = normalizeDatasheetExtraction(manifest.pages);
const removedTextIds = new Set(normalized.cleanupReport.removedTextBlocks.map((t: any) => t.sourceId));
const removedImgIds = new Set(normalized.cleanupReport.removedImages.map((i: any) => i.sourceId));

// Check p2 tiptap
const p2 = manifest.pages[1];
const p2Tiptap = convertToTiptapJson([p2], removedTextIds, removedImgIds);

console.log('p2Tiptap content count:', p2Tiptap.content?.length);
fs.writeFileSync('scratch/p2_tiptap.json', JSON.stringify(p2Tiptap, null, 2));

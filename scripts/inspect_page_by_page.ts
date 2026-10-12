import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve('scratch', 'CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const pages = manifest.pages || manifest;

console.log('Total manifest pages:', pages.length);

pages.forEach((p: any) => {
  console.log(`\n================ PAGE ${p.pageNumber} ================`);
  console.log(`Tables: ${p.tables?.length || 0}, Images: ${p.images?.length || 0}, TextBlocks: ${p.textBlocks?.length || 0}`);
  
  if (p.tables?.length) {
    p.tables.forEach((t: any, idx: number) => {
      console.log(`  Table ${idx} (${t.rows?.length} rows): Header = ${t.rows?.[0]?.map((c: any) => c.text).join(' | ').slice(0, 80)}`);
    });
  }
  
  if (p.images?.length) {
    p.images.forEach((img: any, idx: number) => {
      console.log(`  Image ${idx}: w=${img.width}, h=${img.height}, bbox=y:${img.boundingBox?.y?.toFixed(1)}`);
    });
  }

  // Print first few text blocks
  const textSummary = p.textBlocks
    ?.map((b: any) => b.text.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((t: string) => t.replace(/\s+/g, ' ').slice(0, 70));
  console.log('  Top text lines:\n    ' + textSummary?.join('\n    '));
});

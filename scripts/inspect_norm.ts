import fs from 'fs';
import path from 'path';

const normPath = path.resolve(process.cwd(), 'scratch', '2D2142A-5_pdf.normalized.json');
const data = JSON.parse(fs.readFileSync(normPath, 'utf8'));

console.log("=== NORMALIZED EDITOR JSON NODES ===");
let page = 1;
for (const n of data.editorJson.content || []) {
  if (n.type === 'pageBreak') {
    page++;
    console.log(`\n--- PAGE BREAK -> PAGE ${page} ---`);
    continue;
  }
  if (n.type === 'bulletList') {
    console.log(`[bulletList] (${n.content?.length} items):`);
    for (const item of n.content || []) {
      const txt = item.content?.[0]?.content?.map((c: any) => c.text).join(' ');
      console.log(`   * ${txt}`);
    }
  } else if (n.type === 'heading') {
    const txt = n.content?.map((c: any) => c.text).join(' ');
    console.log(`[heading (lvl ${n.attrs?.level})]: "${txt}"`);
  } else if (n.type === 'paragraph') {
    const txt = n.content?.map((c: any) => c.text).join(' ');
    console.log(`[paragraph]: "${txt}"`);
  } else if (n.type === 'table') {
    console.log(`[table]: ${n.content?.length} rows`);
  } else if (n.type === 'image') {
    console.log(`[image]: ${n.attrs?.src} (alt: "${n.attrs?.alt}")`);
  } else {
    console.log(`[${n.type}]:`, JSON.stringify(n).slice(0, 80));
  }
}

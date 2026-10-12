import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';
import fs from 'fs';

async function main() {
  const fileBuffer = fs.readFileSync('C:\\Users\\Sandy\\Downloads\\2D2142A-5.pdf');
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, '2D2142A-5.pdf');

  console.log("Calling python worker http://localhost:8000/extract...");
  const resp = await fetch('http://localhost:8000/extract', {
    method: 'POST',
    body: formData,
  });

  if (!resp.ok) {
    throw new Error(`Worker returned ${resp.status}: ${await resp.text()}`);
  }

  const extractionResult = (await resp.json()) as any;
  console.log("Worker returned pages:", extractionResult.pages.length);

  const normalized = normalizeDatasheetExtraction(extractionResult.pages);

  console.log("\n=== NORMALIZED EDITOR JSON NODES ===");
  for (const n of normalized.editorJson.content || []) {
    if (n.type === 'bulletList') {
      console.log("[bulletList]:");
      for (const item of (n.content as any[]) || []) {
        console.log("   *", JSON.stringify(item));
      }
    } else if (n.type === 'heading') {
      console.log(`[heading (lvl ${(n.attrs as any)?.level})]: "${(n.content as any[])?.map(c => c.text).join(' ')}"`);
    } else if (n.type === 'paragraph') {
      console.log(`[paragraph]: "${(n.content as any[])?.map(c => c.text).join(' ').slice(0, 70)}..."`);
    } else if (n.type === 'table') {
      console.log(`[table (${(n.content as any[])?.length} rows)]`);
    } else if (n.type === 'pageBreak') {
      console.log("[pageBreak]");
    } else if (n.type === 'image') {
      console.log(`[image]: ${(n.attrs as any)?.src}`);
    } else {
      console.log(`[${n.type}]:`, JSON.stringify(n).slice(0, 60));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

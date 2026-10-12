import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve(process.cwd(), 'scratch', '2D2142A-5_pdf.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const page1 = manifest.pages[0];

console.log("=== Page 1 text blocks raw ===");
for (const b of page1.textBlocks) {
  console.log(`[${b.id}] y=${b.boundingBox.y.toFixed(1)}, x=${b.boundingBox.x.toFixed(1)}, w=${b.boundingBox.width.toFixed(1)}: "${b.text.slice(0, 35)}"`);
}

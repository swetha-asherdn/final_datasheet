import fs from 'fs';
import path from 'path';

function copyFile() {
  const src = path.resolve('scratch', 'vellore_semicon_validated_9pages.pdf');
  const destDir = path.resolve('..');
  const dest = path.join(destDir, 'vellore-semicon-vs-cw29150r-xx-vs-cw29151r-xx-vs-cw29150r-adj-2026-10-06.pdf');

  if (!fs.existsSync(src)) {
    console.error('Source file not found at:', src);
    process.exit(1);
  }

  fs.copyFileSync(src, dest);
  const stats = fs.statSync(dest);
  console.log(`Copied PDF to: ${dest}`);
  console.log(`Size: ${stats.size} bytes`);
}

copyFile();

import fs from 'fs';
import path from 'path';

function checkContains(pdfPath: string, phrase: string) {
  const data = fs.readFileSync(pdfPath);
  const hay = data.toString('utf8');
  return hay.includes(phrase);
}

async function main() {
  const pdfPath = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(2);
  }
  const phrases = ['Общее описание', 'Отличительные особенности', 'Разрабатываемые'];
  for (const p of phrases) {
    console.log(p + ':', checkContains(pdfPath, p));
  }
  const stat = fs.statSync(pdfPath);
  console.log('PDF size bytes:', stat.size);
}

main().catch((err) => { console.error(err); process.exit(1); });

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';

async function main() {
  const htmlPath = path.resolve('scratch', 'test_9pages.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await browser.close();

  const outPath = path.resolve('scratch', 'CW29150_cloned_9pages.pdf');
  fs.writeFileSync(outPath, pdfBuffer);
  console.log('Saved PDF to', outPath);

  const doc = await PDFDocument.load(pdfBuffer);
  console.log(`Generated PDF page count: ${doc.getPageCount()}`);
}

main().catch(console.error);

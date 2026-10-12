import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

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
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });

  const pages = await page.$$('.pdf-page');
  const outDir = path.resolve('scratch', 'rendered_pages');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const outImg = path.join(outDir, `page-${i + 1}.png`);
    await p.screenshot({ path: outImg });
    console.log(`Saved screenshot of Page ${i + 1} to ${outImg}`);
  }

  await browser.close();
}

main().catch(console.error);

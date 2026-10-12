import puppeteer from 'puppeteer-core';
import { resolveChromiumExecutablePath } from '../src/server/datasheet/chromium';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('--- 1. Launching Puppeteer Browser ---');
  const executablePath = resolveChromiumExecutablePath();
  console.log('Using browser executable:', executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();

  console.log('\n--- 2. Performing NextAuth Login via Session ---');
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });

  const loginResult = await page.evaluate(async () => {
    const csrfRes = await fetch('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    const loginRes = await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrfToken,
        email: 'admin@example.com',
        password: 'ChangeMe123!',
        json: 'true'
      })
    });
    return { ok: loginRes.ok, status: loginRes.status };
  });

  console.log('Login Response:', loginResult);

  console.log('\n--- 3. Verifying Authentication via /dashboard ---');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('Dashboard URL:', page.url());

  const shotDir = path.resolve('scratch', 'e2e_screenshots');
  if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, '01_dashboard.png') });

  console.log('\n--- 4. Navigating to Active Project Detail Page ---');
  const projectUrl = 'http://localhost:3000/projects/6ac46ff6c0de837db134e0a5';
  await page.goto(projectUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('Project Detail Page URL:', page.url());

  // Wait for the main page buttons to appear
  await page.waitForSelector('button', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(shotDir, '02_project_overview.png') });

  const availableTabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
  });
  console.log('Available buttons/tabs:', availableTabs);

  console.log('\n--- 5. Switching to "Datasheet Editor" Tab ---');
  const clickedEditor = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const editorBtn = btns.find(b => b.textContent?.trim() === 'Datasheet Editor');
    if (editorBtn) {
      editorBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked "Datasheet Editor" tab:', clickedEditor);

  // Wait for Tiptap editor
  await page.waitForSelector('.tiptap, .ProseMirror', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(shotDir, '03_datasheet_editor.png') });

  const editorInfo = await page.evaluate(() => {
    const editor = document.querySelector('.ProseMirror, .tiptap');
    const editorText = editor ? editor.textContent?.slice(0, 600) : null;
    const pageBreaks = document.querySelectorAll('[data-type="page-break"], .page-break, .page-break-label');
    const titleEl = document.querySelector('input[name="title"], [data-field="title"], input[value*="Regulators" i]');
    const productCodeEl = document.querySelector('input[name="productCode"], [data-field="productCode"], input[value*="CW291" i]');
    const headings = Array.from(document.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap h3')).map(h => h.textContent?.trim()).slice(0, 10);
    const tables = document.querySelectorAll('.tiptap table');
    const images = document.querySelectorAll('.tiptap img');

    return {
      hasEditor: Boolean(editor),
      editorTextPreview: editorText,
      pageBreakElementsCount: pageBreaks.length,
      documentTitleValue: (titleEl as HTMLInputElement)?.value || null,
      productCodeValue: (productCodeEl as HTMLInputElement)?.value || null,
      headings,
      tableCount: tables.length,
      imageCount: images.length
    };
  });

  console.log('\n--- 6. Datasheet Editor DOM State ---');
  console.log(JSON.stringify(editorInfo, null, 2));

  console.log('\n--- 7. Switching to "Paged Preview" Tab ---');
  const clickedPreview = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const previewBtn = btns.find(b => b.textContent?.trim() === 'Paged Preview');
    if (previewBtn) {
      previewBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked "Paged Preview" tab:', clickedPreview);

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(shotDir, '04_paged_preview.png') });

  const previewInfo = await page.evaluate(() => {
    const pagedElements = document.querySelectorAll('.pdf-page, .datasheet-page, [data-page-number], iframe');
    const iframe = document.querySelector('iframe');
    let iframePageCount = 0;
    if (iframe) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          iframePageCount = doc.querySelectorAll('.pdf-page, .page').length;
        }
      } catch {}
    }
    return {
      pagedElementsCount: pagedElements.length,
      hasIframe: Boolean(iframe),
      iframePageCount
    };
  });

  console.log('\n--- 8. Paged Preview State ---');
  console.log(JSON.stringify(previewInfo, null, 2));

  await browser.close();
  console.log('\nE2E Browser Test Completed Successfully!');
}

main().catch(err => {
  console.error('E2E Browser Test Failed:', err);
  process.exit(1);
});

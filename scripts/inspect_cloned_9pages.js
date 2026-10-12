const fs = require('fs');
const html = fs.readFileSync('scratch/CW29150_cloned_9pages.html', 'utf8');
const pages = html.split(/<section class=["']pdf-page["']/);
console.log('Total pages in CW29150_cloned_9pages.html:', pages.length - 1);
for (let i = 1; i < pages.length; i++) {
  const p = pages[i];
  const headings = p.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || [];
  const tables = p.match(/<table[^>]*>/gi) || [];
  const imgs = (p.match(/<img[^>]+>/g) || []).filter(im => !im.includes('vellore-semicon-logo.svg'));
  console.log(`Page ${i}: headings=${headings.map(h => h.replace(/<[^>]+>/g, '')).join(', ')} | tables=${tables.length} | images=${imgs.length}`);
}

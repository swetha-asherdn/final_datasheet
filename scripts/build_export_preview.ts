import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const normPath = path.resolve(process.cwd(), 'scratch', 'KD0860UF.normalized.json');
  if (!fs.existsSync(normPath)) {
    console.error('Normalized file missing at', normPath);
    process.exit(2);
  }
  const normalized = JSON.parse(fs.readFileSync(normPath, 'utf-8'));
  const editorJson = normalized.editorJson;
  const template = {
    logoAssetPath: '/branding/vellore-semicon-logo.svg',
    companyName: 'Vellore Semicon',
    website: 'www.velloresemicon.com',
    productCode: normalized.productCode || '',
    productTitle: normalized.productCategory || normalized.title || '',
    documentStatus: normalized.documentStatus || 'Preliminary Datasheet',
    revision: normalized.revision || 'Rev. A',
    layoutMode: 'two-column' as const,
    layoutDensity: 'technical-dense' as const,
    pageFillStrategy: 'balanced' as const,
    primaryColor: '#0D2B55',
    accentColor: '#D6533E'
  };
  const { buildExportPageModel, renderExportDocumentHtml } = await import('../src/server/datasheet/export-renderer');
  const pageModel = buildExportPageModel({ document: { title: normalized.title, productCode: normalized.productCode, productCategory: normalized.productCategory, editorJson }, template });
  const html = renderExportDocumentHtml(pageModel, template as any, { mode: 'preview' });
  const out = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.html');
  fs.writeFileSync(out, html);
  console.log('Saved export HTML to', out);
  console.log('Pages:', pageModel.pages.length);
  console.log('Product code in header:', pageModel.productCode);
}

main().catch((err) => { console.error(err); process.exit(1); });

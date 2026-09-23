import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const manifestPath = path.resolve(process.cwd(), 'scratch', 'KD0860UF.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('Manifest missing at', manifestPath);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const pages = manifest.pages || manifest;

  const { normalizeDatasheetExtraction } = await import('../src/server/datasheet/normalization');
  const normalized = normalizeDatasheetExtraction(pages);
  const outNorm = path.resolve(process.cwd(), 'scratch', 'KD0860UF.normalized.fixed.json');
  fs.writeFileSync(outNorm, JSON.stringify(normalized, null, 2), 'utf-8');
  console.log('Wrote normalized to', outNorm, 'productCode:', normalized.productCode);

  const { buildExportPageModel, renderExportDocumentHtml } = await import('../src/server/datasheet/export-renderer');
  const template = { productCode: normalized.productCode, productTitle: normalized.productCategory || normalized.title, layoutMode: 'two-column' as const, layoutDensity: 'technical-dense' as const, primaryColor: '#0D2B55', accentColor: '#D6533E', logoAssetPath: '/branding/vellore-semicon-logo.svg', companyName: 'Vellore Semicon', website: 'www.velloresemicon.com', documentStatus: normalized.documentStatus || 'Preliminary Datasheet', revision: normalized.revision || '' , pageFillStrategy: 'balanced' as const };
  const pageModel = buildExportPageModel({ document: { title: normalized.title, productCode: normalized.productCode, productCategory: normalized.productCategory, editorJson: normalized.editorJson }, template });
  const html = renderExportDocumentHtml(pageModel, template as any, { mode: 'preview' });
  const outHtml = path.resolve(process.cwd(), 'scratch', 'KD0860UF.export.fixed.html');
  fs.writeFileSync(outHtml, html, 'utf-8');
  console.log('Saved fixed export HTML to', outHtml);
  console.log('Pages:', pageModel.pages.length);
}

main().catch((err) => { console.error(err); process.exit(1); });

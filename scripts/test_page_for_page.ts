import fs from 'fs';
import path from 'path';
import { normalizeTechnicalText } from '../src/server/datasheet/technical-text';
import { buildExportPageModel, renderExportDocumentHtml } from '../src/server/datasheet/export-renderer';
import { renderHtmlToPdf } from '../src/server/datasheet/export-service';
import { applySupplierProductCodeMappings, detectSupplierProductCodesFromEditorJson, buildSuggestedSupplierMappings, autoApproveSupplierCodeMappings } from '../src/lib/supplier-product-code-mapping';

const manifestPath = path.resolve('scratch', 'CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const pages = manifest.pages || manifest;

async function test() {
  const { normalizeDatasheetExtraction } = await import('../src/server/datasheet/normalization');
  
  // Test converting each page individually using convertToTiptapJson([page])
  const allNodes: any[] = [];
  const sortedPages = [...pages].sort((a: any, b: any) => a.pageNumber - b.pageNumber);
  
  console.log('\nPage 2 images:');
  pages[1].images?.forEach((img: any, i: number) => {
    console.log(`  Img ${i}: id=${img.id}, storageKey=${img.storageKey}, bbox=`, img.boundingBox);
  });


  console.log(`Total nodes across all pages: ${allNodes.length}`);

  const candidates = detectSupplierProductCodesFromEditorJson({ type: 'doc', content: allNodes });
  const mappings = autoApproveSupplierCodeMappings(buildSuggestedSupplierMappings(candidates, 'VS'));

  function replaceInNode(node: any): any {
    if (node.type === 'text' && typeof node.text === 'string') {
      const res = applySupplierProductCodeMappings({ text: node.text, mappings });
      return res.replacedCount > 0 ? { ...node, text: res.text } : node;
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(replaceInNode) };
    }
    return node;
  }

  const mappedContent = allNodes.map(replaceInNode);

  const template = {
    productCode: 'VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX',
    productTitle: 'Low-Dropout Regulators',
    layoutMode: 'two-column' as const,
    layoutDensity: 'technical-dense' as const,
    primaryColor: '#0D2B55',
    accentColor: '#D6533E',
    logoAssetPath: '/branding/vellore-semicon-logo.svg',
    companyName: 'Vellore Semicon',
    website: 'www.velloresemicon.com',
    documentStatus: 'Preliminary Datasheet',
    revision: 'March 2020 – revised September 2020',
    pageFillStrategy: 'balanced' as const
  };

  const pageModel = buildExportPageModel({
    document: {
      title: 'Low-Dropout Regulators',
      productCode: template.productCode,
      productCategory: 'Low-Dropout Regulators',
      editorJson: { type: 'doc', content: mappedContent }
    },
    template: template as any
  });

  console.log('Resulting Export Page Count:', pageModel.pages.length);
  pageModel.pages.forEach((p, i) => {
    console.log(`\n--- Page ${i + 1} (${p.blocks.length} blocks, usedHeight: ${p.usedHeight}) ---`);
    p.blocks.forEach((b: any) => {
      const text = (b.plainText || '').replace(/\s+/g, ' ').slice(0, 75);
      console.log(`  [${b.role}] ${text}`);
    });
  });
}

test().catch(console.error);

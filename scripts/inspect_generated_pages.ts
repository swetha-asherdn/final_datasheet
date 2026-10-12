import { connectToDatabase } from "../src/server/db";
import { DatasheetDocumentModel } from "../src/server/models/datasheet-document";
import { DatasheetTemplateSettingsModel } from "../src/server/models/datasheet-template-settings";
import { buildExportPageModel } from "../src/server/datasheet/export-renderer";

async function main() {
  await connectToDatabase();
  const projectId = "6ac46ff6c0de837db134e0a5";
  const doc = await DatasheetDocumentModel.findOne({ projectId });
  if (!doc) {
    console.log("No datasheet document found for", projectId);
    return;
  }
  const template = await DatasheetTemplateSettingsModel.findOne({ projectId });

  const pageModel = buildExportPageModel({
    document: {
      title: doc.title || "Low-Dropout Regulators",
      productCode: doc.productCode || "VS-CW29150R-XX",
      productCategory: doc.productCategory || "Low-Dropout Regulators",
      editorJson: doc.editorJson
    },
    template: (template?.toObject() || {
      productCode: "VS-CW29150R-XX",
      productTitle: "Low-Dropout Regulators",
      layoutMode: "two-column",
      layoutDensity: "technical-dense",
      logoAssetPath: "/branding/vellore-semicon-logo.svg",
      primaryColor: "#0D2B55",
      accentColor: "#D6533E",
      website: "www.velloresemicon.com"
    }) as any
  });

  console.log("Total generated pages:", pageModel.pages.length);
  pageModel.pages.forEach((p, idx) => {
    console.log(`\n=== PAGE ${idx + 1} (${p.blocks.length} blocks, usedHeight: ${p.usedHeight}) ===`);
    p.blocks.forEach((b: any, bIdx) => {
      const text = (b.plainText || "").replace(/\s+/g, " ").slice(0, 80);
      const htmlSnippet = (b.html || "").replace(/\s+/g, " ").slice(0, 80);
      console.log(`  B${bIdx} [${b.role || b.kind}]: ${text || htmlSnippet}`);
    });
  });
}

main().catch(console.error);

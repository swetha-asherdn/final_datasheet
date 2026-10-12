import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f907cadf8c3890130a39');
  const pages = await ExtractedPageModel.find({ projectId: project?._id }).sort({ pageNumber: 1 }).lean();

  console.log("Pages found:", pages.length);

  for (const page of pages) {
    console.log(`\n=================== PAGE ${page.pageNumber} ===================`);
    console.log("Tables count:", page.tables.length);
    for (const t of page.tables) {
      console.log("  Table bbox:", t.boundingBox);
    }
    console.log("\nText blocks:");
    for (const b of page.textBlocks) {
      console.log(`\n  Block ID: ${b.id}`);
      console.log(`  Text: "${b.text}"`);
      console.log(`  BBox:`, b.boundingBox);
    }
  }

  const normalized = normalizeDatasheetExtraction(pages as any);
  console.log("\n--- CLEANUP REPORT REMOVED TEXT BLOCKS:");
  for (const item of normalized.cleanupReport.removedTextBlocks) {
    console.log(`  Removed text: [page ${item.pageNumber}] "${item.text?.slice(0, 50)}" -> reasons: ${item.reasons.join(", ")}`);
  }

  console.log("\n--- FINAL EDITOR JSON NODES:");
  for (const node of normalized.editorJson.content || []) {
    console.log(`  Node type: ${node.type}, text: "${JSON.stringify(node).slice(0, 80)}"`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

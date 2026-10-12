import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import { DatasheetDocumentModel } from '../src/server/models/datasheet-document';

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f6eccadf8c38901309d5') || await ProjectModel.findOne({ "originalPdf.originalFileName": /2142/i }).sort({ createdAt: -1 });
  if (!project) {
    console.log("Project not found");
    return;
  }
  console.log("Found project:", project._id.toString(), project.originalFileName);

  const pages = await ExtractedPageModel.find({ projectId: project._id }).sort({ pageNumber: 1 });
  console.log("\n--- EXTRACTED PAGES COUNT:", pages.length);
  for (const page of pages) {
    console.log(`\n=== PAGE ${page.pageNumber} ===`);
    console.log(`TextBlocks (${page.textBlocks.length}):`);
    for (const b of page.textBlocks) {
      console.log(`  [${b.type}] (y: ${b.boundingBox?.y?.toFixed(1)}-${(b.boundingBox?.y + b.boundingBox?.height)?.toFixed(1)}) : "${b.text.slice(0, 60)}"`);
    }
    console.log(`Tables (${page.tables.length})`);
    console.log(`Images (${page.images.length})`);
  }

  const doc = await DatasheetDocumentModel.findOne({ projectId: project._id });
  console.log("\n--- DATASHEET DOCUMENT:");
  if (!doc) {
    console.log("No document found!");
  } else {
    console.log("Title:", doc.title);
    console.log("ProductCode:", doc.productCode);
    console.log("editorJson content nodes count:", doc.editorJson?.content?.length);
    console.log("\nEditor JSON nodes:");
    for (const node of (doc.editorJson?.content || [])) {
      const text = JSON.stringify(node).slice(0, 100);
      console.log(`  type: ${node.type}, text: ${text}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f907cadf8c3890130a39');
  const pages = await ExtractedPageModel.find({ projectId: project?._id }).sort({ pageNumber: 1 }).lean();

  pages[0].tables[0].boundingBox = { x: 375.55, y: 298.97, width: 566.76 - 375.55, height: 417.79 - 298.97 };
  pages[0].tables[1].boundingBox = { x: 62.30, y: 599.26, width: 572.76 - 62.30, height: 693.70 - 599.26 };
  pages[1].tables[0].boundingBox = { x: 49.56, y: 155.54, width: 567.12 - 49.56, height: 305.81 - 155.54 };

  const normalized = normalizeDatasheetExtraction(pages as any);

  console.log("=== NORMALIZED EDITOR JSON NODES ===");
  for (const node of normalized.editorJson.content || []) {
    console.log(`\nNode type: ${node.type}`);
    if (node.type === 'bulletList') {
      console.log("Bullet list items:");
      for (const item of (node.content as any[]) || []) {
        console.log("  -", JSON.stringify(item));
      }
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      console.log("Text:", (node.content as any[])?.map(c => c.text).join(" "));
    } else if (node.type === 'table') {
      console.log(`Table with ${(node.content as any[])?.length} rows`);
    } else {
      console.log(JSON.stringify(node).slice(0, 80));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

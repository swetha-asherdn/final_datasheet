import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import { normalizeDatasheetExtraction } from '../src/server/datasheet/normalization';

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f907cadf8c3890130a39');
  const pages = await ExtractedPageModel.find({ projectId: project?._id }).sort({ pageNumber: 1 }).lean();

  console.log("Testing with existing extracted pages from DB...");
  const normalized = normalizeDatasheetExtraction(pages as any);

  console.log("=== CURRENT EDITOR JSON NODES (WITHOUT WORKER/NORMALIZATION FIX) ===");
  for (const n of normalized.editorJson.content || []) {
    console.log(n.type, (n.content as any[])?.map(c => c.text).join(" ") ?? "");
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

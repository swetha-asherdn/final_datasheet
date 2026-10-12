import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f907cadf8c3890130a39');
  const pages = await ExtractedPageModel.find({ projectId: project?._id }).sort({ pageNumber: 1 }).lean();

  for (const page of pages) {
    console.log(`\n=== PAGE ${page.pageNumber} ===`);
    for (const b of page.textBlocks) {
      console.log(`[${b.id}] (${b.boundingBox.x.toFixed(1)}, ${b.boundingBox.y.toFixed(1)}, ${b.boundingBox.width.toFixed(1)}, ${b.boundingBox.height.toFixed(1)}):`);
      console.log(JSON.stringify(b.text));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

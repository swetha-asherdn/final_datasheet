import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { createDatasheetFromExtraction } from '../src/server/datasheet/service';
import { DatasheetDocumentModel } from '../src/server/models/datasheet-document';
import { ExtractedPageModel } from '../src/server/models/extracted-page';

async function main() {
  await connectToDatabase();
  const projectId = '6ac604122043d2dfb43df033';
  const ownerId = '6aa008a8b1d2734cda63c958';

  console.log("Calling createDatasheetFromExtraction...");
  await createDatasheetFromExtraction({ projectId, ownerId, force: true });

  const project = await ProjectModel.findById(projectId);
  const doc = await DatasheetDocumentModel.findOne({ projectId });
  const pages = await ExtractedPageModel.find({ projectId }).sort({ pageNumber: 1 });

  console.log(`\n=================== PROJECT: ${project?.name} ===================`);
  console.log(`Status: ${project?.status}`);
  console.log(`Page count: ${project?.pageCount}`);

  console.log(`\n=== DATASHEET DOCUMENT (EDITOR JSON) ===`);
  console.log(`Title: ${doc?.title}`);
  console.log(`Product Code: ${doc?.productCode}`);
  console.log(`Nodes count: ${doc?.editorJson?.content?.length}`);

  let pageNum = 1;
  for (const n of doc?.editorJson?.content || []) {
    if (n.type === 'pageBreak') {
      pageNum++;
      console.log(`\n--- PAGE BREAK -> PAGE ${pageNum} ---`);
      continue;
    }
    if (n.type === 'bulletList') {
      console.log(`[bulletList] (${n.content?.length} items):`);
      for (const item of n.content || []) {
        const txt = item.content?.[0]?.content?.map((c: any) => c.text).join(' ');
        console.log(`   * ${txt}`);
      }
    } else if (n.type === 'heading') {
      const txt = n.content?.map((c: any) => c.text).join(' ');
      console.log(`[heading (lvl ${n.attrs?.level})]: "${txt}"`);
    } else if (n.type === 'paragraph') {
      const txt = n.content?.map((c: any) => c.text).join(' ');
      console.log(`[paragraph]: "${txt}"`);
    } else if (n.type === 'table') {
      console.log(`[table]: ${n.content?.length} rows`);
    } else if (n.type === 'image') {
      console.log(`[image]: ${n.attrs?.src}`);
    } else {
      console.log(`[${n.type}]:`, JSON.stringify(n).slice(0, 80));
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

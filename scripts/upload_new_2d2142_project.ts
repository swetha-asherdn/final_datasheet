import fs from 'fs';
import path from 'path';
import { connectToDatabase } from '../src/server/db';
import { createProjectWithUpload } from '../src/server/services/project-service';
import { ProjectModel } from '../src/server/models/project';
import { ProcessingJobModel } from '../src/server/models/processing-job';
import { DatasheetDocumentModel } from '../src/server/models/datasheet-document';

async function main() {
  await connectToDatabase();
  const ownerId = '6aa008a8b1d2734cda63c958'; // admin@example.com
  const pdfPath = 'C:\\Users\\Sandy\\Downloads\\2D2142A-5.pdf';

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`File not found: ${pdfPath}`);
  }

  const fileBytes = fs.readFileSync(pdfPath);
  const file = new File([fileBytes], '2Д2142А-5.pdf', { type: 'application/pdf' });

  console.log(`Creating NEW project with upload: 2Д2142А-5.pdf (${fileBytes.length} bytes)...`);
  const project = await createProjectWithUpload({
    ownerId,
    name: '2Д2142А-5 Rebrand Test ' + new Date().toISOString().slice(0, 16),
    description: 'Testing title, features, and heading preservation for 2Д2142А-5.pdf',
    file
  });

  const projectId = project._id.toString();
  console.log(`New Project Created! ID: ${projectId}`);

  console.log('Waiting for background worker processing...');
  let attempts = 0;
  while (attempts < 60) {
    attempts++;
    await new Promise((r) => setTimeout(r, 2000));
    const p = await ProjectModel.findById(projectId);
    const job = await ProcessingJobModel.findOne({ projectId });
    console.log(`[${attempts * 2}s] Project Status: ${p?.status}, Progress: ${p?.extractionProgress}%, Job Status: ${job?.status}`);

    if (p?.status === 'READY' || p?.status === 'COMPLETED' || p?.status === 'FAILED') {
      if (p.status === 'FAILED') {
        throw new Error(`Extraction failed: ${p.lastError || job?.errorSummary}`);
      }
      break;
    }
  }

  const doc = await DatasheetDocumentModel.findOne({ projectId });
  console.log(`\n=== DATASHEET DOCUMENT CREATED ===`);
  console.log(`Title: ${doc?.title}`);
  console.log(`Product Code: ${doc?.productCode}`);
  console.log(`EditorJson node count: ${doc?.editorJson?.content?.length}`);

  for (const n of doc?.editorJson?.content || []) {
    if (n.type === 'bulletList') {
      console.log(`[bulletList] (${n.content?.length} items):`);
      for (const item of n.content || []) {
        console.log(`   * ${item.content?.[0]?.content?.map((c: any) => c.text).join(' ')}`);
      }
    } else if (n.type === 'heading') {
      console.log(`[heading (lvl ${n.attrs?.level})]: "${n.content?.map((c: any) => c.text).join(' ')}"`);
    } else if (n.type === 'paragraph') {
      console.log(`[paragraph]: "${n.content?.map((c: any) => c.text).join(' ').slice(0, 70)}..."`);
    } else if (n.type === 'table') {
      console.log(`[table]: ${n.content?.length} rows`);
    } else if (n.type === 'image') {
      console.log(`[image]: ${n.attrs?.src}`);
    } else if (n.type === 'pageBreak') {
      console.log(`--- PAGE BREAK ---`);
    }
  }

  console.log(`\nProject ID to verify: ${projectId}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

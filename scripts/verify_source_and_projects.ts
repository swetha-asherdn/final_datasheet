import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractionRunModel } from '../src/server/models/extraction-run';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

async function main() {
  await connectToDatabase();
  const projects = await ProjectModel.find({}).sort({ createdAt: -1 });
  console.log('--- ALL PROJECTS IN DB ---');
  for (const p of projects) {
    console.log({
      id: p._id.toString(),
      title: p.title,
      status: p.status,
      originalPdf: p.originalPdf,
      latestDoc: p.latestDatasheetDocumentId?.toString(),
      createdAt: p.createdAt
    });
    const runs = await ExtractionRunModel.find({ projectId: p._id });
    console.log('  Runs count:', runs.length);
    for (const r of runs) {
      console.log('   Run ID:', r._id.toString(), 'status:', r.status, 'pageCount:', r.pageCount);
      const pages = await ExtractedPageModel.find({ extractionRunId: r._id }).select('pageNumber');
      console.log('   Extracted pages in DB:', pages.map(pg => pg.pageNumber).join(', '));
    }
  }

  console.log('\n--- PDF FILES IN WORKSPACE & DOWNLOADS ---');
  const dirs = ['.', '..', 'scratch'];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const files = fs.readdirSync(d).filter(f => f.toLowerCase().endsWith('.pdf'));
    for (const f of files) {
      const p = path.join(d, f);
      try {
        const bytes = fs.readFileSync(p);
        const doc = await PDFDocument.load(bytes);
        console.log(`${p} -> Page Count: ${doc.getPageCount()}, Size: ${bytes.length} bytes`);
      } catch (e: any) {
        console.log(`${p} -> Error loading: ${e.message}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

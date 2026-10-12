import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { DatasheetDocumentModel } from '../src/server/models/datasheet-document';
import { ExtractionRunModel } from '../src/server/models/extraction-run';
import { ExtractedPageModel } from '../src/server/models/extracted-page';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function main() {
  await connectToDatabase();
  const recentProjects = await ProjectModel.find({}).sort({ createdAt: -1 }).limit(5);

  console.log('--- RECENT PROJECTS ---');
  for (const p of recentProjects) {
    console.log(`\nProject ID: ${p._id}`);
    console.log(`Title: ${p.title}`);
    console.log(`Status: ${p.status}, ComposerStatus: ${p.composerStatus}`);
    console.log(`Original PDF:`, JSON.stringify(p.originalPdf, null, 2));
    console.log(`Latest Datasheet Doc ID: ${p.latestDatasheetDocumentId}`);

    const run = await ExtractionRunModel.findOne({ projectId: p._id }).sort({ createdAt: -1 });
    if (run) {
      console.log(`Extraction Run ID: ${run._id}, status: ${run.status}, pageCount: ${run.pageCount}`);
      const pageDocs = await ExtractedPageModel.find({ extractionRunId: run._id }).sort({ pageNumber: 1 });
      console.log(`Extracted pages count in DB: ${pageDocs.length}`);
      console.log(`Extracted page numbers:`, pageDocs.map(pg => pg.pageNumber).join(', '));
    }

    if (p.latestDatasheetDocumentId) {
      const doc = await DatasheetDocumentModel.findById(p.latestDatasheetDocumentId);
      if (doc) {
        console.log(`Datasheet Doc Title: ${doc.title}, status: ${doc.status}`);
        const editorContent = doc.editorJson?.content || [];
        const pageBreakCount = editorContent.filter((n: any) => n.type === 'pageBreak').length;
        console.log(`Editor JSON node count: ${editorContent.length}, pageBreaks: ${pageBreakCount}`);
      }
    }
  }

  // Let's also inspect the actual PDF file on disk:
  const sourcePdfPath = path.resolve('CW29150R-XX CW29150R-ADJ CW29151R-XX_vsp (2).pdf');
  const pdfBytes = fs.readFileSync(sourcePdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  console.log(`\nSource PDF on disk: ${sourcePdfPath}`);
  console.log(`Source PDF Page Count via pdf-lib: ${pdfDoc.getPageCount()}`);
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    console.log(`  Page ${i + 1} size: ${page.getWidth()} x ${page.getHeight()}`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

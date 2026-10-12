import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { createPdfExportForProject } from '../src/server/datasheet/export-service';
import { resolveDatasheetLayoutRenderModel } from '../src/server/datasheet/layout-service';
import { DatasheetExportModel } from '../src/server/models/datasheet-export';
import { getPrivateObjectBuffer } from '../src/server/storage/s3';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function main() {
  await connectToDatabase();
  const projectId = '6ac604122043d2dfb43df033';
  const ownerId = '6aa008a8b1d2734cda63c958';

  const project = await ProjectModel.findById(projectId);
  if (!project) throw new Error('Project not found');

  console.log('Project original PDF page count:', project.originalPdf?.pageCount);

  console.log('Resolving layout render model for project...');
  const renderModel = await resolveDatasheetLayoutRenderModel({ projectId, ownerId });
  console.log(`Render model mode: ${renderModel.mode}, Page count in pageModel: ${renderModel.pageModel.pages.length}`);
  renderModel.pageModel.pages.forEach((p, idx) => {
    console.log(`  Page ${idx + 1}: height=${p.usedHeight}mm, blocks=${p.blocks.length}`);
    p.blocks.forEach((b, bi) => {
      console.log(`    Block ${bi}: type=${b.type}, estimatedH=${b.estimatedHeight}mm, text="${b.text?.slice(0, 40)}"`);
    });
  });

  console.log('\nRunning createPdfExportForProject through export-service...');
  const exportResult = await createPdfExportForProject({ projectId, ownerId });
  console.log('Export created:', exportResult);

  const exportDoc = await DatasheetExportModel.findById(exportResult.id);
  console.log('Export record in DB:', {
    status: exportDoc?.status,
    filename: exportDoc?.filename,
    fileSize: exportDoc?.fileSize,
    storageKey: exportDoc?.storageKey,
    error: exportDoc?.errorMessage
  });

  if (exportDoc?.storageKey) {
    const pdfBuf = await getPrivateObjectBuffer(exportDoc.storageKey);
    const pdfDoc = await PDFDocument.load(pdfBuf);
    const pageCount = pdfDoc.getPageCount();
    console.log(`\n=================== EXPORTED PDF ===================`);
    console.log(`ACTUAL EXPORTED PDF PAGE COUNT: ${pageCount}`);

    const outPath = path.resolve(process.cwd(), 'scratch', 'exported_2d2142_rebranded.pdf');
    fs.writeFileSync(outPath, pdfBuf);
    console.log(`Saved exported PDF to: ${outPath}`);
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

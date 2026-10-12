import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { DatasheetDocumentModel } from '../src/server/models/datasheet-document';
import { createPdfExportForProject } from '../src/server/datasheet/export-service';
import { resolveDatasheetLayoutRenderModel } from '../src/server/datasheet/layout-service';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function main() {
  await connectToDatabase();
  const projectId = '6ac46ff6c0de837db134e0a5';
  const ownerId = '6aa008a8b1d2734cda63c958';

  const project = await ProjectModel.findById(projectId);
  if (!project) throw new Error('Project not found');

  console.log('Project original PDF page count:', project.originalPdf?.pageCount);

  console.log('Resolving layout render model for project...');
  const renderModel = await resolveDatasheetLayoutRenderModel({ projectId, ownerId });
  console.log(`Render model mode: ${renderModel.mode}, Page count in pageModel: ${renderModel.pageModel.pages.length}`);
  renderModel.pageModel.pages.forEach((p, idx) => {
    console.log(`  Page ${idx + 1}: height=${p.usedHeight}mm, blocks=${p.blocks.length}`);
  });

  console.log('Running createPdfExportForProject through export-service...');
  const exportResult = await createPdfExportForProject({ projectId, ownerId });
  console.log('Export created:', exportResult);

  // Check the exported PDF
  if (exportResult.downloadUrl) {
    console.log('Download URL:', exportResult.downloadUrl);
  }

  // Find the created PDF export record in DB
  const { DatasheetExportModel } = await import('../src/server/models/datasheet-export');
  const exportDoc = await DatasheetExportModel.findById(exportResult.id);
  console.log('Export record in DB:', {
    status: exportDoc?.status,
    filename: exportDoc?.filename,
    fileSize: exportDoc?.fileSize,
    storageKey: exportDoc?.storageKey,
    error: exportDoc?.errorMessage
  });
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

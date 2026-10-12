import { connectToDatabase } from "../src/server/db";
import { DatasheetExportModel } from "../src/server/models/datasheet-export";
import { DatasheetDocumentModel } from "../src/server/models/datasheet-document";
import { PDFDocument } from "pdf-lib";
import { getPrivateObject } from "../src/server/storage/s3";

async function main() {
  await connectToDatabase();
  const exports = await DatasheetExportModel.find({}).sort({ createdAt: -1 }).limit(5);
  console.log("Recent exports:", exports.map(e => ({
    id: e._id.toString(),
    projectId: e.projectId.toString(),
    status: e.status,
    filename: e.filename,
    storageKey: e.storageKey,
    createdAt: e.createdAt
  })));

  for (const exp of exports) {
    if (exp.storageKey) {
      try {
        const stream = await getPrivateObject(exp.storageKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const buf = Buffer.concat(chunks);
        const doc = await PDFDocument.load(buf);
        console.log(`Export ${exp._id} pages: ${doc.getPageCount()}`);
      } catch (err) {
        console.error(`Error reading ${exp.storageKey}:`, err);
      }
    }
  }

  const docs = await DatasheetDocumentModel.find({}).sort({ updatedAt: -1 }).limit(3);
  console.log("Recent documents:", docs.map(d => ({
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    contentCount: d.editorJson?.content?.length
  })));
}

main().catch(console.error);

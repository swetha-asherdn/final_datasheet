import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function uploadFile(localPath: string, bucket: string, key: string) {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true'
  } as any);
  const body = fs.readFileSync(localPath);
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/pdf' });
  await client.send(cmd);
}

async function main() {
  const localPdf = path.resolve(process.cwd(), 'KD0860UF (1).pdf');
  if (!fs.existsSync(localPdf)) {
    console.error('PDF not found at', localPdf);
    process.exit(2);
  }
  const bucket = process.env.S3_BUCKET || 'pdf-projects';
  const ownerId = process.env.TEST_OWNER_ID || '64f000000000000000000000';
  const projectId = process.env.TEST_PROJECT_ID || '64f000000000000000000001';
  const storageKey = `users/${ownerId}/projects/${projectId}/sources/KD0860UF.pdf`;

  console.log('Uploading', localPdf, 'to', storageKey);
  await uploadFile(localPdf, bucket, storageKey);
  console.log('Uploaded');

  const extractUrl = new URL('/extract', process.env.PYTHON_WORKER_URL || 'http://localhost:8000').toString();
  const body = {
    projectId,
    ownerId,
    source: { storageKey, originalFileName: path.basename(localPdf), mimeType: 'application/pdf' }
  };
  console.log('Calling worker', extractUrl);
  const res = await fetch(extractUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  if (!res.ok) {
    console.error('Worker returned', res.status, await res.text());
    process.exit(3);
  }
  const manifest = await res.json();
  const outManifest = path.resolve(process.cwd(), 'scratch', 'KD0860UF.manifest.json');
  fs.mkdirSync(path.dirname(outManifest), { recursive: true });
  fs.writeFileSync(outManifest, JSON.stringify(manifest, null, 2));
  console.log('Saved manifest to', outManifest);

  // Import normalization code
  const { normalizeDatasheetExtraction } = await import('../src/server/datasheet/normalization');
  const pages = manifest.pages || manifest.pages;
  const normalized = normalizeDatasheetExtraction(pages);
  const outNorm = path.resolve(process.cwd(), 'scratch', 'KD0860UF.normalized.json');
  fs.writeFileSync(outNorm, JSON.stringify(normalized, null, 2));
  console.log('Saved normalized output to', outNorm);
  console.log('Title:', normalized.title);
  console.log('Product code:', normalized.productCode);
  console.log('Sections detected:', normalized.qualitySummary.sectionsDetected);
}

main().catch((err) => { console.error(err); process.exit(1); });

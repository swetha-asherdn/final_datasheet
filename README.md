# Datasheet VelloreSemicon PDF Extractor

This repository contains the Phase 0 through Phase 3 foundation for a production-minded PDF Extractor and Datasheet Composer. It provides authentication, protected project management, private PDF upload storage, Redis/BullMQ processing, MongoDB Atlas persistence, a FastAPI extraction worker, read-only extraction review, and an editable Vellore Semicon datasheet composer.

Phase 4 branded PDF export is implemented with Puppeteer/Chromium, private export storage, and protected download routes.

## Phase 2 Architecture

```text
User uploads PDF
-> original PDF is stored privately in MinIO/R2-compatible storage
-> BullMQ extract-pdf job is created
-> Node worker receives the job
-> Node worker calls the internal FastAPI /extract service
-> Python worker downloads the original PDF from S3-compatible storage
-> Python extracts native text, page previews, embedded images, conservative tables, and OCR text where needed
-> Python uploads generated artifacts privately
-> Python returns a normalized extraction manifest
-> Node validates the manifest with Zod
-> Node persists ExtractionRun and ExtractedPage documents in MongoDB
-> Project moves to REVIEW_REQUIRED
-> User reviews extracted content on the project detail page
```

MongoDB stores extraction metadata and page-level structured content. Large generated artifacts stay in private object storage.

## Project Structure

- `src/app`: Next.js App Router pages and route handlers.
- `src/components/extraction-review.tsx`: read-only Phase 2 review UI.
- `src/server/extraction`: Zod schema and extraction service/persistence logic.
- `src/server/models`: Mongoose models for users, projects, jobs, extraction runs, and extracted pages.
- `src/server/queue`: BullMQ queue and Node worker lifecycle.
- `src/server/storage`: S3-compatible storage helpers.
- `worker`: FastAPI extraction service using PyMuPDF, pdfplumber, Pillow, Tesseract/OCR helpers, and boto3.
- `docs/extraction-schema.v1.json`: single source-of-truth normalized manifest schema.

## Prerequisites

- Node.js 22+
- npm 11+
- Docker Desktop or Docker Engine with Compose
- MongoDB Atlas cluster

## Local Setup

1. Copy `.env.example` to `.env`.
2. Create a free MongoDB Atlas `M0` cluster.
3. Create a database user in Atlas and keep the username/password for your connection string.
4. Add your current IP address in Atlas Network Access.
5. Paste the Atlas connection string into `.env` as `MONGODB_URI`.
6. For host-local development, change container service hostnames in `.env` to `localhost`:

```text
MONGODB_URI=mongodb+srv://<db-user>:<db-password>@<cluster-url>/pdf_extractor?retryWrites=true&w=majority&appName=<app-name>
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
PYTHON_WORKER_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_MAX_UPLOAD_BYTES=26214400
OCR_LANGUAGES=eng
```

7. Install dependencies with `npm install`.
8. Start local infrastructure and the Python worker: `docker compose up redis minio worker`.
9. Run `npm run seed:admin`, `npm run worker:node`, and `npm run dev` in separate terminals as needed.

## Docker Setup

Run the full stack:

```bash
docker compose up --build
```

Services:

- Web: http://localhost:3000
- FastAPI worker health: http://localhost:8000/health
- MinIO API: http://localhost:9000
- MinIO console: http://localhost:9001
- Redis: localhost:6379

MongoDB is external through `MONGODB_URI`; Compose does not start a local MongoDB container.

## Environment Variables

- `NEXTAUTH_URL`: public base URL for Auth.js callbacks.
- `NEXTAUTH_SECRET`: long random secret for session signing.
- `MONGODB_URI`: MongoDB Atlas connection string used by the app at runtime.
- `MONGODB_URI_LOCAL`: optional example value for local MongoDB only; not used unless copied into `MONGODB_URI`.
- `REDIS_URL`: Redis connection string used by BullMQ.
- `S3_ENDPOINT`: S3-compatible endpoint for MinIO or R2.
- `S3_REGION`: S3 region value.
- `S3_ACCESS_KEY_ID`: S3-compatible access key.
- `S3_SECRET_ACCESS_KEY`: S3-compatible secret key.
- `S3_BUCKET`: private object bucket name.
- `S3_FORCE_PATH_STYLE`: `true` for MinIO, often `false` for hosted S3-compatible providers.
- `MAX_UPLOAD_BYTES`: server upload limit, default 25 MB.
- `NEXT_PUBLIC_MAX_UPLOAD_BYTES`: optional client display/validation limit.
- `PYTHON_WORKER_URL`: internal FastAPI extraction endpoint base URL.
- `EXTRACTION_TIMEOUT_MS`: Node worker timeout for the Python extraction request, default 10 minutes.
- `OCR_LANGUAGES`: Tesseract language codes, default `eng`.
- `OCR_MIN_NATIVE_TEXT_CHARS`: minimum native characters before OCR is skipped for a page.
- `PREVIEW_ZOOM`: PyMuPDF render scale for page previews.
- `MIN_EXTRACTED_IMAGE_SIDE`: minimum extracted image side length to ignore tiny masks/noise.
- `PUPPETEER_EXECUTABLE_PATH`: optional Chromium/Chrome/Edge executable path for host-local PDF export. Docker sets `/usr/bin/chromium-browser`; Windows local development can use Chrome or Edge, for example `C:\Program Files\Google\Chrome\Application\chrome.exe`.

## Supported Extraction Behavior

- Native/selectable text PDFs extract best and avoid OCR unless an individual page has weak or missing text.
- Scanned or image-only pages attempt English OCR and record `OCR_USED` or confidence warnings.
- Embedded raster images are extracted and uploaded as private PNG artifacts.
- Page previews are generated as private JPEG artifacts.
- Basic tables are extracted conservatively through pdfplumber when row/column structure is clear.
- Page dimensions and bounding boxes use PDF points with a top-left coordinate origin as emitted by PyMuPDF.

## Artifact Layout

- Originals: `users/{ownerId}/projects/{projectId}/original/{fileName}`
- Page previews: `users/{ownerId}/projects/{projectId}/previews/page-{pageNumber}.jpg`
- Extracted images: `users/{ownerId}/projects/{projectId}/extracted/images/page-{pageNumber}/{imageId}.png`

Artifacts remain private. Browser-facing review and editor images use protected Next.js artifact proxy routes rather than permanent public MinIO URLs.

## Phase 3 Datasheet Composer

Phase 3 adds an editable datasheet layer on top of the completed extraction data:

```text
Completed ExtractionRun + ExtractedPage[]
-> generic header/footer/source-branding cleanup
-> source cleanup report with reviewable decisions
-> Tiptap-compatible editable body JSON
-> Vellore Semicon template settings
-> DatasheetDocument + DatasheetTemplateSettings in MongoDB
```

The cleanup engine does not hard-code vendor names. It classifies likely source branding through page layout and repetition: top 12-15% page regions are possible headers, bottom 10-12% are possible footers, repeated text/images across similar positions are likely old branding, and page numbers, footer URLs, revision/date/copyright lines are removable when confidence is high. Removed and uncertain items are stored in `sourceCleanupReport`, so users can restore or keep them removed from the Cleanup Review tab.

The default Vellore Semicon template uses a local logo asset at `public/branding/vellore-semicon-logo.svg`, A4 portrait sizing, navy `#0D2B55`, accent `#D6533E`, footer text `www.velloresemicon.com`, page numbers, and `Preliminary Datasheet | Rev. A` revision text. The Branding Template tab lets users edit product code, title/category, website, status, revision, and colors. Header/footer settings are stored separately from the editor body so Phase 4 export can render them consistently.

To create an editable datasheet:

1. Upload a PDF and wait for the project to reach `REVIEW_REQUIRED`.
2. Open the project detail page.
3. Use `Create editable datasheet` from the Datasheet Composer tabs.
4. Edit body text, headings, lists, images, and tables in the Datasheet Editor tab.
5. Save manually or let autosave persist editor JSON after changes.
6. Review removed/uncertain source branding in Cleanup Review and restore items when needed.

Known Phase 3 limitations:

- Header/footer removal is confidence-based and reviewable; unusual layouts can need manual restore/remove.
- Complex merged technical tables may need manual cleanup after conversion.
- Image replacement is not fully polished; extracted images render through protected artifact routes.
- Exact page-canvas editing is not part of this phase.
- DOCX export and multi-template management are not part of Phase 4.

## Phase 4 Branded PDF Export

The Datasheet Composer `Exports` tab generates a Vellore Semicon branded PDF from the latest saved editor JSON and template settings. Export records are stored in MongoDB, generated PDFs are uploaded to private S3/MinIO storage, and downloads use owner-protected API routes instead of public object URLs.

PDF rendering uses `puppeteer-core` with a Chromium executable resolved in this order:

1. `PUPPETEER_EXECUTABLE_PATH` when set and valid.
2. Common Linux/Docker paths such as `/usr/bin/chromium-browser` and `/usr/bin/chromium`.
3. Common Windows Chrome and Edge install paths.

Docker installs Chromium and fonts in the web/node image and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`. For local Windows development, either run Docker for parity or set `PUPPETEER_EXECUTABLE_PATH` to Chrome or Edge in `.env`.

## Reviewing Extraction Data

1. Sign in and upload a PDF from `/projects/new`.
2. Keep `node-worker` and `worker` running.
3. Open the project detail page.
4. While the job is queued or processing, the review screen polls for updates.
5. After extraction completes, the page shows summary counts, page previews, selected page text, images, tables, and warnings.

To inspect MongoDB directly, look at:

- `extractionruns`: one compact run summary per extraction attempt.
- `extractedpages`: page-level text blocks, images, tables, warnings, and preview keys.
- `projects`: only safe summary fields such as `latestExtractionRunId`, `pageCount`, `extractionSummary`, and status.

## Retry Failed Extraction

If extraction fails, the project remains uploaded and moves to `FAILED`. Use the retry button on the project detail page or call:

```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/retry-extraction
```

Retries are owner-protected and blocked while another extraction job is active.

## Known Limitations

- Native text PDFs should extract best.
- Scanned PDFs depend on OCR quality and installed Tesseract language data.
- Complex multi-column layouts may need manual review.
- Complex image-only tables are not fully reconstructed in this phase.
- Table extraction is conservative and may omit uncertain tables instead of fabricating structure.
- Password-protected PDFs are not supported.
- Exact editable reproduction is not promised yet.


## Quality Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
python -m pytest worker/tests
docker compose config
```

## Troubleshooting

- If login fails after editing credentials, rerun `npm run seed:admin`.
- If uploads fail with bucket errors, confirm MinIO is healthy and `S3_BUCKET` is set.
- If jobs do not progress, confirm `npm run worker:node` or the `node-worker` container is running.
- If extraction fails immediately, check `PYTHON_WORKER_URL`, the FastAPI worker logs, and S3-compatible credentials.
- If OCR returns weak text, confirm `tesseract-ocr` and the requested `OCR_LANGUAGES` data are installed in the worker image.
- If Docker web cannot connect to services, use Compose hostnames in `.env` for containerized services: `redis`, `minio`, and `worker`. Keep `MONGODB_URI` pointed at Atlas.
- If host-local Next.js cannot connect, use `localhost` endpoints instead.
- If PDF export fails with a Chromium executable error, set `PUPPETEER_EXECUTABLE_PATH` or use Docker. On Windows, point it to Chrome or Edge; in Docker it defaults to `/usr/bin/chromium-browser`.


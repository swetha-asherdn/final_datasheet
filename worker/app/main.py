from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import shutil
import tempfile
import time
import uuid
import httpx
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import boto3
import fitz
import pdfplumber
from botocore.config import Config
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

try:
    import pytesseract
except Exception:  # pragma: no cover - optional runtime dependency
    pytesseract = None

app = FastAPI(title="PDF Extractor Worker", version="0.2.0")

OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "eng")
MIN_TEXT_CHARS = int(os.getenv("OCR_MIN_NATIVE_TEXT_CHARS", "25"))
PREVIEW_ZOOM = float(os.getenv("PREVIEW_ZOOM", "1.6"))
MIN_IMAGE_SIDE = int(os.getenv("MIN_EXTRACTED_IMAGE_SIDE", "32"))


class Source(BaseModel):
    storageKey: str
    originalFileName: str
    mimeType: Literal["application/pdf"]


class ExtractRequest(BaseModel):
    projectId: str
    ownerId: str
    source: Source
    extractionEngine: Literal["native", "google_doc_ai", "gemini_vision"] = "gemini_vision"


class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TextBlock(BaseModel):
    id: str
    type: Literal["heading", "paragraph", "list_item", "header", "footer", "text_block", "unknown_text_block"]
    text: str
    pageNumber: int
    boundingBox: BoundingBox
    fontSize: float | None = None
    fontFamily: str | None = None
    fontWeight: str | None = None
    fontStyle: str | None = None
    textColor: str | None = None
    alignment: str | None = None
    extractionMethod: Literal["native", "ocr"]
    confidence: float
    readingOrderIndex: int
    warnings: list[str] = Field(default_factory=list)


class ExtractedImage(BaseModel):
    id: str
    pageNumber: int
    storageKey: str
    width: int
    height: int
    boundingBox: BoundingBox
    mimeType: str
    originalFormat: str | None = None
    extractionMethod: str
    confidence: float
    warnings: list[str] = Field(default_factory=list)


class TableCell(BaseModel):
    text: str
    rowSpan: int = 1
    colSpan: int = 1


class ExtractedTable(BaseModel):
    id: str
    type: Literal["table"] = "table"
    pageNumber: int
    boundingBox: BoundingBox
    rows: list[list[TableCell]]
    confidence: float
    extractionMethod: Literal["pdfplumber", "camelot"]
    warnings: list[str] = Field(default_factory=list)


class ExtractedPage(BaseModel):
    pageNumber: int
    width: float
    height: float
    rotation: int
    previewStorageKey: str
    textBlocks: list[TextBlock]
    images: list[ExtractedImage]
    tables: list[ExtractedTable]
    warnings: list[str]
    confidence: float


class Processing(BaseModel):
    startedAt: str
    completedAt: str
    durationMs: int
    nativeTextDetected: bool
    ocrUsed: bool


class Summary(BaseModel):
    textBlockCount: int
    imageCount: int
    tableCount: int
    warningCount: int


class SourceFile(BaseModel):
    storageKey: str
    originalFileName: str
    checksum: str | None


class ExtractionManifest(BaseModel):
    schemaVersion: Literal["1.0"] = "1.0"
    projectId: str
    sourceFile: SourceFile
    pageCount: int
    processing: Processing
    summary: Summary
    pages: list[ExtractedPage]
    warnings: list[str] = Field(default_factory=list)


class ConvertRequest(BaseModel):
    projectId: str
    ownerId: str
    source: Source


class ConvertResponse(BaseModel):
    success: bool
    storageKey: str | None = None
    fileSize: int | None = None
    error: str | None = None


class ExportRequest(BaseModel):
    projectId: str
    ownerId: str
    docxStorageKey: str


class ExportResponse(BaseModel):
    success: bool
    pdfStorageKey: str | None = None
    fileSize: int | None = None
    error: str | None = None

class BrandingSettings(BaseModel):
    companyName: str
    logoStorageKey: str | None = None
    productCode: str | None = ""
    productTitle: str | None = ""
    documentStatus: str | None = ""
    revision: str | None = ""
    primaryColor: str | None = ""
    accentColor: str | None = ""


class RebrandRequest(BaseModel):
    projectId: str
    ownerId: str
    docxStorageKey: str
    branding: BrandingSettings


class RebrandResponse(BaseModel):
    success: bool
    storageKey: str | None = None
    fileSize: int | None = None
    error: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def format_utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@app.post("/extract", response_model=ExtractionManifest)
def extract(request: ExtractRequest) -> ExtractionManifest:
    job_id = uuid.uuid4().hex
    started = datetime.now(timezone.utc)
    started_monotonic = time.monotonic()
    work_dir = Path(tempfile.gettempdir()) / "pdf-extractor" / request.projectId / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = work_dir / "source.pdf"
    warnings: list[str] = []

    try:
        download_object(request.source.storageKey, pdf_path)
        data = pdf_path.read_bytes()
        if not data.startswith(b"%PDF-"):
            raise HTTPException(status_code=422, detail={"code": "INVALID_PDF_SIGNATURE", "message": "Downloaded file is not a valid PDF"})

        checksum = hashlib.sha256(data).hexdigest()
        document = fitz.open(pdf_path)
        try:
            if request.extractionEngine == "gemini_vision":
                pages = extract_pages_with_gemini_vision(document, data, request, work_dir, warnings)
            elif request.extractionEngine == "google_doc_ai":
                pages = extract_pages_with_google_doc_ai(document, data, request, work_dir, warnings)
            else:
                pages = extract_pages(document, request, work_dir, warnings)
        finally:
            document.close()

        completed = datetime.now(timezone.utc)
        text_count = sum(len(page.textBlocks) for page in pages)
        image_count = sum(len(page.images) for page in pages)
        table_count = sum(len(page.tables) for page in pages)
        warning_count = len(warnings) + sum(len(page.warnings) for page in pages)
        native_text_detected = any(block.extractionMethod == "native" for page in pages for block in page.textBlocks)
        ocr_used = any(block.extractionMethod == "ocr" for page in pages for block in page.textBlocks)

        return ExtractionManifest(
            projectId=request.projectId,
            sourceFile=SourceFile(storageKey=request.source.storageKey, originalFileName=request.source.originalFileName, checksum=checksum),
            pageCount=len(pages),
            processing=Processing(
                startedAt=format_utc_iso(started),
                completedAt=format_utc_iso(completed),
                durationMs=int((time.monotonic() - started_monotonic) * 1000),
                nativeTextDetected=native_text_detected,
                ocrUsed=ocr_used,
            ),
            summary=Summary(textBlockCount=text_count, imageCount=image_count, tableCount=table_count, warningCount=warning_count),
            pages=pages,
            warnings=warnings,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"code": "EXTRACTION_FAILED", "message": str(exc)[:300]}) from exc
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        region_name=os.getenv("S3_REGION", "us-east-1"),
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        config=Config(s3={"addressing_style": "path" if os.getenv("S3_FORCE_PATH_STYLE", "true").lower() == "true" else "virtual"}),
    )


def download_object(storage_key: str, destination: Path) -> None:
    s3_client().download_file(os.environ["S3_BUCKET"], storage_key, str(destination))


def upload_bytes(storage_key: str, body: bytes, content_type: str) -> None:
    s3_client().put_object(Bucket=os.environ["S3_BUCKET"], Key=storage_key, Body=body, ContentType=content_type)


def extract_pages(document: fitz.Document, request: ExtractRequest, work_dir: Path, warnings: list[str]) -> list[ExtractedPage]:
    table_map = extract_tables(work_dir / "source.pdf", warnings)
    pages: list[ExtractedPage] = []
    for index, page in enumerate(document, start=1):
        page_warnings: list[str] = []
        if page.rotation:
            page_warnings.append("ROTATED_PAGE")

        preview_key = f"users/{request.ownerId}/projects/{request.projectId}/previews/page-{index}.jpg"
        upload_page_preview(page, preview_key)
        text_blocks = native_text_blocks(page, index)
        if meaningful_text_length(text_blocks) < MIN_TEXT_CHARS:
            page_warnings.append("IMAGE_ONLY_PAGE")
            ocr_blocks = ocr_text_blocks(page, index, page_warnings)
            if ocr_blocks:
                text_blocks = ocr_blocks
            else:
                page_warnings.append("LOW_TEXT_CONFIDENCE")
        images = extract_images(document, page, request, index, page_warnings)
        vector_images = extract_vector_diagrams(document, page, request, index, page_warnings)
        for v_img in vector_images:
            overlap = False
            for r_img in images:
                if (v_img.boundingBox.x < r_img.boundingBox.x + r_img.boundingBox.width and
                    v_img.boundingBox.x + v_img.boundingBox.width > r_img.boundingBox.x and
                    v_img.boundingBox.y < r_img.boundingBox.y + r_img.boundingBox.height and
                    v_img.boundingBox.y + v_img.boundingBox.height > r_img.boundingBox.y):
                    overlap = True
                    break
            if not overlap:
                images.append(v_img)

        tables = table_map.get(index, [])
        if not tables and "TABLE_EXTRACTION_UNCERTAIN" in page_warnings:
            page_warnings.append("TABLE_EXTRACTION_UNCERTAIN")

        pages.append(
            ExtractedPage(
                pageNumber=index,
                width=float(page.rect.width),
                height=float(page.rect.height),
                rotation=int(page.rotation),
                previewStorageKey=preview_key,
                textBlocks=text_blocks,
                images=images,
                tables=tables,
                warnings=sorted(set(page_warnings)),
                confidence=page_confidence(text_blocks, page_warnings),
            )
        )
    return pages


DISTRIBUTOR_WATERMARKS = [
    "datasheet4u",
    "alldatasheet",
    "www.fairchildsemi.com",
    "www.onsemi.com",
    "downloaded from",
]


def is_distributor_watermark(text: str) -> bool:
    low = text.lower().strip()
    return any(p in low for p in DISTRIBUTOR_WATERMARKS)


def extract_text_anchor(text_anchor: dict, doc_text: str) -> str:
    if not text_anchor or not doc_text:
        return ""
    segments = text_anchor.get("textSegments", [])
    parts = []
    for seg in segments:
        try:
            start = int(seg.get("startIndex", 0))
            end = int(seg.get("endIndex", len(doc_text)))
            parts.append(doc_text[start:end])
        except Exception:
            pass
    return "".join(parts).strip()


def vertices_to_box(normalized_vertices: list[dict], width: float, height: float) -> BoundingBox:
    if not normalized_vertices:
        return BoundingBox(x=0, y=0, width=width, height=height)
    xs = [float(v.get("x", 0)) * width for v in normalized_vertices]
    ys = [float(v.get("y", 0)) * height for v in normalized_vertices]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return BoundingBox(x=min_x, y=min_y, width=max(max_x - min_x, 1.0), height=max(max_y - min_y, 1.0))


def extract_pages_with_google_doc_ai(
    document: fitz.Document,
    pdf_bytes: bytes,
    request: ExtractRequest,
    work_dir: Path,
    warnings: list[str],
) -> list[ExtractedPage]:
    gcp_project = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("GCP_LOCATION", "us")
    processor_id = os.getenv("DOCUMENT_AI_PROCESSOR_ID")

    if not gcp_project or not processor_id:
        warnings.append("GOOGLE_DOC_AI_UNCONFIGURED: Set GCP_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID. Falling back to native extraction.")
        return extract_pages(document, request, work_dir, warnings)

    endpoint = f"https://{location}-documentai.googleapis.com/v1/projects/{gcp_project}/locations/{location}/processors/{processor_id}:process"
    headers = {"Content-Type": "application/json"}

    auth_token = os.getenv("GOOGLE_DOC_AI_ACCESS_TOKEN") or os.getenv("GCP_ACCESS_TOKEN")
    if not auth_token:
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_path and os.path.exists(creds_path):
            try:
                from google.oauth2 import service_account
                import google.auth.transport.requests
                creds = service_account.Credentials.from_service_account_file(
                    creds_path,
                    scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
                auth_req = google.auth.transport.requests.Request()
                creds.refresh(auth_req)
                auth_token = creds.token
            except Exception as e:
                warnings.append(f"GOOGLE_AUTH_FAILED:{str(e)[:80]}")

    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    elif os.getenv("GOOGLE_DOC_AI_API_KEY"):
        endpoint += f"?key={os.getenv('GOOGLE_DOC_AI_API_KEY')}"
    else:
        warnings.append("GOOGLE_DOC_AI_NO_AUTH: Provide GOOGLE_APPLICATION_CREDENTIALS, GCP_ACCESS_TOKEN or GOOGLE_DOC_AI_API_KEY. Falling back.")
        return extract_pages(document, request, work_dir, warnings)

    payload = {
        "rawDocument": {
            "content": base64.b64encode(pdf_bytes).decode("utf-8"),
            "mimeType": "application/pdf"
        }
    }

    try:
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            if resp.status_code != 200:
                warnings.append(f"GOOGLE_DOC_AI_API_ERROR_{resp.status_code}:{resp.text[:120]}")
                return extract_pages(document, request, work_dir, warnings)
            doc_ai_result = resp.json()
    except Exception as exc:
        warnings.append(f"GOOGLE_DOC_AI_CALL_FAILED:{str(exc)[:100]}")
        return extract_pages(document, request, work_dir, warnings)

    doc_data = doc_ai_result.get("document", {})
    doc_text = doc_data.get("text", "")
    doc_pages = doc_data.get("pages", [])

    pages: list[ExtractedPage] = []
    warnings.append("GOOGLE_DOC_AI_USED")

    for index, page in enumerate(document, start=1):
        page_warnings: list[str] = ["GOOGLE_DOC_AI_USED"]
        width = float(page.rect.width)
        height = float(page.rect.height)
        preview_key = f"users/{request.ownerId}/projects/{request.projectId}/previews/page-{index}.jpg"
        upload_page_preview(page, preview_key)

        # Match Doc AI page
        doc_page = None
        for dp in doc_pages:
            if int(dp.get("pageNumber", 0)) == index:
                doc_page = dp
                break
        if not doc_page and index <= len(doc_pages):
            doc_page = doc_pages[index - 1]

        text_blocks: list[TextBlock] = []
        tables: list[ExtractedTable] = []

        if doc_page:
            # 1. Parse Tables from Document AI with proper row/col spans
            for t_idx, raw_table in enumerate(doc_page.get("tables", [])):
                t_rows: list[list[TableCell]] = []
                for r in raw_table.get("headerRows", []):
                    row_cells = []
                    for c in r.get("cells", []):
                        cell_text = extract_text_anchor(c.get("layout", {}).get("textAnchor", {}), doc_text)
                        row_cells.append(TableCell(
                            text=cell_text,
                            rowSpan=int(c.get("rowSpan", 1) or 1),
                            colSpan=int(c.get("colSpan", 1) or 1)
                        ))
                    if any(rc.text for rc in row_cells):
                        t_rows.append(row_cells)
                for r in raw_table.get("bodyRows", []):
                    row_cells = []
                    for c in r.get("cells", []):
                        cell_text = extract_text_anchor(c.get("layout", {}).get("textAnchor", {}), doc_text)
                        row_cells.append(TableCell(
                            text=cell_text,
                            rowSpan=int(c.get("rowSpan", 1) or 1),
                            colSpan=int(c.get("colSpan", 1) or 1)
                        ))
                    if any(rc.text for rc in row_cells):
                        t_rows.append(row_cells)

                if t_rows:
                    poly = raw_table.get("layout", {}).get("boundingPoly", {}).get("normalizedVertices", [])
                    t_box = vertices_to_box(poly, width, height)
                    tables.append(
                        ExtractedTable(
                            id=f"p{index}-docai-table-{t_idx}",
                            pageNumber=index,
                            boundingBox=t_box,
                            rows=t_rows,
                            confidence=0.95,
                            extractionMethod="camelot",
                            warnings=[]
                        )
                    )

            # 2. Parse Text Blocks from Document AI paragraphs/blocks in reading order
            raw_blocks = doc_page.get("paragraphs") or doc_page.get("blocks") or []
            order_idx = 0
            for b_idx, b in enumerate(raw_blocks):
                layout = b.get("layout", {})
                b_text = extract_text_anchor(layout.get("textAnchor", {}), doc_text)
                if not b_text or is_distributor_watermark(b_text):
                    continue
                poly = layout.get("boundingPoly", {}).get("normalizedVertices", [])
                box = vertices_to_box(poly, width, height)
                text_blocks.append(
                    TextBlock(
                        id=f"p{index}-docai-text-{order_idx}",
                        type=classify_text(b_text, None),
                        text=b_text,
                        pageNumber=index,
                        boundingBox=box,
                        extractionMethod="ocr",
                        confidence=0.95,
                        readingOrderIndex=order_idx,
                        warnings=["GOOGLE_DOC_AI"]
                    )
                )
                order_idx += 1

        # Fallback if doc AI text was empty on this page
        if not text_blocks:
            text_blocks = native_text_blocks(page, index)

        # 3. Extract High-Res Vector Diagrams and Raster Images from PyMuPDF
        images = extract_images(document, page, request, index, page_warnings)
        vector_images = extract_vector_diagrams(document, page, request, index, page_warnings)
        for v_img in vector_images:
            overlap = False
            for r_img in images:
                if (v_img.boundingBox.x < r_img.boundingBox.x + r_img.boundingBox.width and
                    v_img.boundingBox.x + v_img.boundingBox.width > r_img.boundingBox.x and
                    v_img.boundingBox.y < r_img.boundingBox.y + r_img.boundingBox.height and
                    v_img.boundingBox.y + v_img.boundingBox.height > r_img.boundingBox.y):
                    overlap = True
                    break
            if not overlap:
                images.append(v_img)

        pages.append(
            ExtractedPage(
                pageNumber=index,
                width=width,
                height=height,
                rotation=int(page.rotation),
                previewStorageKey=preview_key,
                textBlocks=text_blocks,
                images=images,
                tables=tables,
                warnings=sorted(set(page_warnings)),
                confidence=page_confidence(text_blocks, page_warnings),
            )
        )

    return pages


def clean_json_response(raw_text: str) -> dict | None:
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned.strip())
    except Exception:
        m = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return None


def call_gemini_vision_api(payload: dict, gemini_key: str, page_warnings: list[str]) -> dict | None:
    headers = {"Content-Type": "application/json"}
    user_model = os.getenv("GEMINI_MODEL")
    candidate_endpoints = []
    if user_model:
        candidate_endpoints.append(f"https://generativelanguage.googleapis.com/v1beta/models/{user_model}:generateContent?key={gemini_key}")
        candidate_endpoints.append(f"https://generativelanguage.googleapis.com/v1/models/{user_model}:generateContent?key={gemini_key}")

    candidate_endpoints.extend([
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}",
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={gemini_key}",
    ])

    last_error = ""
    with httpx.Client(timeout=60.0) as client:
        for ep in candidate_endpoints:
            try:
                resp = client.post(ep, json=payload, headers=headers)
                if resp.status_code == 200:
                    resp_json = resp.json()
                    candidates = resp_json.get("candidates", [])
                    if candidates:
                        content_parts = candidates[0].get("content", {}).get("parts", [])
                        if content_parts:
                            raw_text = content_parts[0].get("text", "")
                            parsed = clean_json_response(raw_text)
                            if parsed:
                                return parsed
                else:
                    last_error = f"{resp.status_code}:{resp.text[:80]}"
            except Exception as e:
                last_error = str(e)[:80]

    if last_error:
        page_warnings.append(f"GEMINI_API_ERROR:{last_error}")
    return None


def extract_pages_with_gemini_vision(
    document: fitz.Document,
    pdf_bytes: bytes,
    request: ExtractRequest,
    work_dir: Path,
    warnings: list[str],
) -> list[ExtractedPage]:
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_API_KEY")
    if not gemini_key:
        warnings.append("GEMINI_API_KEY_MISSING: Set GEMINI_API_KEY to use Gemini Multimodal Vision AI. Falling back to native extraction.")
        return extract_pages(document, request, work_dir, warnings)

    prompt = """You are an expert semiconductor engineer and technical document parser.
Analyze this high-resolution datasheet page image and extract all structured content with 100% precision.

Rules:
1. ORDERING & LAYOUT:
   - Identify two-column or multi-column sections (such as 'Features' on left and 'General Description' on right) and extract them cleanly in proper logical reading order.
   - Extract 'Features' as distinct bullet list items.
   - Extract 'General Description' and applications as full coherent paragraphs.
2. TABLES:
   - Extract all electrical, thermal, absolute maximum rating, and ordering tables with EXACT column headers and cell values.
   - For sub-header rows (e.g. 'Off Characteristics', 'On Characteristics', 'Dynamic Characteristics', 'Switching Characteristics'), preserve them as section header rows.
   - Preserve all electrical units (V, mV, A, mA, uA, mΩ, Ω, pF, nC, ns, °C, °C/W, etc.).
3. WATERMARKS & DISTRIBUTOR ARTIFACTS:
   - DO NOT extract distributor watermarks (e.g. 'DataSheet4U.com', 'alldatasheet', 'downloaded from', distributor websites).
   - Ignore repeated copyright footnotes and website URLs at the page edges.
4. DIAGRAMS & FIGURES:
   - For any graph, circuit schematic, pinout, or curve (e.g., 'Figure 1. On-Region Characteristics'), extract its title/caption as a figure block.

Return ONLY a JSON object with this exact schema:
{
  "sections": [
    {
      "type": "heading" | "paragraph" | "list" | "table" | "figure",
      "level": 1,
      "title": "Heading or Table or Figure Title",
      "text": "Paragraph text...",
      "items": ["Bullet 1", "Bullet 2"],
      "headers": [["Col 1", "Col 2"]],
      "rows": [["Cell 1", "Cell 2"]],
      "caption": "Figure X. Caption..."
    }
  ]
}
"""

    pages: list[ExtractedPage] = []
    warnings.append("GEMINI_VISION_USED")

    for index, page in enumerate(document, start=1):
        page_warnings: list[str] = ["GEMINI_VISION_USED"]
        width = float(page.rect.width)
        height = float(page.rect.height)
        preview_key = f"users/{request.ownerId}/projects/{request.projectId}/previews/page-{index}.jpg"
        upload_page_preview(page, preview_key)

        # 1. Render high-res page image for Gemini Vision
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
        img_bytes = pix.tobytes("png")
        b64_img = base64.b64encode(img_bytes).decode("utf-8")

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": b64_img
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        }

        parsed_data = call_gemini_vision_api(payload, gemini_key, page_warnings)

        text_blocks: list[TextBlock] = []
        tables: list[ExtractedTable] = []

        if parsed_data and isinstance(parsed_data.get("sections"), list):
            order_idx = 0
            for sec_idx, sec in enumerate(parsed_data["sections"]):
                sec_type = sec.get("type", "paragraph")
                if sec_type == "heading":
                    h_title = sec.get("title") or sec.get("text") or ""
                    if h_title and not is_distributor_watermark(h_title):
                        text_blocks.append(
                            TextBlock(
                                id=f"p{index}-gemini-h-{order_idx}",
                                type="heading",
                                text=h_title,
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=24),
                                extractionMethod="ocr",
                                confidence=0.98,
                                readingOrderIndex=order_idx,
                                warnings=["GEMINI_VISION"]
                            )
                        )
                        order_idx += 1
                elif sec_type == "list":
                    items = sec.get("items") or []
                    if sec.get("title"):
                        text_blocks.append(
                            TextBlock(
                                id=f"p{index}-gemini-h-{order_idx}",
                                type="heading",
                                text=sec.get("title", ""),
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=20),
                                extractionMethod="ocr",
                                confidence=0.98,
                                readingOrderIndex=order_idx,
                                warnings=["GEMINI_VISION"]
                            )
                        )
                        order_idx += 1
                    for item in items:
                        if item and not is_distributor_watermark(item):
                            text_blocks.append(
                                TextBlock(
                                    id=f"p{index}-gemini-li-{order_idx}",
                                    type="list_item",
                                    text=str(item),
                                    pageNumber=index,
                                    boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=16),
                                    extractionMethod="ocr",
                                    confidence=0.98,
                                    readingOrderIndex=order_idx,
                                    warnings=["GEMINI_VISION"]
                                )
                            )
                            order_idx += 1
                elif sec_type == "table":
                    t_title = sec.get("title", "")
                    if t_title:
                        text_blocks.append(
                            TextBlock(
                                id=f"p{index}-gemini-th-{order_idx}",
                                type="heading",
                                text=t_title,
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=20),
                                extractionMethod="ocr",
                                confidence=0.98,
                                readingOrderIndex=order_idx,
                                warnings=["GEMINI_VISION"]
                            )
                        )
                        order_idx += 1

                    t_rows: list[list[TableCell]] = []
                    for h_row in sec.get("headers", []):
                        cells = [TableCell(text=str(c), rowSpan=1, colSpan=1) for c in h_row]
                        if any(c.text for c in cells):
                            t_rows.append(cells)
                    for b_row in sec.get("rows", []):
                        cells = [TableCell(text=str(c), rowSpan=1, colSpan=1) for c in b_row]
                        if any(c.text for c in cells):
                            t_rows.append(cells)

                    if t_rows:
                        tables.append(
                            ExtractedTable(
                                id=f"p{index}-gemini-table-{sec_idx}",
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=100, width=width - 80, height=200),
                                rows=t_rows,
                                confidence=0.98,
                                extractionMethod="camelot",
                                warnings=["GEMINI_VISION"]
                            )
                        )
                elif sec_type == "figure":
                    cap = sec.get("caption") or sec.get("title") or ""
                    if cap and not is_distributor_watermark(cap):
                        text_blocks.append(
                            TextBlock(
                                id=f"p{index}-gemini-fig-{order_idx}",
                                type="paragraph",
                                text=cap,
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=18),
                                extractionMethod="ocr",
                                confidence=0.98,
                                readingOrderIndex=order_idx,
                                warnings=["GEMINI_VISION"]
                            )
                        )
                        order_idx += 1
                else:
                    p_text = sec.get("text") or sec.get("title") or ""
                    if p_text and not is_distributor_watermark(p_text):
                        text_blocks.append(
                            TextBlock(
                                id=f"p{index}-gemini-p-{order_idx}",
                                type="paragraph",
                                text=p_text,
                                pageNumber=index,
                                boundingBox=BoundingBox(x=40, y=50 + order_idx * 20, width=width - 80, height=30),
                                extractionMethod="ocr",
                                confidence=0.98,
                                readingOrderIndex=order_idx,
                                warnings=["GEMINI_VISION"]
                            )
                        )
                        order_idx += 1

        if not text_blocks:
            text_blocks = native_text_blocks(page, index)

        images = extract_images(document, page, request, index, page_warnings)
        vector_images = extract_vector_diagrams(document, page, request, index, page_warnings)
        for v_img in vector_images:
            overlap = False
            for r_img in images:
                if (v_img.boundingBox.x < r_img.boundingBox.x + r_img.boundingBox.width and
                    v_img.boundingBox.x + v_img.boundingBox.width > r_img.boundingBox.x and
                    v_img.boundingBox.y < r_img.boundingBox.y + r_img.boundingBox.height and
                    v_img.boundingBox.y + v_img.boundingBox.height > r_img.boundingBox.y):
                    overlap = True
                    break
            if not overlap:
                images.append(v_img)

        pages.append(
            ExtractedPage(
                pageNumber=index,
                width=width,
                height=height,
                rotation=int(page.rotation),
                previewStorageKey=preview_key,
                textBlocks=text_blocks,
                images=images,
                tables=tables,
                warnings=sorted(set(page_warnings)),
                confidence=0.98 if parsed_data else page_confidence(text_blocks, page_warnings),
            )
        )

    return pages


def upload_page_preview(page: fitz.Page, storage_key: str) -> None:
    pix = page.get_pixmap(matrix=fitz.Matrix(PREVIEW_ZOOM, PREVIEW_ZOOM), alpha=False)
    image = Image.open(io.BytesIO(pix.tobytes("png")))
    output = io.BytesIO()
    image.thumbnail((1400, 1800))
    image.convert("RGB").save(output, format="JPEG", quality=82, optimize=True)
    upload_bytes(storage_key, output.getvalue(), "image/jpeg")


def native_text_blocks(page: fitz.Page, page_number: int) -> list[TextBlock]:
    data = page.get_text("dict")
    blocks: list[TextBlock] = []
    order = 0
    for raw_block in sorted(data.get("blocks", []), key=lambda item: (item.get("bbox", [0, 0, 0, 0])[1], item.get("bbox", [0, 0, 0, 0])[0])):
        lines = raw_block.get("lines", [])
        text_parts: list[str] = []
        font_size: float | None = None
        font_family: str | None = None
        for line in lines:
            for span in line.get("spans", []):
                value = span.get("text", "").strip()
                if value:
                    text_parts.append(value)
                    font_size = font_size or float(span.get("size", 0) or 0)
                    font_family = font_family or span.get("font")
        text = " ".join(text_parts).strip()
        if not text or is_distributor_watermark(text):
            continue
        bbox = raw_block.get("bbox", [0, 0, 0, 0])
        blocks.append(
            TextBlock(
                id=f"p{page_number}-text-{order}",
                type=classify_text(text, font_size),
                text=text,
                pageNumber=page_number,
                boundingBox=box_from_bbox(bbox),
                fontSize=font_size,
                fontFamily=font_family,
                extractionMethod="native",
                confidence=0.92,
                readingOrderIndex=order,
            )
        )
        order += 1
    return blocks


def ocr_text_blocks(page: fitz.Page, page_number: int, warnings: list[str]) -> list[TextBlock]:
    if pytesseract is None:
        warnings.append("OCR_UNAVAILABLE")
        return []
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    image = Image.open(io.BytesIO(pix.tobytes("png")))
    try:
        text = pytesseract.image_to_string(image, lang=OCR_LANGUAGES).strip()
    except Exception as exc:
        warnings.append("LOW_TEXT_CONFIDENCE")
        warnings.append(f"OCR_FAILED:{str(exc)[:80]}")
        return []
    if not text:
        return []
    warnings.append("OCR_USED")
    return [
        TextBlock(
            id=f"p{page_number}-ocr-0",
            type="text_block",
            text=text,
            pageNumber=page_number,
            boundingBox=BoundingBox(x=0, y=0, width=float(page.rect.width), height=float(page.rect.height)),
            extractionMethod="ocr",
            confidence=0.65,
            readingOrderIndex=0,
            warnings=["OCR_USED"],
        )
    ]


def extract_images(document: fitz.Document, page: fitz.Page, request: ExtractRequest, page_number: int, warnings: list[str]) -> list[ExtractedImage]:
    images: list[ExtractedImage] = []
    seen: set[int] = set()
    for image_index, info in enumerate(page.get_images(full=True)):
        xref = int(info[0])
        if xref in seen:
            continue
        seen.add(xref)
        extracted = document.extract_image(xref)
        width = int(extracted.get("width", 0))
        height = int(extracted.get("height", 0))
        if width < MIN_IMAGE_SIDE or height < MIN_IMAGE_SIDE:
            continue
        image_id = f"image-{xref}-{image_index}"
        storage_key = f"users/{request.ownerId}/projects/{request.projectId}/extracted/images/page-{page_number}/{image_id}.png"
        image = Image.open(io.BytesIO(extracted["image"]))
        output = io.BytesIO()
        image.convert("RGBA").save(output, format="PNG")
        upload_bytes(storage_key, output.getvalue(), "image/png")
        rects = page.get_image_rects(xref)
        rect = rects[0] if rects else fitz.Rect(0, 0, width, height)
        images.append(
            ExtractedImage(
                id=image_id,
                pageNumber=page_number,
                storageKey=storage_key,
                width=width,
                height=height,
                boundingBox=box_from_bbox([rect.x0, rect.y0, rect.x1, rect.y1]),
                mimeType="image/png",
                originalFormat=extracted.get("ext"),
                extractionMethod="pymupdf",
                confidence=0.85,
            )
        )
    return images


def extract_vector_diagrams(document: fitz.Document, page: fitz.Page, request: ExtractRequest, page_number: int, warnings: list[str]) -> list[ExtractedImage]:
    rects: list[fitz.Rect] = []
    drawings = page.get_drawings()
    if not drawings:
        return []
        
    for d in drawings:
        r = d.get("rect")
        if not r or r.is_empty:
            continue
        # Skip horizontal/vertical layout separator lines (e.g. headers/footers)
        if r.width > page.rect.width * 0.95 and r.height < 5:
            continue
        if r.height > page.rect.height * 0.95 and r.width < 5:
            continue
        if r.width < 10 and r.height < 10:
            continue
        rects.append(r)
        
    if not rects:
        return []
        
    # Group bounding boxes that are close (within 40 pt margin)
    clusters: list[fitz.Rect] = []
    for r in rects:
        merged = False
        for i, c in enumerate(clusters):
            dilated_c = fitz.Rect(c.x0 - 40, c.y0 - 40, c.x1 + 40, c.y1 + 40)
            if dilated_c.intersects(r):
                clusters[i] = c | r
                merged = True
                break
        if not merged:
            clusters.append(fitz.Rect(r))
            
    # Merge clusters that now overlap
    changed = True
    while changed:
        changed = False
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                dilated_i = fitz.Rect(clusters[i].x0 - 15, clusters[i].y0 - 15, clusters[i].x1 + 15, clusters[i].y1 + 15)
                if dilated_i.intersects(clusters[j]):
                    clusters[i] = clusters[i] | clusters[j]
                    clusters.pop(j)
                    changed = True
                    break
            if changed:
                break
                
    extracted_images: list[ExtractedImage] = []
    for idx, c in enumerate(clusters):
        if c.width < 50 or c.height < 50:
            continue
            
        c_bound = fitz.Rect(
            max(0, c.x0),
            max(0, c.y0),
            min(page.rect.width, c.x1),
            min(page.rect.height, c.y1)
        )
        if c_bound.is_empty:
            continue
            
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=c_bound, alpha=False)
        img_bytes = pix.tobytes("png")
        
        image_id = f"vector-diagram-p{page_number}-{idx}"
        storage_key = f"users/{request.ownerId}/projects/{request.projectId}/extracted/images/page-{page_number}/{image_id}.png"
        
        try:
            image = Image.open(io.BytesIO(img_bytes))
            output = io.BytesIO()
            image.convert("RGBA").save(output, format="PNG")
            upload_bytes(storage_key, output.getvalue(), "image/png")
            
            extracted_images.append(
                ExtractedImage(
                    id=image_id,
                    pageNumber=page_number,
                    storageKey=storage_key,
                    width=int(image.width),
                    height=int(image.height),
                    boundingBox=box_from_bbox([c_bound.x0, c_bound.y0, c_bound.x1, c_bound.y1]),
                    mimeType="image/png",
                    originalFormat="png",
                    extractionMethod="vector-drawings-crop",
                    confidence=0.90,
                )
            )
        except Exception as e:
            warnings.append(f"FAILED_VECTOR_CROP_{idx}:{str(e)[:40]}")
            
    return extracted_images


def extract_tables(pdf_path: Path, warnings: list[str]) -> dict[int, list[ExtractedTable]]:
    tables_by_page: dict[int, list[ExtractedTable]] = {}
    
    camelot_success = False
    try:
        import camelot
        import fitz
        
        doc = fitz.open(pdf_path)
        page_dims = {i + 1: (page.rect.width, page.rect.height) for i, page in enumerate(doc)}
        doc.close()
        
        tables = camelot.read_pdf(str(pdf_path), pages='all', flavor='lattice')
        
        if tables and len(tables) > 0:
            for table_index, table in enumerate(tables):
                page_index = table.page
                w, h = page_dims.get(page_index, (612, 792))
                
                x1, y1, x2, y2 = table.bbox
                box_x = x1
                box_y = h - y2
                box_w = max(x2 - x1, 0)
                box_h = max(y2 - y1, 0)
                
                rows = []
                for row in table.data:
                    cells = []
                    for cell in row:
                        text = (cell or "").strip()
                        cells.append(TableCell(text=text, rowSpan=1, colSpan=1))
                    if any(c.text for c in cells):
                        rows.append(cells)
                
                if len(rows) < 2 or max((len(row) for row in rows), default=0) < 2:
                    continue
                
                tables_by_page.setdefault(page_index, []).append(
                    ExtractedTable(
                        id=f"p{page_index}-table-{table_index}",
                        pageNumber=page_index,
                        boundingBox=BoundingBox(x=box_x, y=box_y, width=box_w, height=box_h),
                        rows=rows,
                        confidence=float(table.accuracy if hasattr(table, 'accuracy') else 0.8),
                        extractionMethod="camelot",
                        warnings=[],
                    )
                )
            camelot_success = True
    except Exception as exc:
        warnings.append(f"CAMELOT_EXTRACTION_FAILED:{str(exc)[:80]}")
    
    if not camelot_success or not tables_by_page:
        tables_by_page = {}
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_index, page in enumerate(pdf.pages, start=1):
                    for table_index, raw_table in enumerate(page.extract_tables() or []):
                        rows = [[TableCell(text=(cell or "").strip(), rowSpan=1, colSpan=1) for cell in row] for row in raw_table if any((cell or "").strip() for cell in row)]
                        if len(rows) < 2 or max((len(row) for row in rows), default=0) < 2:
                            continue
                        tables_by_page.setdefault(page_index, []).append(
                            ExtractedTable(
                                id=f"p{page_index}-table-{table_index}",
                                pageNumber=page_index,
                                boundingBox=BoundingBox(x=0, y=0, width=float(page.width), height=float(page.height)),
                                rows=rows,
                                confidence=0.7,
                                extractionMethod="pdfplumber",
                                warnings=[],
                            )
                        )
        except Exception as exc:
            warnings.append(f"TABLE_EXTRACTION_UNCERTAIN:{str(exc)[:80]}")
            
    return tables_by_page


def box_from_bbox(bbox: list[float] | tuple[float, float, float, float]) -> BoundingBox:
    x0, y0, x1, y1 = [float(value) for value in bbox]
    return BoundingBox(x=x0, y=y0, width=max(x1 - x0, 0), height=max(y1 - y0, 0))


def classify_text(text: str, font_size: float | None) -> Literal["heading", "paragraph", "list_item", "header", "footer", "text_block", "unknown_text_block"]:
    if text.startswith(("- ", "* ")):
        return "list_item"
    if font_size and font_size >= 15 and len(text) < 120:
        return "heading"
    if len(text) > 30:
        return "paragraph"
    return "text_block"


def meaningful_text_length(blocks: list[TextBlock]) -> int:
    return sum(len(block.text.strip()) for block in blocks)


def page_confidence(blocks: list[TextBlock], warnings: list[str]) -> float:
    if not blocks:
        return 0.2
    if "OCR_USED" in warnings:
        return 0.65
    return 0.9


@app.post("/convert-pdf-to-docx", response_model=ConvertResponse)
def convert_pdf_to_docx(request: ConvertRequest) -> ConvertResponse:
    job_id = uuid.uuid4().hex
    work_dir = Path(tempfile.gettempdir()) / "pdf-converter" / request.projectId / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = work_dir / "source.pdf"
    docx_path = work_dir / "converted.docx"
    
    try:
        download_object(request.source.storageKey, pdf_path)
        
        data = pdf_path.read_bytes()
        if not data.startswith(b"%PDF-"):
            return ConvertResponse(success=False, error="Downloaded file is not a valid PDF")
            
        from pdf2docx import Converter
        cv = Converter(str(pdf_path))
        cv.convert(str(docx_path), start=0, end=None)
        cv.close()
        
        if not docx_path.exists() or docx_path.stat().st_size == 0:
            return ConvertResponse(success=False, error="DOCX file was not generated or is empty")
            
        docx_bytes = docx_path.read_bytes()
        dest_storage_key = f"users/{request.ownerId}/projects/{request.projectId}/editable/{request.projectId}.docx"
        
        upload_bytes(
            dest_storage_key, 
            docx_bytes, 
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        
        return ConvertResponse(
            success=True,
            storageKey=dest_storage_key,
            fileSize=len(docx_bytes)
        )
    except Exception as exc:
        return ConvertResponse(success=False, error=str(exc))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/convert-docx-to-pdf", response_model=ExportResponse)
def convert_docx_to_pdf(request: ExportRequest) -> ExportResponse:
    job_id = uuid.uuid4().hex
    work_dir = Path(tempfile.gettempdir()) / "pdf-exporter" / request.projectId / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    docx_path = work_dir / "source.docx"
    pdf_path = work_dir / "source.pdf"
    
    try:
        download_object(request.docxStorageKey, docx_path)
        
        import subprocess
        soffice_cmd = "soffice"
        if os.name == "nt":
            soffice_cmd = "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
            if not os.path.exists(soffice_cmd):
                soffice_cmd = "soffice"
                
        cmd = [
            soffice_cmd,
            "--headless",
            "--convert-to", "pdf",
            str(docx_path),
            "--outdir", str(work_dir)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            return ExportResponse(success=False, error=f"LibreOffice failed: {result.stderr or result.stdout}")
            
        if not pdf_path.exists():
            return ExportResponse(success=False, error="PDF file was not generated by LibreOffice")
            
        pdf_bytes = pdf_path.read_bytes()
        dest_storage_key = f"users/{request.ownerId}/projects/{request.projectId}/exports/{uuid.uuid4().hex}.pdf"
        
        upload_bytes(
            dest_storage_key,
            pdf_bytes,
            "application/pdf"
        )
        
        return ExportResponse(
            success=True,
            pdfStorageKey=dest_storage_key,
            fileSize=len(pdf_bytes)
        )
    except Exception as exc:
        return ExportResponse(success=False, error=str(exc))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/rebrand-docx", response_model=RebrandResponse)
def rebrand_docx_endpoint(request: RebrandRequest) -> RebrandResponse:
    job_id = uuid.uuid4().hex
    work_dir = Path(tempfile.gettempdir()) / "pdf-rebrander" / request.projectId / job_id
    work_dir.mkdir(parents=True, exist_ok=True)
    docx_path = work_dir / "source.docx"
    rebranded_docx_path = work_dir / "rebranded.docx"
    logo_path = work_dir / "new_logo.png"
    
    try:
        # Download source DOCX from S3
        download_object(request.docxStorageKey, docx_path)
        
        # Download Logo from S3 if specified
        has_new_logo = False
        if request.branding.logoStorageKey:
            try:
                download_object(request.branding.logoStorageKey, logo_path)
                has_new_logo = True
            except Exception as logo_err:
                print(f"[rebrand] Failed to download logo from S3: {logo_err}")
                
        # Unzip docx package
        extract_dir = work_dir / "extracted"
        extract_dir.mkdir()
        
        import zipfile
        with zipfile.ZipFile(docx_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            
        # 1. Swap media assets (logo) inside word/media/
        media_dir = extract_dir / "word" / "media"
        if has_new_logo and media_dir.exists():
            # In our templates, logo is image1.png
            target_image = media_dir / "image1.png"
            if target_image.exists():
                shutil.copy2(logo_path, target_image)
                print(f"[rebrand] Replaced logo image at {target_image}")
                
        # 2. String replacements in XML nodes for document, header, and footer files
        xml_files = [
            extract_dir / "word" / "document.xml",
            extract_dir / "word" / "header1.xml",
            extract_dir / "word" / "footer1.xml",
        ]
        
        replacements = {}
        if request.branding.companyName:
            replacements["Old Semiconductor Inc."] = request.branding.companyName
            replacements["Old Semiconductor"] = request.branding.companyName
            replacements["Vellore Semicon"] = request.branding.companyName
            
        if request.branding.productCode:
            replacements["OS29150"] = request.branding.productCode
            replacements["VS29150"] = request.branding.productCode

        if request.branding.productTitle:
            replacements["1.5A Low Dropout Positive Voltage Regulator"] = request.branding.productTitle
            
        import re
        for xml_file in xml_files:
            if not xml_file.exists():
                continue
            content = xml_file.read_text(encoding='utf-8')
            original_content = content
            for search_term, replace_term in replacements.items():
                if search_term and replace_term:
                    content = re.sub(re.escape(search_term), replace_term, content)
            
            # Apply theme color overrides if colors are specified
            if request.branding.primaryColor:
                primary_hex = request.branding.primaryColor.lstrip("#").upper()
                content = content.replace("800000", primary_hex)
                
            if request.branding.accentColor:
                accent_hex = request.branding.accentColor.lstrip("#").upper()
                content = content.replace("D6533E", accent_hex)
                
            if content != original_content:
                xml_file.write_text(content, encoding='utf-8')
                
        # 3. Zip package back to branded DOCX
        with zipfile.ZipFile(rebranded_docx_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for root, dirs, files in os.walk(extract_dir):
                for file in files:
                    full_path = Path(root) / file
                    rel_path = full_path.relative_to(extract_dir)
                    zip_out.write(full_path, rel_path)
                    
        # Upload rebranded DOCX back to S3, replacing the old file
        rebranded_bytes = rebranded_docx_path.read_bytes()
        upload_bytes(
            request.docxStorageKey,
            rebranded_bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        
        return RebrandResponse(
            success=True,
            storageKey=request.docxStorageKey,
            fileSize=len(rebranded_bytes)
        )
    except Exception as exc:
        return RebrandResponse(success=False, error=str(exc))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


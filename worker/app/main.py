from __future__ import annotations

import hashlib
import io
import os
import shutil
import tempfile
import time
import uuid
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
        if not text:
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


def extract_tables(pdf_path: Path, warnings: list[str]) -> dict[int, list[ExtractedTable]]:
    tables_by_page: dict[int, list[ExtractedTable]] = {}
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

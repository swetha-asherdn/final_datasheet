from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import (
    BoundingBox,
    ExtractedPage,
    ExtractionManifest,
    Processing,
    SourceFile,
    Summary,
    TextBlock,
    app,
    format_utc_iso,
    meaningful_text_length,
)


def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_manifest_serialization():
    manifest = ExtractionManifest(
        projectId="project1",
        sourceFile=SourceFile(storageKey="users/u/projects/p/original/file.pdf", originalFileName="file.pdf", checksum=None),
        pageCount=1,
        processing=Processing(
            startedAt="2026-07-07T10:00:00.000Z",
            completedAt="2026-07-07T10:00:01.000Z",
            durationMs=1000,
            nativeTextDetected=True,
            ocrUsed=False,
        ),
        summary=Summary(textBlockCount=1, imageCount=0, tableCount=0, warningCount=0),
        pages=[
            ExtractedPage(
                pageNumber=1,
                width=612,
                height=792,
                rotation=0,
                previewStorageKey="users/u/projects/p/previews/page-1.jpg",
                textBlocks=[
                    TextBlock(
                        id="p1-text-0",
                        type="paragraph",
                        text="Native text",
                        pageNumber=1,
                        boundingBox=BoundingBox(x=10, y=20, width=100, height=20),
                        extractionMethod="native",
                        confidence=0.92,
                        readingOrderIndex=0,
                    )
                ],
                images=[],
                tables=[],
                warnings=[],
                confidence=0.9,
            )
        ],
    )
    payload = manifest.model_dump()
    assert payload["schemaVersion"] == "1.0"
    assert payload["summary"]["textBlockCount"] == 1


def test_meaningful_text_detects_native_text():
    blocks = [
        TextBlock(
            id="p1-text-0",
            type="paragraph",
            text="This is a native text PDF page with enough characters.",
            pageNumber=1,
            boundingBox=BoundingBox(x=0, y=0, width=100, height=20),
            extractionMethod="native",
            confidence=0.9,
            readingOrderIndex=0,
        )
    ]
    assert meaningful_text_length(blocks) > 25


def test_image_only_fallback_can_be_marked_without_ocr_result():
    assert meaningful_text_length([]) == 0


def test_format_utc_iso_normalizes_timezone_aware_datetimes():
    value = datetime(2026, 7, 8, 14, 30, 12, 345000, tzinfo=timezone.utc)
    assert format_utc_iso(value) == "2026-07-08T14:30:12.345Z"


def test_manifest_accepts_image_and_table_sections_empty_for_mocked_adapters():
    page = ExtractedPage(
        pageNumber=1,
        width=612,
        height=792,
        rotation=0,
        previewStorageKey="users/u/projects/p/previews/page-1.jpg",
        textBlocks=[],
        images=[],
        tables=[],
        warnings=["IMAGE_ONLY_PAGE", "LOW_TEXT_CONFIDENCE"],
        confidence=0.2,
    )
    assert page.warnings == ["IMAGE_ONLY_PAGE", "LOW_TEXT_CONFIDENCE"]

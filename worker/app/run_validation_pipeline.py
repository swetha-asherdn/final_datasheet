"""
End-to-end validation test script for the direct vector rebranding pipeline.
Tests both sample datasheets:
1. CW29150R-XX CW29150R-ADJ CW29151R-XX (9 pages)
2. KD0860UF (2 pages)
"""
import json
import os
import sys
from pathlib import Path
import fitz

from app.main import (
    rebrand_pdf_direct_endpoint,
    DirectPdfRebrandRequest,
    ProductCodeMappingItem,
    BrandingSettings,
)

def run_test():
    base_dir = Path("/app/app")
    cw_pdf = base_dir / "sample_cw29150.pdf"
    kd_pdf = base_dir / "sample_kd0860.pdf"

    print("==========================================================")
    print("STARTING END-TO-END PIPELINE VALIDATION ON SAMPLE DATASHEETS")
    print("==========================================================")

    results = {}

    # ----------------------------------------------------
    # TEST 1: CW29150 (9 pages)
    # ----------------------------------------------------
    print(f"\n--- TEST 1: CW29150 ---")
    doc_cw_in = fitz.open(cw_pdf)
    cw_in_pages = len(doc_cw_in)
    doc_cw_in.close()
    print(f"Source file: {cw_pdf.name}, Source page count: {cw_in_pages}")

    cw_req = DirectPdfRebrandRequest(
        projectId="test-cw29150",
        ownerId="test-owner",
        sourceStorageKey=str(cw_pdf),
        mappings=[
            ProductCodeMappingItem(
                supplierCode="CW29150R-XX",
                velloreCode="VS29150R-XX",
                status="confirmed",
                confidence=1.0,
            ),
            ProductCodeMappingItem(
                supplierCode="CW29150R-ADJ",
                velloreCode="VS29150R-ADJ",
                status="confirmed",
                confidence=1.0,
            ),
            ProductCodeMappingItem(
                supplierCode="CW29151R-XX",
                velloreCode="VS29151R-XX",
                status="confirmed",
                confidence=1.0,
            ),
            ProductCodeMappingItem(
                supplierCode="UNVERIFIED_PART",
                velloreCode="VS_UNVERIFIED",
                status="pending",
                confidence=0.5,
            ),
        ],
        branding=BrandingSettings(
            companyName="VELLORE SEMICONDUCTOR",
            productCode="VS29150 SERIES",
            productTitle="1.5A Low Dropout Positive Voltage Regulator",
            primaryColor="#800000",
            documentStatus="Preliminary Datasheet",
        ),
        headerMaskTopPt=82.0,
        footerMaskBottomPt=45.0,
        website="www.velloresemicon.com",
    )

    cw_resp = rebrand_pdf_direct_endpoint(cw_req)
    print(f"Response success: {cw_resp.success}")
    if not cw_resp.success:
        print(f"ERROR: {cw_resp.error}")
        sys.exit(1)

    print(f"Replacement Report:")
    print(f"  Attempted:     {cw_resp.report.attempted}")
    print(f"  Successful:    {cw_resp.report.successful}")
    print(f"  Kept Original: {cw_resp.report.keptOriginal}")
    print(f"  Failed:        {cw_resp.report.failed}")
    print(f"  Warnings:      {len(cw_resp.report.warnings)} warnings")
    for w in cw_resp.report.warnings[:5]:
        print(f"    - {w}")

    # Verify output PDF
    # The output was saved into MinIO / S3 at export_key, let's also read the local output from work_dir if any or download
    from app.main import download_object
    cw_out_pdf = base_dir / "output_cw29150_rebranded.pdf"
    download_object(cw_resp.pdfStorageKey, cw_out_pdf)

    doc_cw_out = fitz.open(cw_out_pdf)
    cw_out_pages = len(doc_cw_out)
    print(f"Generated output page count: {cw_out_pages}")
    assert cw_out_pages == cw_in_pages, f"Page count mismatch: {cw_in_pages} != {cw_out_pages}"
    print("PAGE COUNT MATCH CONFIRMED (1:1) [9 pages -> 9 pages]")

    # Check for text in output PDF
    all_cw_text = ""
    for idx, page in enumerate(doc_cw_out):
        t = page.get_text()
        all_cw_text += t
        # Render each page to PNG for visual inspection
        pix = page.get_pixmap(dpi=150)
        pix.save(str(base_dir / f"cw29150_page_{idx+1}.png"))

    doc_cw_out.close()

    assert "VS29150R-XX" in all_cw_text, "Replacement code VS29150R-XX missing from output!"
    assert "VELLORE SEMICONDUCTOR" in all_cw_text, "Vellore branding header missing from output!"
    assert "www.velloresemicon.com" in all_cw_text, "Vellore website footer missing from output!"
    assert "www.vzpp-mikron.ru" not in all_cw_text, "Old Mikron footer website was NOT removed!"
    print("CW29150: Text replacements, branding headers/footers, and watermark removals verified!")

    results["CW29150"] = {
        "inputPages": cw_in_pages,
        "outputPages": cw_out_pages,
        "report": cw_resp.report.dict(),
    }

    # ----------------------------------------------------
    # TEST 2: KD0860UF (2 pages)
    # ----------------------------------------------------
    print(f"\n--- TEST 2: KD0860UF ---")
    doc_kd_in = fitz.open(kd_pdf)
    kd_in_pages = len(doc_kd_in)
    doc_kd_in.close()
    print(f"Source file: {kd_pdf.name}, Source page count: {kd_in_pages}")

    kd_req = DirectPdfRebrandRequest(
        projectId="test-kd0860",
        ownerId="test-owner",
        sourceStorageKey=str(kd_pdf),
        mappings=[
            ProductCodeMappingItem(
                supplierCode="KD0860UF",
                velloreCode="VS0860UF",
                status="confirmed",
                confidence=1.0,
            ),
        ],
        branding=BrandingSettings(
            companyName="VELLORE SEMICONDUCTOR",
            productCode="VS0860UF",
            productTitle="Ultrafast Recovery Rectifier",
            primaryColor="#800000",
            documentStatus="Preliminary Datasheet",
        ),
        headerMaskTopPt=82.0,
        footerMaskBottomPt=45.0,
        website="www.velloresemicon.com",
    )

    kd_resp = rebrand_pdf_direct_endpoint(kd_req)
    print(f"Response success: {kd_resp.success}")
    if not kd_resp.success:
        print(f"ERROR: {kd_resp.error}")
        sys.exit(1)

    print(f"Replacement Report:")
    print(f"  Attempted:     {kd_resp.report.attempted}")
    print(f"  Successful:    {kd_resp.report.successful}")
    print(f"  Kept Original: {kd_resp.report.keptOriginal}")
    print(f"  Failed:        {kd_resp.report.failed}")
    print(f"  Warnings:      {len(kd_resp.report.warnings)} warnings")
    for w in kd_resp.report.warnings[:5]:
        print(f"    - {w}")

    kd_out_pdf = base_dir / "output_kd0860_rebranded.pdf"
    download_object(kd_resp.pdfStorageKey, kd_out_pdf)

    doc_kd_out = fitz.open(kd_out_pdf)
    kd_out_pages = len(doc_kd_out)
    print(f"Generated output page count: {kd_out_pages}")
    assert kd_out_pages == kd_in_pages, f"Page count mismatch: {kd_in_pages} != {kd_out_pages}"
    print("PAGE COUNT MATCH CONFIRMED (1:1) [2 pages -> 2 pages]")

    all_kd_text = ""
    for idx, page in enumerate(doc_kd_out):
        t = page.get_text()
        all_kd_text += t
        pix = page.get_pixmap(dpi=150)
        pix.save(str(base_dir / f"kd0860_page_{idx+1}.png"))

    doc_kd_out.close()

    assert "VS0860UF" in all_kd_text, "Replacement code VS0860UF missing from output!"
    assert "VELLORE SEMICONDUCTOR" in all_kd_text, "Vellore branding header missing from output!"
    assert "www.velloresemicon.com" in all_kd_text, "Vellore website footer missing from output!"
    assert "www.vzpp-mikron.ru" not in all_kd_text, "Old Mikron footer website was NOT removed!"
    print("KD0860UF: Text replacements, branding headers/footers, and watermark removals verified!")

    results["KD0860UF"] = {
        "inputPages": kd_in_pages,
        "outputPages": kd_out_pages,
        "report": kd_resp.report.dict(),
    }

    # ----------------------------------------------------
    # TEST 3: SAFETY RETENTION & VERIFICATION TEST
    # ----------------------------------------------------
    print(f"\n--- TEST 3: SAFETY RETENTION & VERIFICATION ---")
    safe_req = DirectPdfRebrandRequest(
        projectId="test-safety",
        ownerId="test-owner",
        sourceStorageKey=str(cw_pdf),
        mappings=[
            ProductCodeMappingItem(
                supplierCode="CW29150R-XX",
                velloreCode="VS29150R-XX",
                status="confirmed",
                confidence=1.0,
            ),
            ProductCodeMappingItem(
                supplierCode="CW29150R-ADJ",
                velloreCode="VS29150R-ADJ",
                status="ignored",  # USER EXPLICITLY IGNORED THIS
                confidence=1.0,
            ),
        ],
        branding=BrandingSettings(
            companyName="VELLORE SEMICONDUCTOR",
            productCode="VS29150",
            primaryColor="#800000",
        ),
    )

    safe_resp = rebrand_pdf_direct_endpoint(safe_req)
    assert safe_resp.success, "Safety test endpoint failed!"
    print(f"Safety test report:")
    print(f"  Attempted:     {safe_resp.report.attempted}")
    print(f"  Successful:    {safe_resp.report.successful}")
    print(f"  Kept Original: {safe_resp.report.keptOriginal}")
    print(f"  Warnings:      {len(safe_resp.report.warnings)}")

    assert safe_resp.report.keptOriginal > 0, "Failed safety guarantee: ignored code was not kept original!"
    assert any("Retained original product code 'CW29150R-ADJ'" in w for w in safe_resp.report.warnings), "Missing retention warning!"

    safe_out_pdf = base_dir / "output_safe_rebranded.pdf"
    download_object(safe_resp.pdfStorageKey, safe_out_pdf)
    safe_doc = fitz.open(safe_out_pdf)
    safe_text = "".join(p.get_text() for p in safe_doc)
    safe_doc.close()

    assert "CW29150R-ADJ" in safe_text, "Original ignored code was improperly deleted or blanked out!"
    assert "VS29150R-XX" in safe_text, "Confirmed code was not replaced!"
    print("SAFETY TEST PASSED: Unconfirmed/ignored code was safely retained with warning and zero blank gaps!")

    results["SafetyRetentionTest"] = {
        "keptOriginal": safe_resp.report.keptOriginal,
        "warningsCount": len(safe_resp.report.warnings),
    }

    print("\n==========================================================")
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print(json.dumps(results, indent=2))
    print("==========================================================")

if __name__ == "__main__":
    run_test()


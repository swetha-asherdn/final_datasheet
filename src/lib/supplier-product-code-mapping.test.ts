import { describe, expect, it } from "vitest";
import { applySupplierProductCodeMappings, detectSupplierProductCodes } from "@/lib/supplier-product-code-mapping";

describe("supplier product code mapping", () => {
  it("detects likely supplier codes from extracted datasheet text", () => {
    const results = detectSupplierProductCodes([
      { pageNumber: 1, text: "ACME PART NUMBER AP1234A-01 is shown on the first page." },
      { pageNumber: 2, text: "Ordering code: XYZ-4567-ADJ / VIN=12V." },
      { pageNumber: 3, text: "Vellore Semicon product code: VS12345" },
    ]);

    expect(results.some((item) => item.supplierCode === "AP1234A-01")).toBe(true);
    expect(results.some((item) => item.supplierCode === "XYZ-4567-ADJ")).toBe(true);
    expect(results.some((item) => item.supplierCode === "VS12345")).toBe(false);
  });

  it("replaces only exact supplier code matches and preserves ambiguous input", () => {
    const mappings = [
      { id: "m1", supplierCode: "AP1234A-01", velloreCode: "VS-AP1234A-01", pageNumber: 1, section: "front page", confidence: 0.9, status: "pending" as const },
      { id: "m2", supplierCode: "VIN", velloreCode: "VCC", pageNumber: 1, section: "spec table", confidence: 0.3, status: "pending" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "AP1234A-01 is used, and VIN=12V while VOUT=5V.",
      mappings,
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("VS-AP1234A-01 is used, and VIN=12V while VOUT=5V.");
    expect(result.warnings.some((warning) => warning.includes("unsafe") || warning.includes("ambiguous"))).toBe(true);
  });
});

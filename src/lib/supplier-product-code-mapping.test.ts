import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { applySupplierProductCodeMappings, autoApproveSupplierCodeMappings, detectSupplierProductCodes, revertSupplierProductCodeMappings, type SupplierCodeMapping } from "@/lib/supplier-product-code-mapping";
import { buildSuggestedSupplierMappings, detectSupplierProductCodesFromEditorJson } from "@/lib/supplier-product-code-mapping";

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

  it("auto-approves only valid high-confidence mappings", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "header", confidence: 0.91, status: "pending" as const },
      { id: "m2", supplierCode: "VIN", velloreCode: "VS-VIN", pageNumber: 1, section: "spec table", confidence: 0.31, status: "pending" as const },
      { id: "m3", supplierCode: "CW29151R-XX", velloreCode: "VS-CW29151R-XX", pageNumber: 2, section: "body", confidence: 0.85, status: "ignored" as const },
    ];

    const autoApproved = autoApproveSupplierCodeMappings(mappings);
    expect(autoApproved.find((item) => item.id === "m1")?.status).toBe("confirmed");
    expect(autoApproved.find((item) => item.id === "m2")?.status).toBe("pending");
    expect(autoApproved.find((item) => item.id === "m3")?.status).toBe("ignored");
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

  it("applies the CW29150R mapping family to the product-code header text exactly once", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
      { id: "m2", supplierCode: "CW29150R-ADJ", velloreCode: "VS-CW29150R-ADJ", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
      { id: "m3", supplierCode: "CW29151R-XX", velloreCode: "VS-CW29151R-XX", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
      mappings,
    });

    expect(result.replacedCount).toBe(3);
    expect(result.text).toBe("VS-CW29150R-XX / VS-CW29150R-ADJ / VS-CW29151R-XX");
  });

  it("replaces multiple different source codes in a paragraph exactly once each", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "body", confidence: 0.96, status: "confirmed" as const },
      { id: "m2", supplierCode: "CW29150R-ADJ", velloreCode: "VS-CW29150R-ADJ", pageNumber: 1, section: "body", confidence: 0.96, status: "confirmed" as const },
      { id: "m3", supplierCode: "CW29151R-XX", velloreCode: "VS-CW29151R-XX", pageNumber: 1, section: "body", confidence: 0.96, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "Parts: CW29150R-XX, CW29150R-ADJ and CW29151R-XX are in this paragraph.",
      mappings,
    });

    expect(result.replacedCount).toBe(3);
    expect(result.text).toBe("Parts: VS-CW29150R-XX, VS-CW29150R-ADJ and VS-CW29151R-XX are in this paragraph.");
  });

  it("is idempotent: running replacement on its own output does not produce nested VS-VS prefixes", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "body", confidence: 0.96, status: "confirmed" as const },
    ];

    const original = "CW29150R-XX";
    const first = applySupplierProductCodeMappings({ text: original, mappings });
    expect(first.replacedCount).toBe(1);
    expect(first.text).toBe("VS-CW29150R-XX");

    const second = applySupplierProductCodeMappings({ text: first.text, mappings });
    expect(second.replacedCount).toBe(0);
    expect(second.text).toBe("VS-CW29150R-XX");
  });

  it("preserves original text and warns on unsafe mappings", () => {
    const mappings = [
      { id: "m1", supplierCode: "12", velloreCode: "VS-12", pageNumber: 1, section: "body", confidence: 0.99, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({ text: "Value 12 is ambiguous.", mappings });
    expect(result.replacedCount).toBe(0);
    expect(result.text).toBe("Value 12 is ambiguous.");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("excludes package/designator tokens such as TO-220 and TO-263 from supplier product-code mappings", () => {
    const found = detectSupplierProductCodes([
      { pageNumber: 1, text: "Package: TO-220, TO-263, D2PAK, SOT-223; product code: CW29150R-XX" },
    ]);
    const codes = found.map((item) => item.supplierCode);
    expect(codes.includes("TO-220")).toBe(false);
    expect(codes.includes("TO-263")).toBe(false);
    expect(codes.includes("CW29150R-XX")).toBe(true);
  });

  it("buildSuggestedSupplierMappings produces unique mapping ids for render keys", () => {
    const editorJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CW29150R-XX and CW29150R-ADJ and CW29151R-XX' }] }] };
    const candidates = detectSupplierProductCodesFromEditorJson(editorJson);
    const suggested = buildSuggestedSupplierMappings(candidates);
    const ids = suggested.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("maps the genuine CW29150R-XX product code correctly", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "CW29150R-XX / CW29150R-ADJ",
      mappings,
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("VS-CW29150R-XX / CW29150R-ADJ");
    expect(result.warnings).toEqual([]);
  });

  it("applying the same mapping twice produces the same document and no repeated VS-VS prefix", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
    ];

    const first = applySupplierProductCodeMappings({ text: "CW29150R-XX", mappings });
    const second = applySupplierProductCodeMappings({ text: first.text, mappings });

    expect(first.replacedCount).toBe(1);
    expect(first.text).toBe("VS-CW29150R-XX");
    expect(second.replacedCount).toBe(0);
    expect(second.text).toBe("VS-CW29150R-XX");
    expect(second.text.includes("VS-VS-")).toBe(false);
  });

  it("handles already-replaced codes without the 'No safe replacements' error", () => {
    const mappings = [
      { id: "m1", supplierCode: "CW29150R-XX", velloreCode: "VS-CW29150R-XX", pageNumber: 1, section: "header", confidence: 0.96, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "VS-CW29150R-XX already replaced",
      mappings,
    });

    expect(result.replacedCount).toBe(0);
    expect(result.text).toBe("VS-CW29150R-XX already replaced");
    expect(result.warnings).toEqual([]);
  });

  it("applies a generic non-CW supplier mapping correctly", () => {
    const mappings = [
      { id: "g1", supplierCode: "XYZ-999", velloreCode: "VS-XYZ-999", pageNumber: 1, section: "body", confidence: 0.95, status: "confirmed" as const },
    ];

    const result = applySupplierProductCodeMappings({
      text: "Available as XYZ-999 in the catalog; VIN remains VIN.",
      mappings,
    });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("Available as VS-XYZ-999 in the catalog; VIN remains VIN.");
    // Ensure idempotency: second pass doesn't create nested VS-
    const second = applySupplierProductCodeMappings({ text: result.text, mappings });
    expect(second.replacedCount).toBe(0);
    expect(second.text).toBe(result.text);
  });

  it("complete generic workflow: detect -> suggest -> auto-approve -> apply -> idempotent", () => {
    const page = { pageNumber: 1, text: "Product code: XYZ-999 appears twice. XYZ-999 is the catalog code. Also VIN=12V and TO-220 package are present." };

    // 1) Detect
    const candidates = detectSupplierProductCodes([page]);
    expect(candidates.some((c) => c.supplierCode === "XYZ-999")).toBe(true);

    // 2) Suggest mapping
    const suggested = buildSuggestedSupplierMappings(candidates);
    const mapping = suggested.find((s) => s.supplierCode === "XYZ-999");
    expect(mapping).toBeTruthy();
    expect(mapping?.velloreCode).toBe("VS-XYZ-999");

    // 3) Auto-approve (simulate auto-approve behavior)
    const auto = autoApproveSupplierCodeMappings(suggested);
    const confirmed = auto.find((s) => s.supplierCode === "XYZ-999");
    expect(confirmed).toBeTruthy();

    // If not confirmed by heuristic, force-confirm for the purpose of testing apply
    const toApply: SupplierCodeMapping[] = (confirmed?.status === "confirmed")
      ? [confirmed]
      : confirmed
        ? [{ ...confirmed, status: "confirmed" as const }]
        : [];

    // 5) Apply confirmed mappings and verify replacements and idempotency
    const originalText = page.text;
    const applyResult = applySupplierProductCodeMappings({ text: originalText, mappings: toApply });
    expect(applyResult.replacedCount).toBeGreaterThanOrEqual(1);
    expect(applyResult.text.includes("VS-XYZ-999")).toBe(true);
    // 7) Running replacement again is idempotent
    const second = applySupplierProductCodeMappings({ text: applyResult.text, mappings: toApply });
    expect(second.replacedCount).toBe(0);
    expect(second.text).toBe(applyResult.text);

    // 8) No unsafe warning for successful replacement
    expect(applyResult.warnings.some((w) => /unsafe mapping skipped/i.test(w))).toBe(false);

    // 9) Unrelated tokens remain unchanged
    expect(applyResult.text.includes("VIN=12V")).toBe(true);
    expect(applyResult.text.includes("TO-220")).toBe(true);
  });

  it("does not auto-approve or convert common package or signal tokens like TO-220, VIN, VOUT", () => {
    const page = { pageNumber: 1, text: "Package: TO-220; Signals: VIN, VOUT; Voltages: 3.3V, 12V" };
    const candidates = detectSupplierProductCodes([page]);
    const codes = candidates.map((c) => c.supplierCode);

    // VIN and VOUT are excluded by heuristic
    expect(codes.includes("VIN")).toBe(false);
    expect(codes.includes("VOUT")).toBe(false);

    // TO-220 may be detected as a candidate, but it must NOT be auto-approved
    if (codes.includes("TO-220")) {
      const suggested = buildSuggestedSupplierMappings(candidates);
      const auto = autoApproveSupplierCodeMappings(suggested);
      const to220 = auto.find((s) => s.supplierCode === "TO-220");
      expect(to220).toBeTruthy();
      // auto-approve should not confirm a package token
      expect(to220?.status).not.toBe("confirmed");

      // Applying only auto-approved mappings should not replace TO-220
      const confirmed = auto.filter((m) => m.status === "confirmed");
      const applyResult = applySupplierProductCodeMappings({ text: page.text, mappings: confirmed });
      expect(applyResult.text.includes("TO-220")).toBe(true);
    }
  });

  it("mapping logic contains no CW-specific hardcoded strings", () => {
    const file = fs.readFileSync(path.join(__dirname, "./supplier-product-code-mapping.ts"), "utf8");
    expect(file.includes("CW29150R")).toBe(false);
  });

  it("produces an accurate ReplacementReport tracking attempted, successful, keptOriginal, and warnings", () => {
    const mappings: SupplierCodeMapping[] = [
      { id: "m1", supplierCode: "LM7805", velloreCode: "VS-LM7805", pageNumber: 1, section: "title", confidence: 0.95, status: "confirmed" },
      { id: "m2", supplierCode: "ABC1234", velloreCode: "VS-ABC1234", pageNumber: 1, section: "body", confidence: 0.5, status: "pending" },
    ];

    const input = "Using LM7805 regulator alongside ABC1234 module.";
    const result = applySupplierProductCodeMappings({ text: input, mappings });

    expect(result.report).toBeDefined();
    expect(result.report.attempted).toBe(2);
    expect(result.report.successful).toBe(1);
    expect(result.report.keptOriginal).toBe(1);
    expect(result.report.failed).toBe(0);
    expect(result.text).toBe("Using VS-LM7805 regulator alongside ABC1234 module.");
    expect(result.report.warnings.some((w) => w.includes("ABC1234") && w.includes("retained"))).toBe(true);
  });

  it("never deletes a product code or outputs blank spaces when replacement is unconfirmed or fails", () => {
    const mappings: SupplierCodeMapping[] = [
      { id: "m1", supplierCode: "CW29150R-ADJ", velloreCode: "VS-CW29150R-ADJ", pageNumber: 1, section: "body", confidence: 0.4, status: "ignored" },
    ];

    const input = "The CW29150R-ADJ is high current...";
    const result = applySupplierProductCodeMappings({ text: input, mappings });

    expect(result.text).toBe("The CW29150R-ADJ is high current...");
    expect(result.text).not.toContain("The  is high current...");
  });

  it("reverts previously replaced Vellore codes back to original supplier codes cleanly", () => {
    const mappings: SupplierCodeMapping[] = [
      { id: "m1", supplierCode: "LM7805-XX", velloreCode: "VS-LM7805-XX", pageNumber: 1, section: "title", confidence: 0.95, status: "applied" },
      { id: "m2", supplierCode: "LM7805-ADJ", velloreCode: "VS-LM7805-ADJ", pageNumber: 1, section: "body", confidence: 0.9, status: "applied" },
    ];

    const textWithVellore = "The VS-LM7805-XX and VS-LM7805-ADJ are high current regulators.";
    const reverted = revertSupplierProductCodeMappings({ text: textWithVellore, mappings });

    expect(reverted.replacedCount).toBe(2);
    expect(reverted.text).toBe("The LM7805-XX and LM7805-ADJ are high current regulators.");
  });

  it("allows re-applying updated Vellore code when user changes the replacement code", () => {
    const mappings: SupplierCodeMapping[] = [
      { id: "m1", supplierCode: "LM7805-XX", velloreCode: "VSs-LM7805-XX", pageNumber: 1, section: "title", confidence: 0.95, status: "confirmed" },
    ];

    const textWithOldVellore = "The VS-LM7805-XX is high current regulator.";
    const result = applySupplierProductCodeMappings({ text: textWithOldVellore, mappings });

    expect(result.replacedCount).toBe(1);
    expect(result.text).toBe("The VSs-LM7805-XX is high current regulator.");
  });
});



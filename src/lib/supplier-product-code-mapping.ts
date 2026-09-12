import { replaceProductCodeTokens } from "@/lib/product-code-replacement";

export type SupplierCodeMappingStatus = "pending" | "confirmed" | "ignored";

export type SupplierCodeMapping = {
  id: string;
  supplierCode: string;
  velloreCode: string;
  pageNumber: number;
  section: string;
  confidence: number;
  status: SupplierCodeMappingStatus;
};

export type SupplierCodeCandidate = {
  supplierCode: string;
  pageNumber: number;
  section: string;
  confidence: number;
  source: string;
};

export type SupplierCodeReplacementResult = {
  text: string;
  replacedCount: number;
  warnings: string[];
  appliedMappings: SupplierCodeMapping[];
};

export function buildSuggestedSupplierMappings(candidates: SupplierCodeCandidate[], defaultVellorePrefix = "VS"): SupplierCodeMapping[] {
  return candidates.map((candidate, index) => ({
    id: `${candidate.pageNumber}-${candidate.supplierCode}-${index}`,
    supplierCode: candidate.supplierCode,
    velloreCode: `${defaultVellorePrefix}-${candidate.supplierCode}`,
    pageNumber: candidate.pageNumber,
    section: candidate.section,
    confidence: candidate.confidence,
    status: candidate.confidence >= 0.8 ? "pending" : "pending",
  }));
}

export function detectSupplierProductCodes(pageTexts: Array<{ pageNumber: number; text: string }>): SupplierCodeCandidate[] {
  const candidates: SupplierCodeCandidate[] = [];

  for (const page of pageTexts) {
    const matches = Array.from(page.text.matchAll(/(?<![A-Z0-9])(?:[A-Z]{1,8}-?[0-9][A-Z0-9-]{2,})(?![A-Z0-9])/g)).map((match) => match[0]);
    const unique = Array.from(new Set(matches.filter((match) => !isExcludedSupplierCode(match))));

    for (const supplierCode of unique) {
      const normalized = supplierCode.trim();
      if (!normalized || normalized.length < 4 || !/[A-Za-z]/.test(normalized) || !/\d/.test(normalized)) continue;

      const section = inferSection(page.text);
      candidates.push({
        supplierCode: normalized,
        pageNumber: page.pageNumber,
        section,
        confidence: estimateCandidateConfidence(normalized, page.text),
        source: "extracted-text",
      });
    }
  }

  return candidates;
}

export function detectSupplierProductCodesFromEditorJson(editorJson: unknown): SupplierCodeCandidate[] {
  const textSegments: Array<{ pageNumber: number; text: string }> = [];
  const walk = (node: unknown, pageNumber = 1) => {
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") {
      const text = record.text.trim();
      if (text) textSegments.push({ pageNumber, text });
    }

    if (Array.isArray(record.content)) {
      for (const child of record.content) walk(child, pageNumber);
    }
  };

  walk(editorJson);
  return detectSupplierProductCodes(textSegments);
}

export function applySupplierProductCodeMappings({
  text,
  mappings,
}: {
  text: string;
  mappings: SupplierCodeMapping[];
}): SupplierCodeReplacementResult {
  const pendingMappings = mappings.filter((mapping) => mapping.status === "confirmed" || mapping.status === "pending");
  const warnings: string[] = [];
  const appliedMappings: SupplierCodeMapping[] = [];
  let replacedCount = 0;
  let cursorText = text;

  for (const mapping of pendingMappings) {
    if (!mapping.supplierCode || !mapping.velloreCode) {
      warnings.push(`unsafe mapping skipped for ${mapping.supplierCode || "unknown code"}: ambiguous or invalid mapping values were not applied.`);
      continue;
    }

    const result = replaceProductCodeTokens({
      text: cursorText,
      find: mapping.supplierCode,
      replaceWith: mapping.velloreCode,
      mode: "exact",
    });

    if (result.replacedCount > 0) {
      cursorText = result.text;
      replacedCount += result.replacedCount;
      appliedMappings.push(mapping);
      continue;
    }

    if (result.warnings.length > 0) {
      warnings.push(`Unsafe mapping skipped for ${mapping.supplierCode}: ${result.warnings[0]}`);
    }
  }

  return {
    text: cursorText,
    replacedCount,
    warnings,
    appliedMappings,
  };
}

function isExcludedSupplierCode(value: string) {
  const upper = value.toUpperCase();
  return ["VS", "VELLOR", "TL", "VCC", "VIN", "VOUT", "GND"].some((prefix) => upper === prefix || upper.startsWith(prefix + "-") || upper.startsWith(prefix + "_") || upper.startsWith(prefix));
}

function inferSection(text: string) {
  if (/pin\s+configuration|pinout|pins/i.test(text)) return "pin configuration";
  if (/electrical\s+characteristics|absolute\s+maximum|recommended\s+operating/i.test(text)) return "electrical characteristics";
  if (/ordering\s+information|part\s+number|product\s+code/i.test(text)) return "ordering information";
  if (/features|applications|description/i.test(text)) return "features";
  return "body";
}

function estimateCandidateConfidence(value: string, text: string) {
  let score = 0.55;
  if (/part\s+number|ordering\s+code|product\s+code/i.test(text)) score += 0.2;
  if (/\b[A-Z]{1,6}\d+[A-Z0-9-]+\b/.test(value)) score += 0.1;
  if (value.includes("-")) score += 0.1;
  if (value.length >= 8 && value.length <= 18) score += 0.05;
  return Math.min(0.99, Number(score.toFixed(2)));
}

import { isLikelyProductCodeToken } from "@/lib/product-code-replacement";

export type SupplierCodeMappingStatus = "pending" | "confirmed" | "ignored" | "applied";

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

export function autoApproveSupplierCodeMappings(mappings: SupplierCodeMapping[], minConfidence = 0.8): SupplierCodeMapping[] {
  return mappings.map((mapping) => {
    if (mapping.status === "ignored" || mapping.status === "confirmed") return mapping;
    if (mapping.confidence >= minConfidence) {
      return { ...mapping, status: "confirmed" };
    }
    return mapping;
  });
}

export function detectSupplierProductCodes(pageTexts: Array<{ pageNumber: number; text: string }>): SupplierCodeCandidate[] {
  const candidates: SupplierCodeCandidate[] = [];

  for (const page of pageTexts) {
    const matches = Array.from(page.text.matchAll(/(?<![A-Z0-9])(?:[A-Z]{1,8}-?[0-9][A-Z0-9-]{2,})(?![A-Z0-9])/g)).map((m) => m[0]);
    const unique = Array.from(new Set(matches.filter((match) => !isExcludedSupplierCode(match))));

    for (const supplierCode of unique) {
      const normalized = supplierCode.trim();
      if (!normalized || normalized.length < 4 || !/[A-Za-z]/.test(normalized) || !/\d/.test(normalized)) continue;
      if (isNonProductTechnicalIdentifier(normalized)) continue;

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

export function applySupplierProductCodeMappings({ text, mappings }: { text: string; mappings: SupplierCodeMapping[]; }): SupplierCodeReplacementResult {
  // Work only on confirmed/pending mappings and dedupe by supplierCode
  const pendingMappings = mappings.filter((m) => m.status === "confirmed" || m.status === "pending");
  const seen = new Set<string>();
  const uniqueMappings: SupplierCodeMapping[] = [];
  for (const m of pendingMappings) {
    const key = String(m.supplierCode).trim();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMappings.push(m);
    }
  }

  const sortedMappings = [...uniqueMappings].sort((a, b) => {
    const lengthDelta = b.supplierCode.length - a.supplierCode.length;
    if (lengthDelta !== 0) return lengthDelta;
    return a.supplierCode.localeCompare(b.supplierCode);
  });

  const warnings: string[] = [];
  const appliedMappings: SupplierCodeMapping[] = [];
  let replacedCount = 0;

  // Single-pass over the original source text
  const tokenPattern = /[A-Za-z0-9][A-Za-z0-9-]*/g;
  const matches = Array.from(text.matchAll(tokenPattern));
  const resultChunks: string[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    const token = match[0];
    resultChunks.push(text.slice(lastIndex, start));

    if (!isLikelyProductCodeToken(token)) {
      resultChunks.push(token);
      lastIndex = start + token.length;
      continue;
    }

    let tokenReplacement: string | null = null;

    for (const mapping of sortedMappings) {
      const supplierCode = mapping.supplierCode.trim();
      const replacementCode = mapping.velloreCode.trim();
      if (!supplierCode || !replacementCode) continue;
      // Skip mappings that are clearly not product-code candidates (ambiguous short tokens)
      if (!isLikelyProductCodeToken(supplierCode)) continue;

      // Protect against reprocessing already-generated replacements
      if (token === replacementCode || token.startsWith(replacementCode) || token.includes(replacementCode)) {
        tokenReplacement = token;
        break;
      }

      if (token === supplierCode) {
        tokenReplacement = replacementCode;
        replacedCount += 1;
        appliedMappings.push(mapping);
        break;
      }

      if (token.startsWith(supplierCode) && token.length > supplierCode.length) {
        const suffix = token.slice(supplierCode.length);
        if (/^[A-Za-z0-9-]+$/.test(suffix)) {
          tokenReplacement = replacementCode + suffix;
          replacedCount += 1;
          appliedMappings.push(mapping);
          break;
        }
      }

      if (token.includes(supplierCode) && token.length > supplierCode.length && token !== supplierCode) {
        const next = token.split(supplierCode).join(replacementCode);
        if (next !== token && !next.includes(replacementCode + replacementCode)) {
          tokenReplacement = next;
          replacedCount += 1;
          appliedMappings.push(mapping);
          break;
        }
      }
    }

    resultChunks.push(tokenReplacement ?? token);
    lastIndex = start + token.length;
  }

  resultChunks.push(text.slice(lastIndex));
  const nextText = resultChunks.join("");

  // Build original token set for warning decisions
  const originalTokens = new Set(Array.from(text.matchAll(tokenPattern)).map((m) => m[0]));

  // Warnings only when original contained the supplier code and mapping was confirmed but not applied
  for (const mapping of sortedMappings) {
    const supplierCode = String(mapping.supplierCode).trim();
    const replacementCode = String(mapping.velloreCode).trim();
    if (!supplierCode || !replacementCode) {
      warnings.push(`unsafe mapping skipped for ${supplierCode || "unknown code"}: ambiguous or invalid mapping values were not applied.`);
      continue;
    }

    const originalContained = Array.from(originalTokens).some((t) => t === supplierCode || t.startsWith(supplierCode) || t.includes(supplierCode));
    const wasApplied = appliedMappings.some((item) => item.id === mapping.id);
    const alreadyPresent = nextText.includes(replacementCode);

    if (!originalContained) continue; // don't warn for absent source
    if (wasApplied || alreadyPresent) continue; // no warning if applied or already present

    if (!isLikelyProductCodeToken(supplierCode)) {
      warnings.push(`unsafe mapping skipped for ${supplierCode}: ambiguous product-code candidate was not applied safely.`);
      continue;
    }
    if (mapping.status !== "ignored") {
      warnings.push(`Unsafe mapping skipped for ${supplierCode}: no safe replacements were applied.`);
    }
  }

  const uniqueWarnings = Array.from(new Set(warnings));

  return { text: nextText, replacedCount, warnings: uniqueWarnings, appliedMappings };
}

function isExcludedSupplierCode(value: string) {
  const upper = value.toUpperCase();
  return ["VS", "VELLOR", "TL", "VCC", "VIN", "VOUT", "GND"].some((prefix) => upper === prefix || upper.startsWith(prefix + "-") || upper.startsWith(prefix + "_") || upper.startsWith(prefix));
}

function isNonProductTechnicalIdentifier(value: string) {
  const upper = value.toUpperCase();
  if (/^TO-\d{2,4}(?:[-A-Z0-9]+)?$/.test(upper)) return true;
  if (/^(?:SOT|SOIC|QFN|DFN|DPAK|D2PAK|TSSOP|MSOP|SOP|TSOP)[-_]?[0-9A-Z]+$/.test(upper)) return true;
  if (/^(?:GND|VCC|VIN|VOUT|VDD|VSS|TL|TP|R1|C1|D1|Q1)[A-Z0-9-]*$/i.test(value)) return true;
  return false;
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

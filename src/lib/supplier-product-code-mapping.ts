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

export type ReplacementReport = {
  attempted: number;
  successful: number;
  keptOriginal: number;
  failed: number;
  warnings: string[];
};

export type SupplierCodeReplacementResult = {
  text: string;
  replacedCount: number;
  warnings: string[];
  appliedMappings: SupplierCodeMapping[];
  report: ReplacementReport;
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

export function isTextContainingSupplierCode(text: string, supplierCode: string, vellorePrefix = "VS"): boolean {
  if (!text || !supplierCode) return false;
  const trimmed = supplierCode.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<!(?:${vellorePrefix}[-_]|[A-Za-z0-9_-]))${escaped}(?![A-Za-z0-9_-])`, "i");
  return regex.test(text);
}

export function detectAppliedSupplierProductCodes(
  pageTexts: Array<{ pageNumber: number; text: string }>,
  prefix = "VS"
): Array<{ supplierCode: string; velloreCode: string; pageNumber: number; section: string }> {
  const map = new Map<string, { supplierCode: string; velloreCode: string; pageNumber: number; section: string }>();
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])(${prefix}-([A-Z]{1,8}-?[0-9][A-Z0-9-]{2,}))(?![A-Za-z0-9_-])`, "gi");

  for (const page of pageTexts) {
    const matches = Array.from(page.text.matchAll(pattern));
    for (const match of matches) {
      const velloreCode = match[1];
      const supplierCode = match[2];
      if (!isExcludedSupplierCode(supplierCode) && !isNonProductTechnicalIdentifier(supplierCode)) {
        if (!map.has(supplierCode)) {
          map.set(supplierCode, {
            supplierCode,
            velloreCode,
            pageNumber: page.pageNumber,
            section: inferSection(page.text),
          });
        }
      }
    }
  }

  return Array.from(map.values());
}

export function detectAppliedSupplierProductCodesFromEditorJson(
  editorJson: unknown,
  prefix = "VS"
): Array<{ supplierCode: string; velloreCode: string; pageNumber: number; section: string }> {
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
  return detectAppliedSupplierProductCodes(textSegments, prefix);
}

export function detectSupplierProductCodes(pageTexts: Array<{ pageNumber: number; text: string }>): SupplierCodeCandidate[] {
  const candidateMap = new Map<string, SupplierCodeCandidate>();

  for (const page of pageTexts) {
    const matches = Array.from(page.text.matchAll(/(?<![A-Za-z0-9_-])(?:[A-Z]{1,8}-?[0-9][A-Z0-9-]{2,})(?![A-Za-z0-9_-])/gi)).map((m) => m[0]);
    const unique = Array.from(new Set(matches.filter((match) => !isExcludedSupplierCode(match))));

    for (const supplierCode of unique) {
      const normalized = supplierCode.trim();
      if (!normalized || normalized.length < 4 || !/[A-Za-z]/.test(normalized) || !/\d/.test(normalized)) continue;
      if (isNonProductTechnicalIdentifier(normalized)) continue;

      const section = inferSection(page.text);
      const confidence = estimateCandidateConfidence(normalized, page.text);

      const existing = candidateMap.get(normalized);
      if (!existing || confidence > existing.confidence) {
        candidateMap.set(normalized, {
          supplierCode: normalized,
          pageNumber: existing?.pageNumber ?? page.pageNumber,
          section: existing && existing.section !== "body" ? existing.section : section,
          confidence: Math.max(confidence, existing?.confidence ?? 0),
          source: "extracted-text",
        });
      }
    }
  }

  return Array.from(candidateMap.values());
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

export function revertSupplierProductCodeMappings({
  text,
  mappings,
}: {
  text: string;
  mappings: SupplierCodeMapping[];
}): { text: string; replacedCount: number } {
  if (!text || mappings.length === 0) return { text, replacedCount: 0 };

  const tokenPattern = /[A-Za-z0-9][A-Za-z0-9-]*/g;
  const matches = Array.from(text.matchAll(tokenPattern));
  const resultChunks: string[] = [];
  let lastIndex = 0;
  let replacedCount = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    const token = match[0];
    resultChunks.push(text.slice(lastIndex, start));

    let tokenReplacement: string | null = null;
    const tokenUpper = token.toUpperCase();

    for (const mapping of mappings) {
      const supplierCode = mapping.supplierCode.trim();
      const velloreCode = mapping.velloreCode.trim();
      if (!supplierCode) continue;

      const supplierUpper = supplierCode.toUpperCase();
      const velloreUpper = velloreCode.toUpperCase();

      const isMatch =
        (velloreUpper && tokenUpper === velloreUpper) ||
        tokenUpper === `VS-${supplierUpper}` ||
        (tokenUpper.startsWith("VS-") && tokenUpper.endsWith(supplierUpper)) ||
        (tokenUpper.startsWith("VSS-") && tokenUpper.endsWith(supplierUpper));

      if (isMatch && tokenUpper !== supplierUpper) {
        tokenReplacement = supplierCode;
        replacedCount += 1;
        break;
      }
    }

    resultChunks.push(tokenReplacement ?? token);
    lastIndex = start + token.length;
  }

  resultChunks.push(text.slice(lastIndex));
  return { text: resultChunks.join(""), replacedCount };
}

export function applySupplierProductCodeMappings({ text, mappings }: { text: string; mappings: SupplierCodeMapping[]; }): SupplierCodeReplacementResult {
  // Dedupe mappings by supplierCode, giving priority to confirmed/pending over ignored
  const sortedByStatus = [...mappings].sort((a, b) => {
    const statusOrder: Record<string, number> = { confirmed: 0, pending: 1, ignored: 2 };
    return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  });
  const seen = new Set<string>();
  const uniqueMappings: SupplierCodeMapping[] = [];
  for (const m of sortedByStatus) {
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
  let attemptedCount = 0;
  let keptOriginalCount = 0;

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
      if (token === replacementCode) {
        tokenReplacement = token;
        break;
      }

      // Exact match rule per Scope Section 5.4:
      // Replace exact product-code matches only. Also allow replacing previous Vellore codes when updating.
      const isSupplierMatch = token === supplierCode;
      const isPreviousVelloreMatch =
        token === `VS-${supplierCode}` ||
        (token.startsWith("VS-") && token.endsWith(supplierCode)) ||
        (token.startsWith("VSS-") && token.endsWith(supplierCode));

      if ((isSupplierMatch || isPreviousVelloreMatch) && token !== replacementCode) {
        attemptedCount += 1;
        if (mapping.status === "confirmed" || (mapping.status === "pending" && mapping.confidence >= 0.8)) {
          tokenReplacement = replacementCode;
          replacedCount += 1;
          appliedMappings.push(mapping);
        } else {
          // Unconfirmed or unsafe mapping: keep original code per Scope rule 7!
          tokenReplacement = token;
          keptOriginalCount += 1;
          warnings.push(`Original product code "${supplierCode}" retained (status: ${mapping.status}, confidence: ${mapping.confidence}).`);
        }
        break;
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

    const originalContained = Array.from(originalTokens).some((t) => t === supplierCode);
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

  const report: ReplacementReport = {
    attempted: attemptedCount,
    successful: replacedCount,
    keptOriginal: keptOriginalCount,
    failed: 0,
    warnings: uniqueWarnings,
  };

  return { text: nextText, replacedCount, warnings: uniqueWarnings, appliedMappings, report };
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

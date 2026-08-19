import { collectTextQualityWarnings, normalizeTechnicalText } from "@/server/datasheet/technical-text";
import type { CleanupReasonCode, TiptapJson } from "@/server/datasheet/schema";

export type BoundingBox = { x: number; y: number; width: number; height: number };
export type NormalizableTextBlock = {
  id: string;
  type?: string;
  text: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  fontSize?: number | null;
  fontWeight?: string | null;
  extractionMethod?: string;
  confidence?: number;
  readingOrderIndex?: number;
};
export type NormalizableImage = {
  id: string;
  pageNumber: number;
  storageKey: string;
  width: number;
  height: number;
  boundingBox: BoundingBox;
  mimeType: string;
  confidence?: number;
  warnings?: string[];
};
export type NormalizableTableCell = { text: string; rowSpan?: number; colSpan?: number };
export type NormalizableTable = {
  id: string;
  pageNumber: number;
  rows: NormalizableTableCell[][];
  confidence?: number;
  warnings?: string[];
  boundingBox?: BoundingBox | null;
};
export type NormalizablePage = {
  pageNumber: number;
  width: number;
  height: number;
  textBlocks: NormalizableTextBlock[];
  images: NormalizableImage[];
  tables: NormalizableTable[];
  warnings?: string[];
};

export type CleanupItemType = "text" | "image";
export type CleanupDecision = "removed" | "kept" | "uncertain";
export type CleanupItem = {
  id: string;
  sourceId: string;
  itemType: CleanupItemType;
  pageNumber: number;
  text?: string;
  storageKey?: string;
  boundingBox: BoundingBox;
  confidence: number;
  reasons: CleanupReasonCode[];
  decision: CleanupDecision;
};

export type SourceCleanupReport = {
  removedTextBlocks: CleanupItem[];
  removedImages: CleanupItem[];
  keptTextBlocks: CleanupItem[];
  keptImages: CleanupItem[];
  uncertainItems: CleanupItem[];
  confidence: number;
  reasonCodes: CleanupReasonCode[];
};

export type DatasheetContentQualitySummary = {
  sectionsDetected: number;
  tablesDetected: number;
  figuresDetected: number;
  warnings: string[];
  warningsCount: number;
  unresolvedSymbolsCount: number;
};

export type NormalizedDatasheet = {
  pages: NormalizablePage[];
  cleanupReport: SourceCleanupReport;
  editorJson: TiptapJson;
  qualitySummary: DatasheetContentQualitySummary;
  title: string;
  productCode: string;
  productCategory: string;
  documentStatus: string;
  revision: string;
};

type ClassifiedText = { block: NormalizableTextBlock; decision: CleanupDecision; reasons: CleanupReasonCode[]; confidence: number };
type ClassifiedImage = { image: NormalizableImage; decision: CleanupDecision; reasons: CleanupReasonCode[]; confidence: number };
type Metadata = { title: string; productCode: string; productCategory: string; documentStatus: string; revision: string };
type CaptionCandidate = { id: string; text: string; block: NormalizableTextBlock };
type MetadataCandidate = {
  text: string;
  normalizedText: string;
  pageNumber: number;
  region: "header" | "footer" | "body";
  repeatedHeader: boolean;
  repeatedFooter: boolean;
  removed: boolean;
  nearProductCode: boolean;
  onFirstPage: boolean;
  withinTopTitleRegion: boolean;
  fontSize: number;
  wordCount: number;
  overlapsTable: boolean;
  source: "repeated-header" | "top-title-region" | "near-product-code" | "combined-header-title" | "status-or-revision";
  block: NormalizableTextBlock;
};
type MetadataSelection = { value: string; candidate: MetadataCandidate | null };
type RankedTitleCandidate = { candidate: MetadataCandidate; score: number; reasons: string[] };
type MetadataTrace = {
  selectedProductCodeCandidate: string | null;
  selectedTitleCandidate: string | null;
  selectedDocumentStatusCandidate: string | null;
  selectedRevisionCandidate: string | null;
  rejectedTopCandidates: Array<{ text: string; reasons: string[] }>;
};

const HEADER_RATIO = 0.15;
const FOOTER_RATIO = 0.12;
const TITLE_REGION_RATIO = 0.16;
const NEAR_CODE_REGION_RATIO = 0.22;
const SECTION_HEADING_WORDS = new Set([
  "GENERAL DESCRIPTION",
  "PIN CONFIGURATION",
  "FEATURES",
  "APPLICATIONS",
  "TYPICAL APPLICATION",
  "ABSOLUTE MAXIMUM RATINGS",
  "RECOMMENDED OPERATING CONDITIONS",
  "ELECTRICAL CHARACTERISTICS",
  "APPLICATION INFORMATION",
  "THERMAL DESIGN",
  "CAPACITOR REQUIREMENTS",
  "MINIMUM LOAD CURRENT",
  "ADJUSTABLE REGULATOR DESIGN",
  "ERROR FLAG",
  "ENABLE INPUT",
  "BLOCK DIAGRAM",
  "PAD LOCATION AND COORDINATES",
  "BONDING DIAGRAM",
  "ASSEMBLY CHARACTERISTICS",
  "ADDITIONAL INFORMATION"
]);
const SECTION_HEADING_ORDER = [
  "GENERAL DESCRIPTION",
  "PIN CONFIGURATION",
  "PINOUT",
  "FEATURES",
  "TYPICAL APPLICATION",
  "APPLICATIONS",
  "ABSOLUTE MAXIMUM RATINGS",
  "RECOMMENDED OPERATING CONDITIONS",
  "ELECTRICAL CHARACTERISTICS",
  "APPLICATION INFORMATION",
  "THERMAL DESIGN",
  "CAPACITOR REQUIREMENTS",
  "MINIMUM LOAD CURRENT",
  "ADJUSTABLE REGULATOR DESIGN",
  "ERROR FLAG",
  "ENABLE INPUT",
  "BLOCK DIAGRAM",
  "PAD LOCATION AND COORDINATES",
  "BONDING DIAGRAM",
  "ASSEMBLY CHARACTERISTICS",
  "ADDITIONAL INFORMATION"
] as const;
const TECHNICAL_CATEGORY_WORDS = [
  "regulator",
  "regulators",
  "converter",
  "converters",
  "amplifier",
  "amplifiers",
  "sensor",
  "sensors",
  "controller",
  "controllers",
  "driver",
  "drivers",
  "diode",
  "diodes",
  "transistor",
  "transistors",
  "memory",
  "processor",
  "processors",
  "module",
  "modules",
  "interface",
  "interfaces",
  "switch",
  "switches",
  "isolator",
  "isolators",
  "oscillator",
  "oscillators",
  "reference",
  "references",
  "detector",
  "detectors",
  "ic",
  "ics",
  "mcu",
  "mcus",
  "mosfet",
  "mosfets",
  "ldo",
  "ldos"
] as const;
const MEASUREMENT_LABEL_WORDS = new Set([
  "output",
  "input",
  "current",
  "voltage",
  "dropout",
  "line",
  "load",
  "limit",
  "leakage",
  "shutdown",
  "reference",
  "ground",
  "quiescent",
  "temperature",
  "thermal",
  "regulation",
  "accuracy",
  "enable",
  "standby",
  "symbol",
  "parameter",
  "conditions",
  "test",
  "min",
  "typ",
  "max",
  "unit"
]);
const STRICT_REVISION_PATTERN = /\b(?:rev(?:ision)?\.?\s*)([A-Z]|\d+(?:\.\d+)*)\b/i;

const COMMON_WEAK_TITLE_WORDS = new Set([
  "supply",
  "value",
  "unit",
  "ratings",
  "rating",
  "symbol",
  "symbols",
  "conditions",
  "condition",
  "parameter",
  "parameters",
  "description",
  "features",
  "applications",
  "application",
  "characteristics",
  "electrical",
  "general",
  "pin",
  "configuration",
  "absolute",
  "maximum",
  "recommended",
  "operating",
  "typical"
]);

export function normalizeDatasheetExtraction(pages: NormalizablePage[]): NormalizedDatasheet {
  const textFrequency = repeatedTextFrequency(pages);
  const imageFrequency = repeatedImageFrequency(pages);
  const textClassifications = pages.flatMap((page) => page.textBlocks.map((block) => classifyTextBlock(page, block, pages.length, textFrequency)));
  const imageClassifications = pages.flatMap((page) => page.images.map((image) => classifyImage(page, image, pages.length, imageFrequency)));
  const cleanupReport = buildCleanupReport(textClassifications, imageClassifications);
  const removedTextIds = new Set(cleanupReport.removedTextBlocks.map((item) => item.sourceId));
  const removedImageIds = new Set(cleanupReport.removedImages.map((item) => item.sourceId));
  const metadata = inferMetadata(pages, textClassifications, removedTextIds);

  const editorJson = convertToTiptapJson(pages, removedTextIds, removedImageIds);

  return {
    pages,
    cleanupReport,
    editorJson,
    qualitySummary: analyzeEditorContentQuality(editorJson),
    title: metadata.title,
    productCode: metadata.productCode,
    productCategory: metadata.productCategory,
    documentStatus: metadata.documentStatus,
    revision: metadata.revision
  };
}

export function convertToTiptapJson(pages: NormalizablePage[], removedTextIds: Set<string> = new Set(), removedImageIds: Set<string> = new Set()): TiptapJson {
  const content: Array<Record<string, unknown>> = [];

  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const tableSuppressedTextIds = collectSuppressedTableTextIds(page);
    const captionSelections = pairFigureCaptions(page.textBlocks, page.images.filter((item) => !removedImageIds.has(item.id) && isBodyRegion(page, item.boundingBox)));
    const captionTextIds = new Set(captionSelections.map((item) => item.block.id));
    const textBlocks = orderTextBlocksForPage(page)
      .filter((block) => !removedTextIds.has(block.id) && !tableSuppressedTextIds.has(block.id) && !captionTextIds.has(block.id));
    const tables = [...page.tables].sort(compareTables);
    const images = page.images.filter((item) => !removedImageIds.has(item.id) && isBodyRegion(page, item.boundingBox));
    const items = mergeOrderedPageItems(page, textBlocks, tables, images, captionSelections);

    for (const item of items) {
      if (item.kind === "text") appendTextBlock(content, item.block);
      else if (item.kind === "synthetic-heading") content.push(createHeadingNode(item.text));
      else if (item.kind === "image") content.push(...createImageNodes(page, item.image, item.caption));
      else appendTable(content, item.table);
    }
  }

  const orderedContent = finalizeEditorContent(reorderKnownSections(content));
  if (process.env.NODE_ENV === "development" && (process.env.DEBUG_TEXT_QUALITY === "1" || process.env.DEBUG_EXPORT_LAYOUT === "1")) {
    const headings = orderedContent.map((node) => sectionHeadingForNode(node)).filter(Boolean);
    const warnings = collectTextQualityWarnings({ texts: orderedContent.map((node) => nodePlainText(node)).filter(Boolean), headings });
    if (warnings.length > 0) console.info("[datasheet] text quality warnings", warnings);
  }
  return { type: "doc", content: orderedContent.length ? orderedContent : [{ type: "paragraph", content: [{ type: "text", text: "Editable datasheet draft" }] }] };
}

function appendTextBlock(content: Array<Record<string, unknown>>, block: NormalizableTextBlock) {
  const normalizedText = normalizeTechnicalText(block.text.trim());
  if (!normalizedText || isLikelyCaption(normalizedText) || isDocumentStatusText(normalizedText)) return;

  const headingSequence = splitKnownHeadingSequence(normalizedText);
  if (headingSequence) {
    content.push(...headingSequence);
    return;
  }

  const mergedHeadingParts = splitMergedHeadingText(normalizedText);
  if (mergedHeadingParts) {
    content.push(createHeadingNode(mergedHeadingParts.heading));
    appendTextBlock(content, { ...block, text: mergedHeadingParts.body });
    return;
  }

  const bulletItems = splitBulletItems(normalizedText).map((item) => normalizeTechnicalText(item));
  if (bulletItems.length > 0) {
    content.push({
      type: "bulletList",
      content: bulletItems.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] }))
    });
    return;
  }

  const normalizedBlock = { ...block, text: normalizedText };
  if (isLikelyHeading(normalizedBlock)) {
    content.push(createHeadingNode(normalizedText, headingLevel(normalizedBlock)));
    return;
  }

  content.push({ type: "paragraph", content: [{ type: "text", text: normalizedText }] });
}

function appendTable(content: Array<Record<string, unknown>>, table: NormalizableTable) {
  const rows = cleanTableRows(table.rows);
  const cleanedTable = { ...table, rows };
  if (!isReliableTable(cleanedTable)) {
    content.push({ type: "paragraph", attrs: { class: "table-review", sourceTableId: table.id }, content: [{ type: "text", text: "Table extraction needs review" }] });
    const fallback = rows.flatMap((row) => row.map((cell) => normalizeTechnicalText(cell.text.trim())).filter(Boolean)).join(" | ");
    if (fallback) content.push({ type: "paragraph", attrs: { class: "table-review-text", sourceTableId: table.id }, content: [{ type: "text", text: fallback }] });
    return;
  }

  const hasHeader = isHeaderLikeRow(rows[0] ?? []);
  content.push({
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: hasHeader && rowIndex === 0 ? "tableHeader" : "tableCell",
        attrs: { colspan: cell.colSpan ?? 1, rowspan: cell.rowSpan ?? 1 },
        content: [{ type: "paragraph", content: cell.text ? [{ type: "text", text: normalizeTechnicalText(cell.text) }] : [] }]
      }))
    }))
  });
}

function classifyTextBlock(page: NormalizablePage, block: NormalizableTextBlock, pageCount: number, frequency: Map<string, number>): ClassifiedText {
  const reasons: CleanupReasonCode[] = [];
  const normalized = normalizeText(block.text);
  const repeated = (frequency.get(normalized) ?? 0) >= Math.max(2, Math.ceil(pageCount * 0.5));
  const region = pageRegion(page, block.boundingBox);

  if (isPageNumber(block.text)) reasons.push("PAGE_NUMBER");
  if (region === "footer" && hasUrl(block.text)) reasons.push("URL_IN_FOOTER");
  if (region === "footer" && hasRevisionOrDate(block.text)) reasons.push("DATE_REVISION_FOOTER");
  if (repeated && region === "header") reasons.push("REPEATED_HEADER_TEXT");
  if (repeated && region === "footer") reasons.push("REPEATED_FOOTER_TEXT");

  if (reasons.length > 0) {
    const confidence = reasons.some((reason) => reason === "PAGE_NUMBER" || reason === "URL_IN_FOOTER") ? 0.94 : repeated ? 0.82 : 0.68;
    const decision: CleanupDecision = confidence >= 0.75 || page.pageNumber > 1 ? "removed" : "uncertain";
    return { block, decision, reasons, confidence };
  }

  const uncertainHeader = page.pageNumber > 1 && region === "header" && block.text.length < 80;
  if (uncertainHeader) return { block, decision: "uncertain", reasons: ["LOW_CONFIDENCE"], confidence: 0.42 };
  return { block, decision: "kept", reasons: [], confidence: 0.9 };
}

function classifyImage(page: NormalizablePage, image: NormalizableImage, pageCount: number, frequency: Map<string, number>): ClassifiedImage {
  const reasons: CleanupReasonCode[] = [];
  const region = pageRegion(page, image.boundingBox);
  const repeated = (frequency.get(imageSignature(image, region)) ?? 0) >= Math.max(2, Math.ceil(pageCount * 0.5));
  const smallBrandingCandidate = image.width <= 420 && image.height <= 180 && region !== "body";

  if (repeated && region === "header") reasons.push("REPEATED_HEADER_IMAGE");
  if (repeated && region === "footer") reasons.push("REPEATED_FOOTER_IMAGE");
  if (smallBrandingCandidate) reasons.push("POSSIBLE_SOURCE_LOGO");

  if (reasons.length > 0) {
    const confidence = repeated ? 0.84 : 0.58;
    return { image, decision: confidence >= 0.75 ? "removed" : "uncertain", reasons, confidence };
  }

  return { image, decision: "kept", reasons: [], confidence: 0.88 };
}

function buildCleanupReport(texts: ClassifiedText[], images: ClassifiedImage[]): SourceCleanupReport {
  const removedTextBlocks = texts.filter((item) => item.decision === "removed").map(textCleanupItem);
  const keptTextBlocks = texts.filter((item) => item.decision === "kept").map(textCleanupItem);
  const removedImages = images.filter((item) => item.decision === "removed").map(imageCleanupItem);
  const keptImages = images.filter((item) => item.decision === "kept").map(imageCleanupItem);
  const uncertainItems = [...texts.filter((item) => item.decision === "uncertain").map(textCleanupItem), ...images.filter((item) => item.decision === "uncertain").map(imageCleanupItem)];
  const reasonCodes = Array.from(new Set([...removedTextBlocks, ...removedImages, ...uncertainItems].flatMap((item) => item.reasons)));
  const confidenceValues = [...removedTextBlocks, ...removedImages, ...uncertainItems].map((item) => item.confidence);

  return {
    removedTextBlocks,
    removedImages,
    keptTextBlocks,
    keptImages,
    uncertainItems,
    confidence: confidenceValues.length ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2)) : 0.9,
    reasonCodes
  };
}

function inferMetadata(pages: NormalizablePage[], classifications: ClassifiedText[], removedTextIds: Set<string>): Metadata {
  const candidates = buildMetadataCandidates(pages, classifications, removedTextIds);
  const documentStatus = selectDocumentStatusCandidate(candidates);
  const revision = selectRevisionCandidate(candidates);
  const productCode = selectProductCodeCandidate(candidates);
  const rankedTitleCandidates = rankTitleCandidates(candidates, productCode.value, documentStatus.value, revision.value);
  const selectedTitle = rankedTitleCandidates.find((item) => item.score >= 8) ?? null;
  const productCategory = selectedTitle?.candidate.text ?? "";
  const title = productCategory || "Editable Datasheet";

  if (process.env.NODE_ENV === "development") {
    const trace: MetadataTrace = {
      selectedProductCodeCandidate: productCode.candidate?.text ?? null,
      selectedTitleCandidate: selectedTitle?.candidate.text ?? null,
      selectedDocumentStatusCandidate: documentStatus.candidate?.text ?? null,
      selectedRevisionCandidate: revision.candidate?.text ?? null,
      rejectedTopCandidates: rankedTitleCandidates
        .filter((item) => item.score < 8)
        .slice(0, 5)
        .map((item) => ({ text: item.candidate.text, reasons: item.reasons }))
    };
    console.info("[datasheet] metadata inference", trace);
  }

  return {
    title,
    productCode: productCode.value,
    productCategory,
    documentStatus: documentStatus.value || "Preliminary Datasheet",
    revision: revision.value
  };
}

function inferDocumentStatus(candidates: string[]) {
  for (const candidate of candidates) {
    const text = candidate.trim();
    if (/preliminary\s+datasheet/i.test(text) || /^\(?preliminary\)?$/i.test(text)) return "Preliminary Datasheet";
    if (/final\s+datasheet/i.test(text) || /^\(?final\)?$/i.test(text)) return "Final Datasheet";
  }
  return "Preliminary Datasheet";
}

function buildMetadataCandidates(pages: NormalizablePage[], classifications: ClassifiedText[], removedTextIds: Set<string>) {
  const firstPage = pages.find((page) => page.pageNumber === 1);
  const allFirstPageCodeBlocks = (firstPage?.textBlocks ?? []).filter((block) => Boolean(normalizeProductCode(block.text)));
  const candidates: MetadataCandidate[] = [];

  for (const item of classifications) {
    const page = findPage(pages, item.block.pageNumber);
    const text = sanitizeMetadataText(item.block.text);
    if (!text) continue;

    const region = pageRegion(page, item.block.boundingBox);
    const repeatedHeader = item.reasons.includes("REPEATED_HEADER_TEXT");
    const repeatedFooter = item.reasons.includes("REPEATED_FOOTER_TEXT");
    const withinTopTitleRegion = isWithinTopTitleRegion(page, item.block.boundingBox);
    const overlapsTable = page.tables.some((table) => table.boundingBox && overlaps(item.block.boundingBox, table.boundingBox, 0.18));
    const nearProductCode = allFirstPageCodeBlocks.some((codeBlock) => areBlocksNear(item.block, codeBlock));

    const baseCandidate: MetadataCandidate = {
      text,
      normalizedText: text.toLowerCase(),
      pageNumber: item.block.pageNumber,
      region,
      repeatedHeader,
      repeatedFooter,
      removed: removedTextIds.has(item.block.id),
      nearProductCode,
      onFirstPage: item.block.pageNumber === 1,
      withinTopTitleRegion,
      fontSize: item.block.fontSize ?? 0,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      overlapsTable,
      source: repeatedHeader ? "repeated-header" : nearProductCode ? "near-product-code" : withinTopTitleRegion ? "top-title-region" : "status-or-revision",
      block: item.block
    };

    if (isMetadataCandidate(baseCandidate)) candidates.push(baseCandidate);

    const splitTitle = extractTitleFromCombinedHeader(text);
    if (splitTitle && splitTitle.toLowerCase() !== text.toLowerCase()) {
      const splitCandidate: MetadataCandidate = {
        ...baseCandidate,
        text: splitTitle,
        normalizedText: splitTitle.toLowerCase(),
        wordCount: splitTitle.split(/\s+/).filter(Boolean).length,
        source: "combined-header-title"
      };
      if (isMetadataCandidate(splitCandidate)) candidates.push(splitCandidate);
    }
  }

  return dedupeMetadataCandidates(candidates);
}

function isMetadataCandidate(candidate: MetadataCandidate) {
  return candidate.repeatedHeader
    || candidate.withinTopTitleRegion
    || (candidate.onFirstPage && candidate.nearProductCode)
    || isDocumentStatusText(candidate.text)
    || Boolean(parseRevision(candidate.text));
}

function dedupeMetadataCandidates(candidates: MetadataCandidate[]) {
  const bestByText = new Map<string, MetadataCandidate>();
  for (const candidate of candidates) {
    const current = bestByText.get(candidate.normalizedText);
    if (!current || metadataCandidatePriority(candidate) > metadataCandidatePriority(current)) bestByText.set(candidate.normalizedText, candidate);
  }
  return Array.from(bestByText.values());
}

function metadataCandidatePriority(candidate: MetadataCandidate) {
  let score = 0;
  if (candidate.repeatedHeader) score += 10;
  if (candidate.source === "combined-header-title") score += 6;
  if (candidate.nearProductCode) score += 5;
  if (candidate.withinTopTitleRegion) score += 4;
  if (candidate.onFirstPage) score += 3;
  score += Math.min(candidate.fontSize, 24) / 10;
  return score;
}

function compareMetadataCandidates(a: MetadataCandidate, b: MetadataCandidate) {
  return metadataCandidatePriority(b) - metadataCandidatePriority(a)
    || a.block.boundingBox.y - b.block.boundingBox.y
    || a.block.boundingBox.x - b.block.boundingBox.x;
}

function selectDocumentStatusCandidate(candidates: MetadataCandidate[]): MetadataSelection {
  const selected = [...candidates]
    .filter((candidate) => isDocumentStatusText(candidate.text) || /preliminary\s+datasheet|final\s+datasheet/i.test(candidate.text))
    .sort(compareMetadataCandidates)[0] ?? null;

  return {
    value: selected ? inferDocumentStatus([selected.text]) : "Preliminary Datasheet",
    candidate: selected
  };
}

function selectRevisionCandidate(candidates: MetadataCandidate[]): MetadataSelection {
  const selected = [...candidates]
    .filter((candidate) => Boolean(parseRevision(candidate.text)))
    .filter((candidate) => candidate.repeatedHeader || candidate.region === "header" || candidate.region === "footer" || candidate.withinTopTitleRegion)
    .sort(compareMetadataCandidates)[0] ?? null;

  return {
    value: selected ? parseRevision(selected.text) : "",
    candidate: selected
  };
}

function selectProductCodeCandidate(candidates: MetadataCandidate[]): MetadataSelection {
  const selected = [...candidates]
    .filter((candidate) => Boolean(normalizeProductCode(candidate.text)))
    .filter((candidate) => !isDocumentStatusText(candidate.text) && !isRevisionText(candidate.text))
    .sort(compareMetadataCandidates)[0] ?? null;

  return {
    value: selected ? normalizeProductCode(selected.text) : "",
    candidate: selected
  };
}

function rankTitleCandidates(candidates: MetadataCandidate[], productCode: string, documentStatus: string, revision: string) {
  return candidates
    .map((candidate) => scoreTitleCandidate(candidate, productCode, documentStatus, revision))
    .sort((a, b) => b.score - a.score || compareMetadataCandidates(a.candidate, b.candidate));
}

function scoreTitleCandidate(candidate: MetadataCandidate, productCode: string, documentStatus: string, revision: string): RankedTitleCandidate {
  const reasons: string[] = [];
  const text = candidate.text;

  if (!candidate.repeatedHeader && !candidate.withinTopTitleRegion && !(candidate.onFirstPage && candidate.nearProductCode)) reasons.push("outside_metadata_regions");
  if (candidate.overlapsTable) reasons.push("overlaps_table");
  if (candidate.region === "body" && !candidate.withinTopTitleRegion && !candidate.nearProductCode) reasons.push("body_content");
  if (isDocumentStatusText(text)) reasons.push("document_status_text");
  if (isRevisionText(text)) reasons.push("revision_text");
  if (isSectionHeading(text)) reasons.push("section_heading");
  if (looksLikeMeasurementLabel(text)) reasons.push("measurement_label");
  if (looksLikeTableHeader(text)) reasons.push("table_header_like");
  if (productCode && normalizeProductCode(text) === productCode) reasons.push("product_code_only");
  if (documentStatus && text.toLowerCase() === documentStatus.toLowerCase()) reasons.push("status_equals_title");
  if (revision && text.toLowerCase() === revision.toLowerCase()) reasons.push("revision_equals_title");
  if (COMMON_WEAK_TITLE_WORDS.has(text.toLowerCase())) reasons.push("weak_single_word");
  if (text.length < 5 || text.length > 90) reasons.push("length_out_of_range");
  if (!/[A-Za-z]/.test(text)) reasons.push("missing_alpha");

  if (reasons.length > 0) return { candidate, score: Number.NEGATIVE_INFINITY, reasons };

  let score = 0;
  if (candidate.repeatedHeader) {
    score += 18;
    reasons.push("repeated_header");
  }
  if (candidate.source === "combined-header-title") {
    score += 10;
    reasons.push("split_from_combined_header");
  }
  if (candidate.withinTopTitleRegion) {
    score += 8;
    reasons.push("top_title_region");
  }
  if (candidate.onFirstPage && candidate.nearProductCode) {
    score += 10;
    reasons.push("near_product_code");
  }
  if (candidate.fontSize >= 10) {
    score += 2;
    reasons.push("font_size_supports_title");
  }
  if (candidate.wordCount >= 2 && candidate.wordCount <= 5) {
    score += 6;
    reasons.push("compact_phrase_length");
  } else if (candidate.wordCount === 6) {
    score += 4;
    reasons.push("acceptable_phrase_length");
  } else if (candidate.wordCount === 1) {
    score -= 6;
    reasons.push("single_word_penalty");
  }
  if (isMostlyTitleCase(text) || isMostlyUppercaseTechnicalPhrase(text)) {
    score += 3;
    reasons.push("title_like_case");
  }
  if (containsTechnicalCategoryWord(text)) {
    score += 8;
    reasons.push("technical_category_word");
  }

  return { candidate, score, reasons };
}

function extractTitleFromCombinedHeader(value: string) {
  const normalizedCode = normalizeProductCode(value);
  if (!normalizedCode) return "";
  const stripped = value
    .replace(/[A-Z]{1,8}\d[A-Z0-9-]{2,}/gi, " ")
    .replace(/[/_.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  if (normalizeProductCode(stripped) === normalizedCode) return "";
  return stripped;
}

function sanitizeMetadataText(value: string) {
  return value.replace(/\s+/g, " ").replace(/^\((.+)\)$/u, "$1").trim();
}

function isWithinTopTitleRegion(page: NormalizablePage, box: BoundingBox) {
  const centerY = box.y + box.height / 2;
  return centerY <= page.height * TITLE_REGION_RATIO;
}

function areBlocksNear(a: NormalizableTextBlock, b: NormalizableTextBlock) {
  if (a.pageNumber !== b.pageNumber) return false;
  const aCenterX = a.boundingBox.x + a.boundingBox.width / 2;
  const bCenterX = b.boundingBox.x + b.boundingBox.width / 2;
  const aCenterY = a.boundingBox.y + a.boundingBox.height / 2;
  const bCenterY = b.boundingBox.y + b.boundingBox.height / 2;
  return Math.abs(aCenterY - bCenterY) <= 70 && Math.abs(aCenterX - bCenterX) <= 260 && Math.max(a.boundingBox.y, b.boundingBox.y) <= 842 * NEAR_CODE_REGION_RATIO;
}
function containsTechnicalCategoryWord(value: string) {
  return TECHNICAL_CATEGORY_WORDS.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeTableHeader(value: string) {
  const normalized = value.toLowerCase().replace(/[^\w\s/-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  const words = normalized.split(" ");
  if (words.length === 1) return COMMON_WEAK_TITLE_WORDS.has(words[0] ?? "");
  return words.length <= 4 && words.every((word) => COMMON_WEAK_TITLE_WORDS.has(word));
}

function looksLikeMeasurementLabel(value: string) {
  const words = value.toLowerCase().replace(/[^a-z0-9\s/-]/g, " ").split(/\s+/).filter(Boolean);
  const measurementHits = words.filter((word) => MEASUREMENT_LABEL_WORDS.has(word)).length;
  return words.length >= 3 && measurementHits >= 2;
}

function isMostlyTitleCase(value: string) {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0) return false;
  const titleCaseWords = words.filter((word) => /^[A-Z][a-z0-9-]*$/.test(word) || /^[A-Z]{2,}[a-z0-9-]*$/.test(word));
  return titleCaseWords.length / words.length >= 0.65;
}

function isMostlyUppercaseTechnicalPhrase(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  const alpha = value.replace(/[^A-Za-z]/g, "");
  if (!alpha) return false;
  const uppercaseRatio = alpha.replace(/[^A-Z]/g, "").length / alpha.length;
  return uppercaseRatio >= 0.72;
}

function parseRevision(value: string) {
  const match = value.trim().match(STRICT_REVISION_PATTERN);
  if (!match?.[1]) return "";
  const token = match[1].toUpperCase();
  if (!/^[A-Z]$|^\d+(?:\.\d+)*$/.test(token)) return "";
  return `Rev. ${token}`;
}

function isRevisionText(value: string) {
  return Boolean(parseRevision(value));
}

function normalizeProductCode(value: string) {
  const text = value.toUpperCase().replace(/[,_]/g, " ").replace(/\s+/g, " ").trim();
  const matches = Array.from(text.matchAll(/[A-Z]{1,8}\d[A-Z0-9-]{2,}/g)).map((match) => match[0]);
  if (matches.length > 0) return Array.from(new Set(matches)).join(" / ");
  return "";
}

function collectSuppressedTableTextIds(page: NormalizablePage) {
  const ids = new Set<string>();
  for (const table of page.tables) {
    const tableBox = table.boundingBox;
    if (!tableBox) continue;
    for (const block of page.textBlocks) {
      if (!overlaps(block.boundingBox, tableBox, 0.18)) continue;
      const headingAboveTable = isLikelyHeading(block)
        && block.boundingBox.y + block.boundingBox.height <= tableBox.y + Math.max(14, tableBox.height * 0.12);
      if (isSectionHeading(block.text) || headingAboveTable) continue;
      ids.add(block.id);
    }
  }
  return ids;
}

function mergeOrderedPageItems(page: NormalizablePage, textBlocks: NormalizableTextBlock[], tables: NormalizableTable[], images: NormalizableImage[] = [], captions: Array<{ imageId: string; text: string; block: NormalizableTextBlock }> = []) {
  const items: Array<
    | { kind: "text"; block: NormalizableTextBlock }
    | { kind: "table"; table: NormalizableTable }
    | { kind: "image"; image: NormalizableImage; caption: string }
    | { kind: "synthetic-heading"; text: string }
  > = [];
  let tableIndex = 0;
  let imageIndex = 0;
  let lastHeading = "";
  const sortedImages = [...images].sort(compareImages);

  const pushTable = (table: NormalizableTable) => {
    const inferredHeading = inferTableHeadingFromRows(table);
    if (inferredHeading && inferredHeading !== lastHeading) {
      items.push({ kind: "synthetic-heading", text: inferredHeading });
      lastHeading = inferredHeading;
    }
    items.push({ kind: "table", table });
  };

  const pushImage = (image: NormalizableImage) => {
    const pairedCaption = captions.find((item) => item.imageId === image.id)?.text ?? "";
    items.push({ kind: "image", image, caption: pairedCaption });
  };

  const pushArtifactsBefore = (y: number) => {
    while (tableIndex < tables.length) {
      const table = tables[tableIndex];
      const box = table.boundingBox ?? { x: page.width * 0.08, y: page.height * 0.52, width: page.width * 0.84, height: page.height * 0.12 };
      if (box.y + Math.max(8, box.height * 0.08) < y) {
        pushTable(table);
        tableIndex += 1;
        continue;
      }
      break;
    }

    while (imageIndex < sortedImages.length) {
      const image = sortedImages[imageIndex];
      if (image.boundingBox.y < y) {
        pushImage(image);
        imageIndex += 1;
        continue;
      }
      break;
    }
  };

  for (const block of textBlocks) {
    pushArtifactsBefore(block.boundingBox.y);

    const normalizedBlock = { ...block, text: normalizeTechnicalText(block.text) };
    if (isSectionHeading(normalizedBlock.text)) lastHeading = normalizedBlock.text.trim().toUpperCase();
    items.push({ kind: "text", block: normalizedBlock });
  }

  pushArtifactsBefore(Number.POSITIVE_INFINITY);

  return items;
}

function createImageNodes(page: NormalizablePage, image: NormalizableImage, pairedCaption: string) {
  const caption = pairedCaption ? normalizeTechnicalText(pairedCaption) : `Extracted image page ${page.pageNumber}`;
  const nodes: Array<Record<string, unknown>> = [{
    type: "image",
    attrs: {
      src: `/api/projects/${getProjectIdFromStorageKey(image.storageKey)}/artifacts/pages/${page.pageNumber}/images/${encodeURIComponent(image.id)}`,
      alt: caption,
      title: caption,
      width: Math.min(image.width, 560)
    }
  }];
  if (pairedCaption) nodes.push({ type: "paragraph", attrs: { class: "image-caption", sourceImageId: image.id }, content: [{ type: "text", text: caption }] });
  return nodes;
}

function compareImages(left: NormalizableImage, right: NormalizableImage) {
  return left.boundingBox.y - right.boundingBox.y || left.boundingBox.x - right.boundingBox.x;
}

function splitMergedHeadingText(text: string) {
  const normalized = text.trim();
  const headingPattern = SECTION_HEADING_ORDER.map((heading) => escapeRegExp(heading)).join("|");
  const match = normalized.match(new RegExp("^(" + headingPattern + ")\\s+(.+)$", "i"));
  if (!match?.[1] || !match[2]) return null;
  return { heading: match[1].toUpperCase(), body: match[2].trim() };
}

function splitKnownHeadingSequence(text: string) {
  let remaining = normalizeTechnicalText(text).trim();
  const nodes: Array<Record<string, unknown>> = [];
  let guard = 0;
  while (remaining && guard < 20) {
    guard += 1;
    const heading = findLeadingSectionHeading(remaining);
    if (!heading) break;
    nodes.push(createHeadingNode(heading));
    remaining = remaining.slice(heading.length).trim();
  }
  return nodes.length > 1 && !remaining ? nodes : null;
}

function findLeadingSectionHeading(text: string) {
  const upper = text.trim().toUpperCase();
  return [...SECTION_HEADING_ORDER]
    .sort((left, right) => right.length - left.length)
    .find((heading) => upper === heading || upper.startsWith(heading + " ")) ?? "";
}

function isNoteText(value: string) {
  return /^Note\s*[1-9]\b/i.test(value.trim());
}

function inferTableHeadingFromRows(table: NormalizableTable) {
  const rows = cleanTableRows(table.rows);
  const text = normalizeTechnicalText(rows.flatMap((row) => row.map((cell) => cell.text.trim())).join(" ")).toUpperCase();
  if (!text) return "";
  if (/ABSOLUTE|RATING|STORAGE|POWER DISSIPATION|JUNCTION TEMPERATURE/.test(text)) return "ABSOLUTE MAXIMUM RATINGS";
  if (/RECOMMENDED|OPERATING CONDITIONS|INPUT VOLTAGE|AMBIENT TEMPERATURE/.test(text)) return "RECOMMENDED OPERATING CONDITIONS";
  if (/PAD|COORDINATE|LOCATION|X\s+Y|BOND PAD/.test(text)) return "PAD LOCATION AND COORDINATES";
  if (/ASSEMBLY|SUBSTRATE|DIE ATTACH|WIRE BOND|BACKSIDE/.test(text)) return "ASSEMBLY CHARACTERISTICS";
  if (/MIN|TYP|MAX|TEST CONDITIONS|OUTPUT VOLTAGE|GROUND CURRENT|DROPOUT|FLAG OUTPUT|ENABLE INPUT/.test(text)) return "ELECTRICAL CHARACTERISTICS";
  return "";
}

function cleanTableRows(rows: NormalizableTableCell[][]) {
  const compactRows = rows
    .map((row) => row.map((cell) => ({ ...cell, text: normalizeTechnicalText(cell.text.replace(/\s*\n\s*/g, " ").trim()) })))
    .filter((row) => row.some((cell) => cell.text.length > 0));
  const maxColumns = Math.max(0, ...compactRows.map((row) => row.length));
  const nonEmptyColumns = Array.from({ length: maxColumns }, (_value, index) => index)
    .filter((columnIndex) => compactRows.some((row) => (row[columnIndex]?.text ?? "").trim().length > 0));
  return compactRows.map((row) => nonEmptyColumns.map((columnIndex) => row[columnIndex] ?? { text: "" }));
}

function createHeadingNode(text: string, level = 2): Record<string, unknown> {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function attachLooseNotesToElectricalCharacteristics(known: Map<string, Array<Record<string, unknown>>>) {
  const electrical = known.get("ELECTRICAL CHARACTERISTICS");
  if (!electrical?.length) return;

  for (const [heading, nodes] of known.entries()) {
    if (heading === "ELECTRICAL CHARACTERISTICS" || nodes.length <= 1) continue;
    const moved = nodes.slice(1).filter((node) => isNoteText(nodePlainText(node)));
    if (moved.length === 0) continue;
    known.set(heading, [nodes[0], ...nodes.slice(1).filter((node) => !isNoteText(nodePlainText(node)))]);
    known.set("ELECTRICAL CHARACTERISTICS", [...electrical, ...moved]);
  }
}

function compareTables(left: NormalizableTable, right: NormalizableTable) {
  const leftBox = left.boundingBox ?? { x: 0, y: Number.MAX_SAFE_INTEGER };
  const rightBox = right.boundingBox ?? { x: 0, y: Number.MAX_SAFE_INTEGER };
  return leftBox.y - rightBox.y || leftBox.x - rightBox.x;
}

function orderTextBlocksForPage(page: NormalizablePage) {
  const bodyBlocks = page.textBlocks.filter((block) => pageRegion(page, block.boundingBox) === "body");
  if (!isTwoColumnLayout(page, bodyBlocks)) return [...page.textBlocks].sort(compareBlocks);

  return [...page.textBlocks].sort((a, b) => {
    const aBucket = blockBucket(page, a);
    const bBucket = blockBucket(page, b);
    if (aBucket !== bBucket) return aBucket - bBucket;
    return compareBlocks(a, b);
  });
}

function blockBucket(page: NormalizablePage, block: NormalizableTextBlock) {
  const region = pageRegion(page, block.boundingBox);
  if (region === "header") return 0;
  if (region === "footer") return 4;
  if (isWideBlock(page, block.boundingBox)) return 1;
  return block.boundingBox.x + block.boundingBox.width / 2 < page.width / 2 ? 2 : 3;
}

function isTwoColumnLayout(page: NormalizablePage, blocks: NormalizableTextBlock[]) {
  const narrow = blocks.filter((block) => !isWideBlock(page, block.boundingBox));
  const left = narrow.filter((block) => block.boundingBox.x + block.boundingBox.width / 2 < page.width / 2);
  const right = narrow.filter((block) => block.boundingBox.x + block.boundingBox.width / 2 >= page.width / 2);
  return left.length >= 3 && right.length >= 3;
}

function isWideBlock(page: NormalizablePage, box: BoundingBox) {
  const left = box.x;
  const right = box.x + box.width;
  return box.width >= page.width * 0.62 || (left < page.width * 0.45 && right > page.width * 0.55);
}

function compareBlocks(a: NormalizableTextBlock, b: NormalizableTextBlock) {
  return (a.readingOrderIndex ?? 0) - (b.readingOrderIndex ?? 0) || a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x;
}

function pairFigureCaptions(blocks: NormalizableTextBlock[], images: NormalizableImage[]) {
  const candidates = blocks.filter((block) => isLikelyCaption(block.text)).map((block) => ({ id: block.id, text: block.text.trim(), block } satisfies CaptionCandidate));
  const used = new Set<string>();
  return images.flatMap((image) => {
    const imageBottom = image.boundingBox.y + image.boundingBox.height;
    const match = candidates
      .filter((candidate) => !used.has(candidate.id) && Math.abs(candidate.block.boundingBox.y - imageBottom) <= 120)
      .sort((a, b) => distanceToImage(image, a.block) - distanceToImage(image, b.block))[0];
    if (!match) return [];
    used.add(match.id);
    return [{ imageId: image.id, text: match.text, block: match.block }];
  });
}

function distanceToImage(image: NormalizableImage, block: NormalizableTextBlock) {
  return Math.abs((image.boundingBox.y + image.boundingBox.height) - block.boundingBox.y) + Math.abs((image.boundingBox.x + image.boundingBox.width / 2) - (block.boundingBox.x + block.boundingBox.width / 2));
}

function textCleanupItem(item: ClassifiedText): CleanupItem {
  return {
    id: `text:${item.block.pageNumber}:${item.block.id}`,
    sourceId: item.block.id,
    itemType: "text",
    pageNumber: item.block.pageNumber,
    text: item.block.text,
    boundingBox: item.block.boundingBox,
    confidence: item.confidence,
    reasons: item.reasons,
    decision: item.decision
  };
}

function imageCleanupItem(item: ClassifiedImage): CleanupItem {
  return {
    id: `image:${item.image.pageNumber}:${item.image.id}`,
    sourceId: item.image.id,
    itemType: "image",
    pageNumber: item.image.pageNumber,
    storageKey: item.image.storageKey,
    boundingBox: item.image.boundingBox,
    confidence: item.confidence,
    reasons: item.reasons,
    decision: item.decision
  };
}

function repeatedTextFrequency(pages: NormalizablePage[]) {
  const map = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const block of page.textBlocks) {
      const normalized = normalizeText(block.text);
      if (!normalized || normalized.length < 2) continue;
      const pagesForText = map.get(normalized) ?? new Set<number>();
      pagesForText.add(page.pageNumber);
      map.set(normalized, pagesForText);
    }
  }
  return new Map(Array.from(map.entries()).map(([key, value]) => [key, value.size]));
}

function repeatedImageFrequency(pages: NormalizablePage[]) {
  const map = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const image of page.images) {
      const signature = imageSignature(image, pageRegion(page, image.boundingBox));
      const pagesForImage = map.get(signature) ?? new Set<number>();
      pagesForImage.add(page.pageNumber);
      map.set(signature, pagesForImage);
    }
  }
  return new Map(Array.from(map.entries()).map(([key, value]) => [key, value.size]));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[\d]+/g, "#").trim();
}

function findPage(pages: NormalizablePage[], pageNumber: number) {
  return pages.find((page) => page.pageNumber === pageNumber) ?? pages[0] ?? { pageNumber, width: 595, height: 842, textBlocks: [], images: [], tables: [] };
}

function pageRegion(page: NormalizablePage, box: BoundingBox): "header" | "footer" | "body" {
  const centerY = box.y + box.height / 2;
  if (centerY <= page.height * HEADER_RATIO) return "header";
  if (centerY >= page.height * (1 - FOOTER_RATIO)) return "footer";
  return "body";
}

function isBodyRegion(page: NormalizablePage, box: BoundingBox) {
  return pageRegion(page, box) === "body";
}

function imageSignature(image: NormalizableImage, region: string) {
  const widthBucket = Math.round(image.width / 25) * 25;
  const heightBucket = Math.round(image.height / 25) * 25;
  const xBucket = Math.round(image.boundingBox.x / 20) * 20;
  return `${region}:${widthBucket}x${heightBucket}:x${xBucket}`;
}

function isPageNumber(value: string) {
  return /^(page\s*)?\d+(\s*\/\s*\d+)?$/i.test(value.trim());
}

function hasUrl(value: string) {
  return /(?:https?:\/\/|www\.|\.com|\.in|\.org|\.net)/i.test(value);
}

function hasRevisionOrDate(value: string) {
  return /\b(?:rev\.?|revision|copyright|\u00a9|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Z][a-z]{2,}\s+\d{4})\b/i.test(value);
}

function isDocumentStatusText(value: string) {
  return /^(?:\(?preliminary\s+datasheet\)?|\(?final\s+datasheet\)?|\(?preliminary\)?|\(?datasheet\)?)$/i.test(value.trim());
}

function splitBulletItems(value: string) {
  const text = value.trim();
  if (/^(?:[-*]|\u2022)\s+/.test(text)) return text.split(/\s+(?=(?:[-*]|\u2022)\s+)/).map((item) => item.replace(/^(?:[-*]|\u2022)\s+/, "").trim()).filter(Boolean);
  const inline = text.split(/\s*\u2022\s*/).map((item) => item.trim()).filter(Boolean);
  if (inline.length > 1) return inline;
  return [];
}

function isLikelyHeading(block: NormalizableTextBlock) {
  const text = normalizeTechnicalText(block.text.trim());
  if (!text || text.length > 100) return false;
  if (isSectionHeading(text)) return true;
  if (isNoteText(text)) return false;
  const alpha = text.replace(/[^A-Za-z]/g, "");
  const uppercaseRatio = alpha.length ? alpha.replace(/[^A-Z]/g, "").length / alpha.length : 0;
  const wordCount = text.split(/\s+/).length;
  const standalone = block.boundingBox.width <= 420 || wordCount <= 8;
  return block.type === "heading" || (standalone && uppercaseRatio > 0.72) || (standalone && (block.fontSize ?? 0) >= 14) || /bold|semibold/i.test(block.fontWeight ?? "");
}

function isSectionHeading(value: string) {
  return SECTION_HEADING_WORDS.has(value.trim().toUpperCase());
}

function reorderKnownSections(nodes: Array<Record<string, unknown>>) {
  const preamble: Array<Record<string, unknown>> = [];
  const sections: Array<{ heading: string; nodes: Array<Record<string, unknown>> }> = [];
  let currentSection: { heading: string; nodes: Array<Record<string, unknown>> } | null = null;

  for (const node of nodes) {
    const heading = sectionHeadingForNode(node);
    if (heading) {
      if (currentSection) sections.push(currentSection);
      currentSection = { heading, nodes: [node] };
      continue;
    }
    if (currentSection) currentSection.nodes.push(node);
    else preamble.push(node);
  }
  if (currentSection) sections.push(currentSection);

  if (sections.length === 0) return nodes;

  const known = new Map<string, Array<Record<string, unknown>>>();
  const unknown: Array<Array<Record<string, unknown>>> = [];
  for (const section of sections) {
    if (!SECTION_HEADING_WORDS.has(section.heading)) {
      unknown.push(section.nodes);
      continue;
    }
    const existing = known.get(section.heading) ?? [];
    existing.push(...(existing.length > 0 ? section.nodes.slice(1) : section.nodes));
    known.set(section.heading, existing);
  }

  repairSectionAssignments(known);
  normalizeSectionListContent(known);

  const ordered: Array<Record<string, unknown>> = [...preamble];
  for (const heading of SECTION_HEADING_ORDER) {
    const sectionNodes = known.get(heading);
    if (!sectionNodes?.length) continue;
    ordered.push(...sectionNodes);
  }
  for (const sectionNodes of unknown) ordered.push(...sectionNodes);
  return ordered;
}

function repairSectionAssignments(known: Map<string, Array<Record<string, unknown>>>) {
  moveMismatchedSectionNodes(
    known,
    "ADJUSTABLE REGULATOR DESIGN",
    "ERROR FLAG",
    (text) => /\b(error flag|over[-\s]?current fault|out of regulation|flag output|output low)\b/i.test(text),
  );
  moveMismatchedSectionNodes(
    known,
    "ERROR FLAG",
    "ADJUSTABLE REGULATOR DESIGN",
    (text) => /\b(r\s*1|r\s*2|vout|desired output voltage|resistor|adjustable regulator)\b/i.test(text),
  );
  moveMismatchedSectionNodes(
    known,
    "ADJUSTABLE REGULATOR DESIGN",
    "ENABLE INPUT",
    (text) => /\b(enable input|shutdown pin|enable threshold|ven|ien)\b/i.test(text),
  );
  moveMismatchedSectionNodes(
    known,
    "PAD LOCATION AND COORDINATES",
    "BLOCK DIAGRAM",
    (text) => /\b(block diagram|error amplifier|pass transistor|reference|enable input)\b/i.test(text),
  );
  moveMismatchedSectionNodes(
    known,
    "ELECTRICAL CHARACTERISTICS",
    "ASSEMBLY CHARACTERISTICS",
    (text) => /\b(assembly|substrate|die attach|wire bond|backside|process)\b/i.test(text),
  );
  moveMismatchedSectionNodes(
    known,
    "ELECTRICAL CHARACTERISTICS",
    "PAD LOCATION AND COORDINATES",
    (text) => /\b(pad location|coordinates|bond pad|pad\s+number)\b/i.test(text),
  );
  attachLooseNotesToElectricalCharacteristics(known);
}

function normalizeSectionListContent(known: Map<string, Array<Record<string, unknown>>>) {
  for (const heading of ["FEATURES", "APPLICATIONS"] as const) {
    const nodes = known.get(heading);
    if (!nodes?.length) continue;
    const retained: Array<Record<string, unknown>> = [nodes[0]];
    const listItems: string[] = [];
    const flushList = () => {
      if (listItems.length > 0) retained.push(createBulletListNode(listItems.splice(0, listItems.length)));
    };

    for (const node of nodes.slice(1)) {
      const text = nodePlainText(node);
      if (!text) continue;
      if (String(node.type ?? "") === "bulletList") {
        for (const item of extractListItemTexts(node)) {
          const parts = splitFigureCaptionFromText(item);
          if (parts.before) {
            const normalized = normalizeTechnicalText(parts.before);
            if (normalized && !isSectionHeading(normalized)) {
              listItems.push(normalized);
            }
          }
          if (parts.caption) {
            flushList();
            retained.push(createCaptionParagraph(parts.caption));
          }
        }
        continue;
      }
      if (String(node.type ?? "") === "paragraph") {
        const parts = splitFigureCaptionFromText(text);
        if (parts.before) addCompactListText(listItems, parts.before);
        if (parts.caption) {
          flushList();
          retained.push(createCaptionParagraph(parts.caption));
        }
        continue;
      }
      flushList();
      retained.push(node);
    }
    flushList();
    known.set(heading, retained);
  }
}

function splitFigureCaptionFromText(text: string) {
  const normalized = normalizeTechnicalText(text);
  const match = normalized.match(/\b(?:Figure|Fig\.)\s*\d+\s*\./i);
  if (!match || match.index === undefined) return { before: normalized, caption: "" };
  return { before: normalized.slice(0, match.index).trim(), caption: normalized.slice(match.index).trim() };
}

function createCaptionParagraph(text: string): Record<string, unknown> {
  return { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: normalizeTechnicalText(text) }] };
}

function addCompactListText(items: string[], text: string) {
  const normalized = normalizeTechnicalText(text);
  if (!normalized || isSectionHeading(normalized)) return;
  const previous = items[items.length - 1];
  if (previous && shouldMergeWrappedListItem(previous, normalized)) {
    items[items.length - 1] = previous + " " + normalized;
    return;
  }
  items.push(normalized);
}

function shouldMergeWrappedListItem(previous: string, next: string) {
  const words = next.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return true;
  if (/^[a-z]/.test(next)) return true;
  if (/\b(with|for|to|and|or|of|in|at|by|from|with|without|through|during|including)$/i.test(previous)) return true;
  if (/[-,\/]$/.test(previous)) return true;
  return false;
}

function createBulletListNode(items: string[]): Record<string, unknown> {
  return {
    type: "bulletList",
    content: items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] }))
  };
}

function extractListItemTexts(node: Record<string, unknown>) {
  const content = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : [];
  return content.map((item) => nodePlainText(item)).filter(Boolean);
}

function moveMismatchedSectionNodes(
  known: Map<string, Array<Record<string, unknown>>>,
  sourceHeading: string,
  targetHeading: string,
  predicate: (text: string) => boolean,
) {
  const source = known.get(sourceHeading);
  const target = known.get(targetHeading);
  if (!source?.length || !target?.length) return;

  const moved: Array<Record<string, unknown>> = [];
  const retained: Array<Record<string, unknown>> = [];
  for (let index = 0; index < source.length; index += 1) {
    const node = source[index];
    if (index === 0) {
      retained.push(node);
      continue;
    }
    const text = nodePlainText(node);
    if (text && predicate(text)) moved.push(node);
    else retained.push(node);
  }
  if (moved.length === 0) return;
  known.set(sourceHeading, retained);
  known.set(targetHeading, [target[0], ...moved, ...target.slice(1)]);
}

function sectionHeadingForNode(node: Record<string, unknown>) {
  if (String(node.type ?? "") !== "heading") return "";
  const text = nodePlainText(node).toUpperCase();
  return SECTION_HEADING_WORDS.has(text) ? text : "";
}

function nodePlainText(node: Record<string, unknown>): string {
  const type = String(node.type ?? "");
  if (type === "text") return String(node.text ?? "").trim();
  const content = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : [];
  return content.map((child) => nodePlainText(child)).join(" ").replace(/\s+/g, " ").trim();
}

function finalizeEditorContent(nodes: Array<Record<string, unknown>>) {
  const result: Array<Record<string, unknown>> = [];
  let previousHeading = "";
  for (const node of nodes) {
    const text = nodePlainText(node);
    if (/^Image from source page \d+$/i.test(text)) continue;
    const heading = sectionHeadingForNode(node);
    if (heading) {
      if (heading === previousHeading) continue;
      previousHeading = heading;
      result.push(node);
      continue;
    }
    if (text) previousHeading = "";
    result.push(node);
  }
  return result;
}

export function analyzeEditorContentQuality(editorJson: TiptapJson): DatasheetContentQualitySummary {
  const content = Array.isArray(editorJson.content) ? editorJson.content as Array<Record<string, unknown>> : [];
  const headings = content.map((node) => sectionHeadingForNode(node)).filter(Boolean);
  const texts = content.map((node) => nodePlainText(node)).filter(Boolean);
  const warnings = new Set(collectTextQualityWarnings({ texts, headings }));
  for (let index = 0; index < headings.length - 1; index += 1) {
    if (headings[index] === headings[index + 1]) warnings.add("Duplicated heading: " + headings[index]);
  }
  if (texts.some((text) => /^Image from source page \d+$/i.test(text))) warnings.add("Placeholder image text found");
  const listItems = content.flatMap((node) => String(node.type ?? "") === "bulletList" ? extractListItemTexts(node) : []);
  if (content.some((node) => String(node.type ?? "") === "bulletList" && extractListItemTexts(node).some((item) => isSectionHeading(item)))) warnings.add("Heading converted to bullet");
  if (listItems.some((item) => /\b(?:Figure|Fig\.)\s*\d+\s*\./i.test(item))) warnings.add("Figure caption merged into list item");
  if (sectionContainsText(content, "ELECTRICAL CHARACTERISTICS", /\b(assembly|die attach|wire bond|substrate)\b/i)) warnings.add("Assembly table inside electrical section");
  const unresolvedSymbolsCount = texts.filter((text) => /[\uF044\uF071]|�|�|�|�/.test(text)).length;
  return {
    sectionsDetected: new Set(headings).size,
    tablesDetected: content.filter((node) => String(node.type ?? "") === "table").length,
    figuresDetected: content.filter((node) => String(node.type ?? "") === "image").length,
    warnings: Array.from(warnings),
    warningsCount: warnings.size,
    unresolvedSymbolsCount
  };
}

function sectionContainsText(nodes: Array<Record<string, unknown>>, section: string, pattern: RegExp) {
  let active = "";
  for (const node of nodes) {
    const heading = sectionHeadingForNode(node);
    if (heading) active = heading;
    else if (active === section && pattern.test(nodePlainText(node))) return true;
  }
  return false;
}

function headingLevel(block: NormalizableTextBlock) {
  return (block.fontSize ?? 0) >= 18 ? 1 : 2;
}

function isLikelyCaption(value: string) {
  return /^(figure|fig\.|table)\s+\d+/i.test(value.trim());
}

function isReliableTable(table: NormalizableTable) {
  if ((table.confidence ?? 0.7) < 0.6 || table.rows.length < 2) return false;
  const columnCounts = table.rows.map((row) => row.length);
  const expected = columnCounts[0] ?? 0;
  if (expected < 2) return false;
  return columnCounts.every((count) => Math.abs(count - expected) <= 1);
}

function isHeaderLikeRow(row: NormalizableTableCell[]) {
  const joined = row.map((cell) => cell.text.trim()).join(" ");
  if (!joined) return false;
  const alpha = joined.replace(/[^A-Za-z]/g, "");
  const uppercaseRatio = alpha.length ? alpha.replace(/[^A-Z]/g, "").length / alpha.length : 0;
  return uppercaseRatio > 0.55 || row.every((cell) => cell.text.trim().length > 0 && cell.text.trim().length < 18);
}

function overlaps(a: BoundingBox, b: BoundingBox, threshold = 0.12) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = xOverlap * yOverlap;
  if (overlapArea === 0) return false;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return overlapArea / smallerArea >= threshold;
}

function getProjectIdFromStorageKey(storageKey: string) {
  return storageKey.match(/projects\/([^/]+)/)?.[1] ?? "unknown";
}

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

export type NormalizedDatasheet = {
  pages: NormalizablePage[];
  cleanupReport: SourceCleanupReport;
  editorJson: TiptapJson;
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

  return {
    pages,
    cleanupReport,
    editorJson: convertToTiptapJson(pages, removedTextIds, removedImageIds),
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

    for (const block of textBlocks) appendTextBlock(content, block);
    for (const table of page.tables) appendTable(content, table);

    for (const image of page.images.filter((item) => !removedImageIds.has(item.id) && isBodyRegion(page, item.boundingBox))) {
      const pairedCaption = captionSelections.find((item) => item.imageId === image.id)?.text;
      const caption = pairedCaption ?? `Image from source page ${page.pageNumber}`;
      content.push({
        type: "image",
        attrs: {
          src: `/api/projects/${getProjectIdFromStorageKey(image.storageKey)}/artifacts/pages/${page.pageNumber}/images/${encodeURIComponent(image.id)}`,
          alt: caption,
          title: caption,
          width: Math.min(image.width, 560)
        }
      });
      content.push({ type: "paragraph", attrs: { class: "image-caption", sourceImageId: image.id }, content: [{ type: "text", text: caption }] });
    }
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph", content: [{ type: "text", text: "Editable datasheet draft" }] }] };
}

function appendTextBlock(content: Array<Record<string, unknown>>, block: NormalizableTextBlock) {
  const text = block.text.trim();
  if (!text || isLikelyCaption(text) || isDocumentStatusText(text)) return;

  const bulletItems = splitBulletItems(text);
  if (bulletItems.length > 0) {
    content.push({
      type: "bulletList",
      content: bulletItems.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item }] }] }))
    });
    return;
  }

  if (isLikelyHeading(block)) {
    content.push({ type: "heading", attrs: { level: headingLevel(block) }, content: [{ type: "text", text }] });
    return;
  }

  content.push({ type: "paragraph", content: [{ type: "text", text }] });
}

function appendTable(content: Array<Record<string, unknown>>, table: NormalizableTable) {
  if (!isReliableTable(table)) {
    content.push({ type: "paragraph", attrs: { class: "table-review", sourceTableId: table.id }, content: [{ type: "text", text: "Table extraction needs review" }] });
    const fallback = table.rows.flatMap((row) => row.map((cell) => cell.text.trim()).filter(Boolean)).join(" | ");
    if (fallback) content.push({ type: "paragraph", attrs: { class: "table-review-text", sourceTableId: table.id }, content: [{ type: "text", text: fallback }] });
    return;
  }

  const hasHeader = isHeaderLikeRow(table.rows[0] ?? []);
  content.push({
    type: "table",
    content: table.rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: hasHeader && rowIndex === 0 ? "tableHeader" : "tableCell",
        attrs: { colspan: cell.colSpan ?? 1, rowspan: cell.rowSpan ?? 1 },
        content: [{ type: "paragraph", content: cell.text ? [{ type: "text", text: cell.text }] : [] }]
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
      if (overlaps(block.boundingBox, tableBox, 0.18)) ids.add(block.id);
    }
  }
  return ids;
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
  const text = block.text.trim();
  if (!text || text.length > 100) return false;
  if (isSectionHeading(text)) return true;
  const alpha = text.replace(/[^A-Za-z]/g, "");
  const uppercaseRatio = alpha.length ? alpha.replace(/[^A-Z]/g, "").length / alpha.length : 0;
  const wordCount = text.split(/\s+/).length;
  const standalone = block.boundingBox.width <= 420 || wordCount <= 8;
  return block.type === "heading" || (standalone && uppercaseRatio > 0.72) || (standalone && (block.fontSize ?? 0) >= 14) || /bold|semibold/i.test(block.fontWeight ?? "");
}

function isSectionHeading(value: string) {
  return SECTION_HEADING_WORDS.has(value.trim().toUpperCase());
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

import type { TiptapJson } from "@/server/datasheet/schema";
import { normalizeTechnicalText, type DatasheetLayoutDensity, type DatasheetLayoutMode } from "@/server/datasheet/technical-text";

export type ExportTemplateSnapshot = {
  logoAssetPath: string;
  companyName: string;
  website: string;
  productCode: string;
  productTitle: string;
  documentStatus: string;
  revision: string;
  layoutMode: DatasheetLayoutMode;
  layoutDensity: DatasheetLayoutDensity;
  pageFillStrategy: "safe" | "balanced" | "aggressive";
  primaryColor: string;
  accentColor: string;
};

export type ExportDocumentSnapshot = {
  title: string;
  productCode: string;
  productCategory: string;
  editorJson: TiptapJson;
};

export type ExportRenderMode = "pdf" | "preview";

type ExportBlockRole = "paragraph" | "heading" | "list" | "table" | "image" | "caption" | "figure" | "rule" | "generic";

type HtmlBlock = {
  kind: "html";
  role: Exclude<ExportBlockRole, "table">;
  html: string;
  estimatedHeight: number;
  keepWithNext?: boolean;
  meaningful?: boolean;
  plainText?: string;
  imageKey?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  aspectRatio?: number | null;
  columnEligible?: boolean;
  fullWidth?: boolean;
  displaySize?: ImageDisplaySize;
  variantClass?: string;
  blockClass?: string;
};

type TableBlock = {
  kind: "table";
  role: "table";
  estimatedHeight: number;
  meaningful?: boolean;
  headerHtml: string;
  rowHtml: string[];
  rowHeights: number[];
  plainText?: string;
  variantClass: string;
};

type BreakBlock = { kind: "break"; estimatedHeight: 0; meaningful?: false };

export type ExportBlock = HtmlBlock | TableBlock | BreakBlock;
export type ExportPage = { blocks: ExportBlock[]; usedHeight: number; locked?: boolean };
export type ExportPageModel = { title: string; productCode: string; logoSrc: string; pages: ExportPage[] };

type ImageDisplaySize = "small" | "medium" | "full";
type ImageMeta = { src: string; alt: string; width: number | null; height: number | null; aspectRatio: number | null; imageKey: string; variantClass: string; displaySize: ImageDisplaySize };

const PAGE_BODY_CAPACITY = 240;
const PAGE_BODY_CAPACITY_DENSE = 264;
const PAGE_BODY_IMAGE_MAX = 152;
const PAGE_BODY_IMAGE_MAX_DENSE = 138;
const IMAGE_MAX_WIDTH = 158;
const COLUMN_IMAGE_MAX_WIDTH = 80;
const TABLE_SEGMENT_TARGET_HEIGHT = 136;
const TABLE_SEGMENT_TARGET_HEIGHT_DENSE = 156;
const MAX_TABLE_SEGMENT_HEIGHT = 152;
const MAX_TABLE_SEGMENT_HEIGHT_DENSE = 170;
const MIN_TABLE_ROWS_PER_SEGMENT = 2;
const FILL_TARGET_MIDDLE_PAGE = 0.82;
const FILL_RETRY_THRESHOLD = 0.75;
const MIN_FILL_REMAINING_THRESHOLD = 12;
const FIRST_PAGE_PULL_FORWARD_TARGET = 0.9;
const MIDDLE_PAGE_PULL_FORWARD_TARGET = 0.82;
const KNOWN_HEADING_PREFIXES = ["RECOMMENDED OPERATING CONDITIONS", "ABSOLUTE MAXIMUM RATINGS", "ELECTRICAL CHARACTERISTICS", "ADJUSTABLE REGULATOR DESIGN", "ERROR FLAG", "ENABLE INPUT", "PAD LOCATION AND COORDINATES", "ASSEMBLY CHARACTERISTICS", "APPLICATION INFORMATION", "CAPACITOR REQUIREMENTS", "MINIMUM LOAD CURRENT", "TYPICAL APPLICATION", "GENERAL DESCRIPTION", "PIN CONFIGURATION", "BONDING DIAGRAM", "ADDITIONAL INFORMATION", "THERMAL DESIGN", "BLOCK DIAGRAM", "APPLICATIONS", "PINOUT", "FEATURES"];

type RenderLayoutOptions = { layoutMode: DatasheetLayoutMode; layoutDensity: DatasheetLayoutDensity };
type PaginationDebugEntry = { pageNumber: number; usedHeight: number; fillPercentage: number; remainingHeight: number; blocksPlaced: string[]; blocksSplit: string[]; blocksShrunk: string[]; finalizedBecause: string; nextBlockReason: string; underfilled: boolean; figureShrinkAttempted: boolean; pullForwardAttempted: boolean; pullForwardMoved: string[] };

export function renderDatasheetExportHtml(params: { document: ExportDocumentSnapshot; template: ExportTemplateSnapshot }, options: { mode?: ExportRenderMode } = {}) {
  return renderExportDocumentHtml(buildExportPageModel(params), params.template, options);
}

let lastPaginationDebugReport: PaginationDebugEntry[] = [];

export function buildExportPageModel(params: { document: ExportDocumentSnapshot; template: ExportTemplateSnapshot }): ExportPageModel {
  const title = params.template.productTitle || params.document.productCategory || params.document.title;
  const productCode = params.template.productCode || params.document.productCode;
  const logoSrc = params.template.logoAssetPath || "/branding/vellore-semicon-logo.svg";
  const layoutOptions: RenderLayoutOptions = {
    layoutMode: params.template.layoutMode,
    layoutDensity: params.template.layoutDensity,
  };
  const blocks = renderTiptapNodesToExportBlocks(params.document.editorJson.content ?? [], layoutOptions);
  const pageCapacity = resolvePageCapacity(layoutOptions);
  const paginatedPages = paginateExportBlocks(blocks, pageCapacity);
  const rebalancedPages = layoutOptions.layoutMode === "single-column"
    ? paginatedPages
    : rebalanceVisualUnderfillPages(paginatedPages, pageCapacity, layoutOptions);
  const pages = finalizeExportPages(rebalancedPages.map((page) => ({
    ...page,
    usedHeight: roundHeight(estimateRenderedPageHeight(page.blocks, layoutOptions)),
  })), pageCapacity);
  if (process.env.DEBUG_EXPORT_LAYOUT === "1") console.info("[export-layout]", lastPaginationDebugReport);
  return { title, productCode, logoSrc, pages };
}

export function renderExportDocumentHtml(pageModel: ExportPageModel, template: ExportTemplateSnapshot, options: { mode?: ExportRenderMode } = {}) {
  const mode = options.mode ?? "pdf";
  const totalPages = pageModel.pages.length;
  const debugMarker =
    process.env.DEBUG_EXPORT_LAYOUT === "1" && mode === "preview"
      ? `<!-- PHASE_7B_FILL_FORWARD_ACTIVE pages=${totalPages} -->`
      : "";
  return `<!doctype html>${debugMarker}<html lang="en" class="export-mode-${mode}"><head><meta charset="utf-8" /><title>${escapeHtml(pageModel.title || "Vellore Semicon Datasheet")}</title><style>
  @page { size: A4 portrait; margin: 0; } * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #1f2933; font-family: "Segoe UI", Arial, "Noto Sans", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", Helvetica, sans-serif; font-size: 10pt; line-height: 1.42; }
  html.export-mode-pdf, body.export-mode-pdf { width: 210mm; background: #ffffff; } html.export-mode-preview, body.export-mode-preview { width: auto; background: #eef3f8; }
  body.export-mode-pdf { width: 210mm; padding: 0; } body.export-mode-preview { padding: 8mm 0; }
  .pdf-document { width: 210mm; } body.export-mode-pdf .pdf-document { margin: 0; } body.export-mode-preview .pdf-document { margin: 0 auto; }
  .pdf-page { width: 210mm; height: 297mm; padding: 10.4mm 11.8mm 10.2mm; background: white; position: relative; display: flex; flex-direction: column; flex: none; overflow: hidden; page-break-after: always; page-break-inside: avoid; break-after: page; break-inside: avoid-page; box-sizing: border-box; }
  body.export-mode-preview .pdf-page { box-shadow: 0 1mm 4mm rgba(15, 23, 42, 0.08); margin: 0 0 8mm; } body.export-mode-pdf .pdf-page { box-shadow: none; margin: 0; }
  .pdf-page:last-child { page-break-after: auto; break-after: auto; } body.export-mode-preview .pdf-page:last-child { margin-bottom: 0; }
  .pdf-header { flex: 0 0 21.2mm; height: 21.2mm; display: flex; flex-direction: column; gap: 0.65mm; overflow: hidden; } .header-top { display: grid; grid-template-columns: minmax(36mm, 1fr) minmax(64mm, 114mm); align-items: start; gap: 6.2mm; }
  .logo-wrap { min-width: 0; display: flex; align-items: flex-start; } .logo { display: block; width: 34mm; max-width: 100%; max-height: 8.6mm; object-fit: contain; object-position: left center; }
  .header-meta { min-width: 0; text-align: right; } .product-code { color: ${escapeCssColor(template.primaryColor)}; font-size: ${pageModel.productCode.length > 48 ? "7.1pt" : "7.9pt"}; font-style: italic; font-weight: 700; line-height: 1.2; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }
  .gradient-line { height: 1.02mm; background: linear-gradient(90deg, ${escapeCssColor(template.accentColor)}, ${escapeCssColor(template.primaryColor)}); } .thin-line { height: 0.28mm; background: linear-gradient(90deg, ${escapeCssColor(template.accentColor)}, ${escapeCssColor(template.primaryColor)}); }
  .product-title { color: ${escapeCssColor(template.primaryColor)}; font-size: ${pageModel.title.length > 38 ? "7.05pt" : "8.15pt"}; font-style: italic; font-weight: 700; line-height: 1.16; text-align: right; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }
  .pdf-body { flex: 1 1 auto; min-height: 0; height: 254.2mm; overflow: hidden; padding: 2.8mm 0 1.3mm; display: flex; flex-direction: column; gap: 0; } .pdf-body.layout-two-column { gap: 1.2mm; } .pdf-footer { flex: 0 0 10.4mm; height: 10.4mm; display: flex; flex-direction: column; justify-content: flex-end; color: #46505a; font-size: 7.2pt; overflow: hidden; }
  .footer-line { height: 0.24mm; margin-bottom: 1.1mm; background: ${escapeCssColor(template.primaryColor)}; } .footer-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 4mm; } .footer-center { text-align: center; } .footer-right { text-align: right; overflow-wrap: anywhere; word-break: break-word; }
  .page-body-block { break-inside: avoid; page-break-inside: avoid; flex: none; } .page-body-block.full-width-block { width: 100%; } .technical-columns { width: 100%; margin: 0; } .technical-columns-flow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 5.9mm; align-items: start; } .technical-column { min-width: 0; display: flex; flex-direction: column; align-self: start; } .column-flow-group { display: flex; flex-direction: column; gap: 0.55mm; break-inside: avoid; page-break-inside: avoid; } .column-flow-item { break-inside: avoid; page-break-inside: avoid; margin: 0 0 1.8mm; } .column-flow-item:last-child { margin-bottom: 0; } .column-flow-item > *:last-child { margin-bottom: 0; } .figure-block { display: flex; flex-direction: column; gap: 1mm; break-inside: avoid; page-break-inside: avoid; margin: 0 0 1.7mm; }
  .figure-heading { margin-bottom: 0; } .figure-caption { margin: 0; color: #5c6670; font-size: 6.6pt; line-height: 1.1; text-align: center; overflow-wrap: anywhere; }
  .figure-image-wrap { display: flex; justify-content: center; align-items: center; width: 100%; } .content-image { display: block; width: auto; max-width: 100%; max-height: 104mm; height: auto; margin: 0 auto 0.55mm; object-fit: contain; }
  .content-image.figure-image { margin-bottom: 0; } .figure-image-size-small { max-width: 38%; } .figure-image-size-medium { max-width: 62%; } .figure-image-size-full { width: 100%; max-width: 100%; } .figure-image.figure-image-normal { max-height: 88mm; } .figure-image.figure-image-wide, .figure-image.figure-image-full-width { width: 100%; max-height: 72mm; } .figure-image.figure-image-tall { max-height: 108mm; width: auto; }
  h1, h2, h3 { display: block; clear: both; color: ${escapeCssColor(template.primaryColor)}; line-height: 1.18; break-after: avoid; page-break-after: avoid; } h1 { margin: 0 0 3mm; font-size: 15.2pt; } h2 { margin: 0 0 2.1mm; font-size: 11.2pt; } h3 { margin: 0 0 1.55mm; font-size: 10pt; }
  p { margin: 0 0 1.95mm; } hr { border: 0; border-top: 1px solid #c8d0d8; margin: 1.1mm 0 1.8mm; } ul, ol { margin: 0 0 2mm 5mm; padding-left: 4.2mm; } li { margin: 0 0 0.7mm; } a { color: ${escapeCssColor(template.primaryColor)}; text-decoration: underline; } .technical-var { font-weight: 600; white-space: nowrap; }
  table { width: 100%; max-width: 100%; margin: 0 0 1.95mm; border-collapse: collapse; table-layout: fixed; font-size: 6.9pt; line-height: 1.12; } thead { display: table-header-group; } th, td { border: 1px solid #c8d0d8; padding: 1.35px 2.8px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; } th { background: #edf3f7; color: ${escapeCssColor(template.primaryColor)}; font-weight: 700; letter-spacing: 0.008em; } .technical-table td:first-child, .technical-table th:first-child { width: 36%; } .technical-table-dense { font-size: 6.25pt; line-height: 1.06; } .technical-table-dense td, .technical-table-dense th { padding: 0.95px 2px; }
  .table-block + .table-block { margin-top: 0.75mm; } .table-review, .table-review-text { border-left: 1mm solid ${escapeCssColor(template.accentColor)}; background: #f7f9fb; padding: 1.8mm 2.6mm; color: #56616b; } .page-break { margin: 0; } strong { font-weight: 700; } em { font-style: italic; } u { text-decoration: underline; } sub, sup { font-size: 70%; line-height: 0; } .pdf-body.layout-two-column.layout-density-technical-dense { padding: 1.3mm 0 0.9mm; gap: 0.5mm; font-size: 7.35pt; line-height: 1.14; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-columns-flow { gap: 3.2mm; } .pdf-body.layout-two-column.layout-density-technical-dense .column-flow-group { gap: 0.28mm; } .pdf-body.layout-two-column.layout-density-technical-dense .column-flow-item { margin: 0 0 0.55mm; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block { gap: 0.35mm; margin: 0 0 0.55mm; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-caption { font-size: 5.85pt; line-height: 1.05; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-wrap { justify-content: center; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-size-small { max-width: 74%; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-size-medium { max-width: 88%; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .content-image { max-height: 33mm; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-size-small.content-image { max-height: 27mm; } .pdf-body.layout-two-column.layout-density-technical-dense h1 { margin: 0 0 2.1mm; font-size: 12.8pt; } .pdf-body.layout-two-column.layout-density-technical-dense h2 { margin: 0 0 1.05mm; font-size: 9.35pt; } .pdf-body.layout-two-column.layout-density-technical-dense h3 { margin: 0 0 0.8mm; font-size: 8.45pt; } .pdf-body.layout-two-column.layout-density-technical-dense p { margin: 0 0 0.95mm; } .pdf-body.layout-two-column.layout-density-technical-dense ul, .pdf-body.layout-two-column.layout-density-technical-dense ol { margin: 0 0 0.95mm 4.2mm; padding-left: 3.8mm; } .pdf-body.layout-two-column.layout-density-technical-dense li { margin: 0 0 0.22mm; } .pdf-body.layout-two-column.layout-density-technical-dense hr { margin: 0.6mm 0 0.95mm; } .pdf-body.layout-two-column.layout-density-technical-dense table { margin: 0 0 0.95mm; font-size: 6.15pt; line-height: 1.08; } .pdf-body.layout-two-column.layout-density-technical-dense th, .pdf-body.layout-two-column.layout-density-technical-dense td { padding: 0.85px 2.1px; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense { font-size: 5.9pt; line-height: 1.04; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense td, .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense th { padding: 0.75px 1.8px; }
  </style></head><body class="export-mode-${mode}"><div class="pdf-document">${pageModel.pages.map((page, index) => renderExportPageHtml(page, index, totalPages, template, pageModel)).join("")}</div></body></html>`;
}

export function renderExportPageHtml(page: ExportPage, index: number, totalPages: number, template: ExportTemplateSnapshot, pageModel: Pick<ExportPageModel, "title" | "productCode" | "logoSrc">) {
  const pageNumber = index + 1;
  const estimatedCapacity = resolvePageCapacity({ layoutMode: template.layoutMode, layoutDensity: template.layoutDensity });
  const estimatedFill = estimatedCapacity > 0 ? roundHeight(page.usedHeight / estimatedCapacity) : 0;
  const estimatedRemaining = roundHeight(Math.max(estimatedCapacity - page.usedHeight, 0));
  return `<section class="pdf-page" data-page-number="${pageNumber}" data-total-pages="${totalPages}" data-estimated-used-height="${page.usedHeight}" data-estimated-fill="${estimatedFill}" data-estimated-remaining-height="${estimatedRemaining}"><header class="pdf-header"><div class="header-top"><div class="logo-wrap"><img class="logo" src="${escapeAttribute(pageModel.logoSrc)}" alt="${escapeAttribute(template.companyName || "Vellore Semicon")}" /></div><div class="header-meta"><div class="product-code">${escapeHtml(pageModel.productCode || "Product Code")}</div></div></div><div class="gradient-line"></div><div class="thin-line"></div><div class="product-title">${escapeHtml(pageModel.title || "Product Title")}</div></header><main class="pdf-body layout-${template.layoutMode} layout-density-${template.layoutDensity}" data-page-number="${pageNumber}" data-estimated-used-height="${page.usedHeight}" data-estimated-fill="${estimatedFill}" data-estimated-remaining-height="${estimatedRemaining}">${renderPageBody(page.blocks, template.layoutMode, template.layoutDensity, pageNumber)}</main><footer class="pdf-footer"><div class="footer-line"></div><div class="footer-row"><div>${escapeHtml(template.website || "www.velloresemicon.com")}</div><div class="footer-center">${pageNumber} / ${totalPages}</div><div class="footer-right">${escapeHtml(template.documentStatus || "Preliminary Datasheet")} | ${escapeHtml(template.revision || "Rev. A")}</div></div></footer></section>`;
}

export function renderTiptapNodesToExportBlocks(nodes: Array<Record<string, unknown>>, layoutOptions: RenderLayoutOptions = { layoutMode: "two-column", layoutDensity: "technical-dense" }): ExportBlock[] {
  const normalized = normalizeExportNodes(nodes);
  const rawBlocks = normalized.flatMap((node, index, source) => createBlocksForNode(node, source[index + 1], layoutOptions));
  const cleanedBlocks = cleanExportBlocks(groupFigureBlocks(rawBlocks));
  const tableAwareBlocks = injectTableSectionHeadings(cleanedBlocks, layoutOptions);
  return compactFeatureAndApplicationSections(tableAwareBlocks, layoutOptions).filter((block) => block.kind === "break" || isMeaningfulBlock(block));
}

export function paginateExportBlocks(blocks: ExportBlock[], pageCapacity = PAGE_BODY_CAPACITY): ExportPage[] {
  const queue = [...blocks];
  const pages: ExportPage[] = [];
  const debug: PaginationDebugEntry[] = [];
  let currentBlocks: ExportBlock[] = [];
  let currentHeight = 0;
  let currentSplitLabels: string[] = [];
  let currentShrinkLabels: string[] = [];

  const finalizePage = (reason: string, nextBlockReason: string, locked = false) => {
    if (currentBlocks.length === 0) return;
    const page = { blocks: currentBlocks, usedHeight: roundHeight(currentHeight), locked };
    if (isMeaningfulPage(page)) {
      pages.push(page);
      const middlePage = pages.length > 1 && queue.some((entry) => entry.kind !== "break");
      const fillPercentage = pageCapacity > 0 ? page.usedHeight / pageCapacity : 0;
      const belowTarget = middlePage && fillPercentage < FILL_TARGET_MIDDLE_PAGE;
      const belowRetry = middlePage && fillPercentage < FILL_RETRY_THRESHOLD;
      debug.push({
        pageNumber: pages.length,
        usedHeight: page.usedHeight,
        fillPercentage: Number(fillPercentage.toFixed(3)),
        remainingHeight: roundHeight(Math.max(pageCapacity - page.usedHeight, 0)),
        blocksPlaced: page.blocks.map(describeDebugBlock),
        blocksSplit: [...currentSplitLabels],
        blocksShrunk: [...currentShrinkLabels],
        finalizedBecause: reason,
        nextBlockReason: belowRetry ? `${nextBlockReason}; page remained below retry threshold` : nextBlockReason,
        underfilled: Boolean(belowTarget),
        figureShrinkAttempted: currentShrinkLabels.length > 0,
        pullForwardAttempted: false,
        pullForwardMoved: [],
      });
    }
    currentBlocks = [];
    currentHeight = 0;
    currentSplitLabels = [];
    currentShrinkLabels = [];
  };

  while (queue.length > 0) {
    const block = queue.shift() as ExportBlock;
    if (block.kind === "break") {
      finalizePage("manual break", "explicit page break", true);
      continue;
    }

    const remainingHeight = Math.max(pageCapacity - currentHeight, 0);
    if (block.estimatedHeight <= remainingHeight) {
      currentBlocks.push(block);
      currentHeight += Math.min(block.estimatedHeight, pageCapacity);
      if (pageCapacity - currentHeight <= MIN_FILL_REMAINING_THRESHOLD) finalizePage("page filled to threshold", "remaining height below threshold");
      continue;
    }

    const split = splitBlockForRemainingHeight(block, remainingHeight, pageCapacity);
    if (split) {
      currentBlocks.push(split.placed);
      currentHeight += Math.min(split.placed.estimatedHeight, pageCapacity);
      currentSplitLabels.push(split.label);
      if (split.remainder) queue.unshift(split.remainder);
      finalizePage(split.reason, split.nextBlockReason);
      continue;
    }

    const shrunk = shrinkBlockToFit(block, remainingHeight);
    if (shrunk) {
      currentBlocks.push(shrunk);
      currentHeight += Math.min(shrunk.estimatedHeight, pageCapacity);
      currentShrinkLabels.push(describeDebugBlock(shrunk));
      finalizePage("shrunk figure to avoid sparse page", "safe shrink allowed block to fit");
      continue;
    }

    if (currentBlocks.length === 0) {
      currentBlocks.push(block);
      currentHeight += Math.min(block.estimatedHeight, pageCapacity);
      finalizePage("oversized block forced onto page", "block larger than page capacity");
      continue;
    }

    finalizePage("next block could not fit", explainFitFailure(block, remainingHeight));
    queue.unshift(block);
  }

  finalizePage("queue exhausted", "no more blocks to place");
  lastPaginationDebugReport = debug;
  return pages;
}

export function isMeaningfulPage(page: ExportPage) { return page.blocks.some(isMeaningfulBlock); }

function finalizeExportPages(pages: ExportPage[], _pageCapacity = PAGE_BODY_CAPACITY): ExportPage[] {
  const filtered = pages.filter(isMeaningfulPage);
  if (filtered.length > 0) return filtered.map((page) => ({ ...page, usedHeight: roundHeight(page.usedHeight) }));
  const fallback: ExportPage = { blocks: [{ kind: "html", role: "paragraph", html: "<p>Editable datasheet draft</p>", estimatedHeight: 14, meaningful: true, plainText: "Editable datasheet draft", columnEligible: true, fullWidth: false }], usedHeight: 14 };
  return [fallback];
}

function rebalanceVisualUnderfillPages(pages: ExportPage[], pageCapacity: number, layoutOptions: RenderLayoutOptions) {
  const rebalanced = pages.map((page) => ({ ...page, blocks: [...page.blocks] }));
  const debug = lastPaginationDebugReport.map((entry) => ({ ...entry, pullForwardMoved: [...entry.pullForwardMoved] }));

  for (let index = 0; index < rebalanced.length - 1; index += 1) {
    const currentPage = rebalanced[index];
    const nextPage = rebalanced[index + 1];
    if (!currentPage || !nextPage || currentPage.locked || nextPage.locked) continue;

    const target = index === 0 ? FIRST_PAGE_PULL_FORWARD_TARGET : MIDDLE_PAGE_PULL_FORWARD_TARGET;
    let currentHeight = estimateRenderedPageHeight(currentPage.blocks, layoutOptions);
    if (pageCapacity <= 0 || currentHeight / pageCapacity >= target) continue;
    if (debug[index]) debug[index].pullForwardAttempted = true;

    while (currentPage.blocks.length > 0 && nextPage.blocks.length > 0 && currentHeight / pageCapacity < target) {
      const candidate = takeLeadingPullForwardCandidate(nextPage.blocks, currentHeight, pageCapacity, layoutOptions);
      if (!candidate) break;
      currentPage.blocks.push(...candidate.moved);
      nextPage.blocks.splice(0, candidate.removeCount, ...(candidate.replacement ? [candidate.replacement] : []));
      currentHeight = estimateRenderedPageHeight(currentPage.blocks, layoutOptions);
      currentPage.usedHeight = roundHeight(currentHeight);
      nextPage.usedHeight = roundHeight(estimateRenderedPageHeight(nextPage.blocks, layoutOptions));
      if (debug[index]) debug[index].pullForwardMoved.push(...candidate.moved.map(describeDebugBlock));
    }
  }

  lastPaginationDebugReport = debug.filter((_, index) => rebalanced[index]?.blocks.some(isMeaningfulBlock));
  return rebalanced.filter((page) => page.blocks.some(isMeaningfulBlock));
}

type PullForwardCandidate = { moved: ExportBlock[]; removeCount: number; replacement: ExportBlock | null };

function takeLeadingPullForwardCandidate(
  nextBlocks: ExportBlock[],
  currentHeight: number,
  pageCapacity: number,
  layoutOptions: RenderLayoutOptions,
): PullForwardCandidate | null {
  const remainingHeight = roundHeight(Math.max(pageCapacity - currentHeight, 0));
  if (remainingHeight < 10 || nextBlocks.length === 0) return null;

  const candidates = buildLeadingPullForwardCandidates(nextBlocks);
  for (const candidate of candidates) {
    const candidateHeight = estimateRenderedPageHeight(candidate.moved, layoutOptions);
    if (candidateHeight <= remainingHeight + 6) return candidate;
    if (candidate.moved.length === 1) {
      const block = candidate.moved[0];
      const split = splitBlockForRemainingHeight(block, remainingHeight, pageCapacity);
      if (split) {
        return { moved: [split.placed], removeCount: 1, replacement: split.remainder };
      }
      const shrunk = shrinkBlockToFit(block, remainingHeight);
      if (shrunk) {
        return { moved: [shrunk], removeCount: 1, replacement: null };
      }
    }
  }
  return null;
}

function buildLeadingPullForwardCandidates(blocks: ExportBlock[]): PullForwardCandidate[] {
  const first = blocks[0];
  if (!first) return [];
  const candidates: PullForwardCandidate[] = [{ moved: [first], removeCount: 1, replacement: null }];

  if (first.kind === "html" && first.role === "heading" && blocks[1] && blocks[1].kind !== "break") {
    candidates.unshift({ moved: [first, blocks[1]], removeCount: 2, replacement: null });
    if (blocks[1].kind === "html" && blocks[1].role === "paragraph" && blocks[2]?.kind === "html" && blocks[2].role === "list") {
      candidates.unshift({ moved: [first, blocks[1], blocks[2]], removeCount: 3, replacement: null });
    }
  }

  return candidates;
}

function estimateRenderedPageHeight(blocks: ExportBlock[], layoutOptions: RenderLayoutOptions) {
  if (layoutOptions.layoutMode === "single-column") {
    return roundHeight(blocks.reduce((sum, block) => sum + block.estimatedHeight, 0));
  }

  let totalHeight = 0;
  let flowBlocks: HtmlBlock[] = [];
  const flushFlow = () => {
    if (flowBlocks.length === 0) return;
    totalHeight += estimateRenderedColumnFlowHeight(flowBlocks);
    flowBlocks = [];
  };

  for (const block of blocks) {
    if (block.kind === "html" && isTwoColumnEligible(block)) {
      flowBlocks.push(block);
      continue;
    }
    flushFlow();
    totalHeight += block.estimatedHeight;
  }

  flushFlow();
  return roundHeight(totalHeight);
}

function estimateRenderedColumnFlowHeight(blocks: HtmlBlock[]) {
  const groups = createColumnFlowGroups(blocks);
  let leftHeight = 0;
  let rightHeight = 0;
  for (const group of groups) {
    if (leftHeight <= rightHeight) leftHeight += group.estimatedHeight;
    else rightHeight += group.estimatedHeight;
  }
  return roundHeight(Math.max(leftHeight, rightHeight));
}

function splitBlockForRemainingHeight(block: ExportBlock, remainingHeight: number, pageCapacity: number): { placed: ExportBlock; remainder: ExportBlock | null; label: string; reason: string; nextBlockReason: string } | null {
  if (remainingHeight <= 0) return null;
  if (block.kind === "table") return splitTableBlockForRemainingHeight(block, remainingHeight);
  if (block.kind !== "html") return null;
  if (block.role === "paragraph" || block.role === "generic") return splitParagraphBlockForRemainingHeight(block, remainingHeight, pageCapacity);
  if (block.role === "list") return splitListBlockForRemainingHeight(block, remainingHeight);
  return null;
}

function splitParagraphBlockForRemainingHeight(block: HtmlBlock, remainingHeight: number, pageCapacity: number) {
  const text = normalizeTechnicalText(block.plainText ?? "").trim();
  if (!text || text.length < 80 || remainingHeight < 18) return null;
  const sentences = splitParagraphTextUnits(text);
  if (sentences.length < 2) return null;
  const targetHeight = Math.min(block.estimatedHeight - 8, Math.max(remainingHeight, pageCapacity * 0.18));
  const initialCount = Math.max(1, Math.min(sentences.length - 1, Math.round((targetHeight / Math.max(block.estimatedHeight, 1)) * sentences.length)));
  const headUnits = sentences.slice(0, initialCount);
  const tailUnits = sentences.slice(initialCount);
  while (tailUnits.length > 0 && createParagraphFragmentBlock(block, headUnits.join(" ")).estimatedHeight > remainingHeight) {
    tailUnits.unshift(headUnits.pop() as string);
  }
  if (headUnits.length === 0 || tailUnits.length === 0) return null;
  const placed = createParagraphFragmentBlock(block, headUnits.join(" "));
  const remainder = createParagraphFragmentBlock(block, tailUnits.join(" "));
  if (placed.estimatedHeight <= 10 || remainder.estimatedHeight <= 10) return null;
  return { placed, remainder, label: describeDebugBlock(block), reason: "split paragraph to fill page", nextBlockReason: "paragraph remainder moved to next page" };
}

function splitListBlockForRemainingHeight(block: HtmlBlock, remainingHeight: number) {
  const items = extractListItems(block.html);
  if (items.length < 2 || remainingHeight < 18) return null;
  let fitCount = Math.min(items.length - 1, Math.max(1, Math.floor(remainingHeight / Math.max(block.estimatedHeight / items.length, 4))));
  while (fitCount > 1 && estimateListFragmentHeight(items.slice(0, fitCount)) > remainingHeight) fitCount -= 1;
  if (fitCount <= 0 || fitCount >= items.length) return null;
  const tag = block.html.trim().startsWith("<ol") ? "ol" : "ul";
  const placed = createListFragmentBlock(block, items.slice(0, fitCount), tag);
  const remainder = createListFragmentBlock(block, items.slice(fitCount), tag);
  if (remainder.estimatedHeight <= 6) return null;
  return { placed, remainder, label: describeDebugBlock(block), reason: "split list items to fill page", nextBlockReason: "list remainder moved to next page" };
}

function splitTableBlockForRemainingHeight(block: TableBlock, remainingHeight: number) {
  if (block.rowHtml.length < 3 || remainingHeight < 22) return null;
  const headerHeight = tableHeaderHeight(block.estimatedHeight, block.rowHeights);
  let runningHeight = headerHeight;
  let fitRows = 0;
  for (let index = 0; index < block.rowHeights.length; index += 1) {
    const rowHeight = block.rowHeights[index] ?? 0;
    if (fitRows >= MIN_TABLE_ROWS_PER_SEGMENT && runningHeight + rowHeight > remainingHeight) break;
    if (runningHeight + rowHeight > remainingHeight && fitRows === 0) break;
    runningHeight += rowHeight;
    fitRows += 1;
  }
  if (fitRows < MIN_TABLE_ROWS_PER_SEGMENT || fitRows >= block.rowHtml.length) return null;
  const remainingRows = block.rowHtml.length - fitRows;
  if (remainingRows < MIN_TABLE_ROWS_PER_SEGMENT) fitRows = block.rowHtml.length - MIN_TABLE_ROWS_PER_SEGMENT;
  if (fitRows < MIN_TABLE_ROWS_PER_SEGMENT) return null;
  const placed = createTableFragmentBlock(block, 0, fitRows, headerHeight);
  const remainder = createTableFragmentBlock(block, fitRows, block.rowHtml.length, headerHeight);
  return { placed, remainder, label: `table:${block.rowHtml.length}`, reason: "split table rows to fill page", nextBlockReason: "table continuation moved to next page" };
}

function shrinkBlockToFit(block: ExportBlock, remainingHeight: number): ExportBlock | null {
  if (block.kind !== "html" || (block.role !== "figure" && block.role !== "image") || !block.columnEligible) return null;
  if (remainingHeight < block.estimatedHeight * 0.74 || remainingHeight < 18) return null;
  if (block.displaySize === "full" || block.variantClass === "figure-image-full-width" || block.variantClass === "figure-image-tall") return null;
  return { ...block, estimatedHeight: roundHeight(Math.max(remainingHeight, block.estimatedHeight * 0.78)), blockClass: `${block.blockClass ?? ""} fill-forward-shrunk`.trim() };
}

function extractListItems(html: string) {
  return Array.from(html.matchAll(/<li>([\s\S]*?)<\/li>/g)).map((match) => normalizeTechnicalText(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())).filter(Boolean);
}

function splitParagraphTextUnits(text: string) {
  const sentenceUnits = text.split(/(?<=[.!?;:])\s+/).map((value) => value.trim()).filter(Boolean);
  if (sentenceUnits.length > 1) return sentenceUnits;
  const clauseUnits = text.split(/,\s+/).map((value) => value.trim()).filter(Boolean);
  if (clauseUnits.length > 1) return clauseUnits;
  const words = text.split(/\s+/).filter(Boolean);
  const chunkSize = Math.max(8, Math.ceil(words.length / 3));
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += chunkSize) chunks.push(words.slice(index, index + chunkSize).join(" "));
  return chunks;
}

function createParagraphFragmentBlock(block: HtmlBlock, text: string): HtmlBlock {
  const normalized = normalizeTechnicalText(text);
  return { ...block, html: `<p>${applyTechnicalVariableMarkup(escapeHtml(normalized))}</p>`, plainText: normalized, estimatedHeight: estimatePlainTextHeight(normalized, 148, 4.35, 3.1) };
}

function createListFragmentBlock(block: HtmlBlock, items: string[], tag: string): HtmlBlock {
  const normalizedItems = items.map((item) => normalizeTechnicalText(item));
  const html = `<${tag}>${normalizedItems.map((item) => `<li>${applyTechnicalVariableMarkup(escapeHtml(item))}</li>`).join("")}</${tag}>`;
  return { ...block, html, plainText: normalizedItems.join(" "), estimatedHeight: estimateListFragmentHeight(normalizedItems) };
}

function estimateListFragmentHeight(items: string[]) {
  const plainText = items.join(" ");
  return Math.max(8, 2 + items.length * 5 + Math.ceil(Math.max(plainText.length, 1) / 128) * 2);
}

function createTableFragmentBlock(block: TableBlock, start: number, end: number, headerHeight: number): TableBlock {
  const rowHtml = block.rowHtml.slice(start, end);
  const rowHeights = block.rowHeights.slice(start, end);
  return { ...block, rowHtml, rowHeights, estimatedHeight: headerHeight + rowHeights.reduce((sum, value) => sum + value, 0) };
}

function tableHeaderHeight(estimatedHeight: number, rowHeights: number[]) {
  return Math.max(estimatedHeight - rowHeights.reduce((sum, value) => sum + value, 0), 10);
}

function describeDebugBlock(block: ExportBlock) {
  if (block.kind === "table") return `table:${block.rowHtml.length}`;
  if (block.kind === "break") return "break";
  const label = normalizeTechnicalText(block.plainText ?? "").replace(/\s+/g, " ").trim();
  return `${block.role}:${label.slice(0, 64)}`;
}

function explainFitFailure(block: ExportBlock, remainingHeight: number) {
  if (block.kind === "table") return `table fragment of ${block.rowHtml.length} rows could not fit remaining ${roundHeight(remainingHeight)}`;
  if (block.kind === "html" && (block.role === "figure" || block.role === "image")) return `figure could not fit remaining ${roundHeight(remainingHeight)}`;
  return `${describeDebugBlock(block)} could not fit remaining ${roundHeight(remainingHeight)}`;
}

function roundHeight(value: number) { return Number(value.toFixed(2)); }

type RenderBlockMetadata = { pageNumber: number; blockId: string };
type ColumnFlowGroup = { blocks: HtmlBlock[]; estimatedHeight: number; keepCluster: boolean };

function renderBlockDebugAttributes(block: ExportBlock, metadata: RenderBlockMetadata) {
  if (block.kind === "break") {
    return ` data-page-number="${metadata.pageNumber}" data-block-id="${escapeAttribute(metadata.blockId)}" data-block-type="break" data-block-class="break" data-estimated-height="0"`;
  }
  const blockType = block.kind === "table" ? "table" : block.role;
  const blockClass = block.kind === "table"
    ? block.variantClass
    : block.blockClass ?? block.variantClass ?? block.role ?? "generic";
  return ` data-page-number="${metadata.pageNumber}" data-block-id="${escapeAttribute(metadata.blockId)}" data-block-type="${escapeAttribute(blockType)}" data-block-class="${escapeAttribute(blockClass || "")}" data-estimated-height="${roundHeight(block.estimatedHeight)}"`;
}

function renderBlock(block: ExportBlock, metadata: RenderBlockMetadata, extraClasses = "") {
  if (block.kind === "break") return "";
  const attrs = renderBlockDebugAttributes(block, metadata);
  const className = ["page-body-block", block.kind === "html" && block.fullWidth ? "full-width-block" : "", extraClasses].filter(Boolean).join(" ");
  if (block.kind === "table") return `<div class="${className} table-block"${attrs}><table class="${escapeAttribute(block.variantClass)}"><thead>${block.headerHtml}</thead><tbody>${block.rowHtml.join("")}</tbody></table></div>`;
  return `<div class="${className}"${attrs}>${block.html}</div>`;
}

function createRenderBlockMetadataFactory(pageNumber: number) {
  let blockIndex = 0;
  return () => ({ pageNumber, blockId: `page-${pageNumber}-block-${++blockIndex}` });
}

function renderPageBody(blocks: ExportBlock[], layoutMode: DatasheetLayoutMode, layoutDensity: DatasheetLayoutDensity, pageNumber: number) {
  const nextMetadata = createRenderBlockMetadataFactory(pageNumber);
  return layoutMode === "single-column"
    ? blocks.map((block) => renderBlock(block, nextMetadata())).join("")
    : renderTwoColumnPageBody(blocks, layoutDensity, pageNumber, nextMetadata);
}

function renderTwoColumnPageBody(
  blocks: ExportBlock[],
  layoutDensity: DatasheetLayoutDensity,
  pageNumber: number,
  nextMetadata: () => RenderBlockMetadata,
) {
  const sections: string[] = [];
  let flowBlocks: HtmlBlock[] = [];
  const flushFlow = () => {
    if (flowBlocks.length === 0) return;
    const estimatedHeight = roundHeight(flowBlocks.reduce((sum, block) => sum + block.estimatedHeight, 0));
    sections.push(`<section class="page-body-block technical-columns technical-columns-density-${layoutDensity}" data-page-number="${pageNumber}" data-block-type="column-section" data-block-class="technical-columns" data-estimated-height="${estimatedHeight}"><div class="technical-columns-flow">${renderColumnFlowColumns(flowBlocks, nextMetadata)}</div></section>`);
    flowBlocks = [];
  };

  for (const block of blocks) {
    if (block.kind !== "html" || !isTwoColumnEligible(block)) {
      flushFlow();
      sections.push(renderBlock(block, nextMetadata()));
      continue;
    }
    flowBlocks.push(block);
  }

  flushFlow();
  return sections.join("");
}

function renderColumnFlowColumns(blocks: HtmlBlock[], nextMetadata: () => RenderBlockMetadata) {
  const groups = createColumnFlowGroups(blocks);
  const left: string[] = [];
  const right: string[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  for (const group of groups) {
    const renderTarget = leftHeight <= rightHeight ? left : right;
    renderTarget.push(renderColumnFlowGroup(group, nextMetadata));
    if (renderTarget === left) leftHeight += group.estimatedHeight;
    else rightHeight += group.estimatedHeight;
  }

  return `<div class="technical-column technical-column-left">${left.join("")}</div><div class="technical-column technical-column-right">${right.join("")}</div>`;
}

function renderColumnFlowGroup(group: ColumnFlowGroup, nextMetadata: () => RenderBlockMetadata) {
  const blocksHtml = group.blocks.map((block) => renderBlock(block, nextMetadata(), "column-flow-item")).join("");
  return group.keepCluster ? `<div class="column-flow-group keep-cluster">${blocksHtml}</div>` : blocksHtml;
}

function createColumnFlowGroups(blocks: HtmlBlock[]) {
  const groups: ColumnFlowGroup[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.keepWithNext && index + 1 < blocks.length) {
      const pair = [block, blocks[index + 1]];
      groups.push({ blocks: pair, estimatedHeight: pair.reduce((sum, item) => sum + item.estimatedHeight, 0), keepCluster: true });
      index += 1;
      continue;
    }
    groups.push({ blocks: [block], estimatedHeight: block.estimatedHeight, keepCluster: false });
  }
  return groups;
}

function isTwoColumnEligible(block: HtmlBlock) {
  if (block.fullWidth) return false;
  if (block.columnEligible === true) return true;
  if (block.role === "caption") return Boolean(block.plainText && block.plainText.length <= 96);
  if (block.role === "heading") return Boolean(block.plainText && block.plainText.length <= 54);
  return block.role === "paragraph" || block.role === "list" || block.role === "rule" || block.role === "generic";
}


function normalizeExportNodes(nodes: Array<Record<string, unknown>>) { return nodes.flatMap((node) => normalizeExportNode(node)); }

function normalizeExportNode(node: Record<string, unknown>): Array<Record<string, unknown>> {
  if (String(node.type ?? "") === "paragraph") {
    const split = splitMergedHeadingParagraph(node);
    if (split) return split;
  }
  if (Array.isArray(node.content)) return [{ ...node, content: normalizeExportNodes(node.content as Array<Record<string, unknown>>) }];
  return [node];
}

function splitMergedHeadingParagraph(node: Record<string, unknown>) {
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  if (attrs.class === "image-caption" || !Array.isArray(node.content)) return null;
  const plainText = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim());
  const parsed = plainText ? parseHeadingPrefix(plainText) : null;
  return parsed ? [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: parsed.heading }] }, { type: "paragraph", content: [{ type: "text", text: parsed.body }] }] : null;
}

function parseHeadingPrefix(text: string) {
  for (const prefix of KNOWN_HEADING_PREFIXES) {
    if (!text.startsWith(`${prefix} `)) continue;
    const body = text.slice(prefix.length).trim();
    if (isSentenceLike(body)) return { heading: prefix, body };
  }
  const match = text.match(/^([A-Z][A-Z&(),/\-\s]{6,80}?)\s+([A-Z][a-z].+)$/);
  if (!match) return null;
  const heading = match[1].trim();
  const body = match[2].trim();
  return isGenericHeadingPrefix(heading) && isSentenceLike(body) ? { heading, body } : null;
}

function isGenericHeadingPrefix(value: string) {
  if (/[0-9]/.test(value) || /[a-z]/.test(value) || /\b[A-Z]{1,3}-\d/.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 6 && words.every((word) => /^[A-Z&(),/-]+$/.test(word) && !word.includes("/") && word.length <= 24);
}

function isSentenceLike(value: string) { return /^[A-Z][\s\S]{6,}$/.test(value) && !/^[A-Z0-9_\-/\s]+$/.test(value); }

function createBlocksForNode(node: Record<string, unknown>, nextNode: Record<string, unknown> | undefined, layoutOptions: RenderLayoutOptions): ExportBlock[] {
  const type = String(node.type ?? "");
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const contentNodes = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : [];
  const content = renderNodes(contentNodes);
  const plainText = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim());
  if (type === "paragraph") {
    if (attrs.class === "image-caption" && isGenericSourceCaption(node)) return [];
    if (!content.trim() || !plainText || isGenericCaptionText(plainText)) return [];
    const role = attrs.class === "image-caption" || looksLikeFigureCaption(plainText) ? "caption" : "paragraph";
    const columnEligible = role === "caption" ? plainText.length <= 88 : true;
    return [{ kind: "html", role, html: `<p${classAttribute(attrs)}>${content}</p>`, estimatedHeight: estimateParagraphHeight(node, attrs, layoutOptions), keepWithNext: isKeepWithNext(attrs), meaningful: true, plainText, columnEligible, fullWidth: false }];
  }
  if (type === "heading") {
    if (!plainText) return [];
    const level = headingLevel(attrs);
    return [{ kind: "html", role: "heading", html: `<h${level}>${content}</h${level}>`, estimatedHeight: estimateHeadingHeight(node, attrs, layoutOptions), keepWithNext: isKeepWithNext(attrs) || shouldKeepHeadingWithNext(nextNode), meaningful: true, plainText, columnEligible: plainText.length <= 54, fullWidth: false }];
  }
  if (type === "bulletList") return createListBlocks(node, "ul", layoutOptions);
  if (type === "orderedList") return createListBlocks(node, "ol", layoutOptions);
  if (type === "table") return splitTableIntoBlocks(node, layoutOptions);
  if (type === "horizontalRule") return [{ kind: "html", role: "rule", html: "<hr />", estimatedHeight: isTechnicalDense(layoutOptions) ? 4 : 6, meaningful: true, plainText: "rule", columnEligible: true, fullWidth: false }];
  if (type === "pageBreak") return [{ kind: "break", estimatedHeight: 0, meaningful: false }];
  if (type === "image") {
    const image = extractImageMeta(attrs);
    if (!image.src || shouldExcludeImage(image, plainText)) return [];
    const columnEligible = shouldRenderImageInColumn(image, plainText);
    return [{ kind: "html", role: "image", html: renderImage(image, columnEligible), estimatedHeight: estimateImageHeight(image, layoutOptions, columnEligible), meaningful: true, plainText: image.alt || plainText || "Datasheet image", imageKey: image.imageKey, imageWidth: image.width, imageHeight: image.height, aspectRatio: image.aspectRatio, columnEligible, fullWidth: !columnEligible, displaySize: image.displaySize, variantClass: image.variantClass, blockClass: resolveFigureBlockClass(image.displaySize, columnEligible) }];
  }
  if (type === "text") return plainText ? [{ kind: "html", role: "generic", html: renderTextNode(node), estimatedHeight: isTechnicalDense(layoutOptions) ? 5 : 6, meaningful: true, plainText, columnEligible: true, fullWidth: false }] : [];
  return content.trim() && plainText ? [{ kind: "html", role: "generic", html: content, estimatedHeight: estimatePlainTextHeight(plainText, isTechnicalDense(layoutOptions) ? 124 : 108, isTechnicalDense(layoutOptions) ? 5 : 6, isTechnicalDense(layoutOptions) ? 4 : 6), meaningful: true, plainText, columnEligible: true, fullWidth: false }] : [];
}

function cleanExportBlocks(blocks: ExportBlock[]) {
  const cleaned: ExportBlock[] = [];
  for (const block of blocks) {
    if (block.kind === "html" && block.role !== "image" && (!block.plainText || !block.plainText.trim() || isGenericCaptionText(block.plainText))) continue;
    const previous = cleaned.at(-1);
    if (block.kind === "html" && block.role === "caption" && previous?.kind === "html" && previous.role === "caption" && previous.plainText === block.plainText) continue;
    if (block.kind === "table" && previous?.kind === "table" && previous.headerHtml === block.headerHtml && previous.rowHtml.join("") === block.rowHtml.join("")) continue;
    cleaned.push(block);
  }
  return cleaned;
}

function injectTableSectionHeadings(blocks: ExportBlock[], layoutOptions: RenderLayoutOptions) {
  const withHeadings: ExportBlock[] = [];
  let activeSection = "";

  for (const block of blocks) {
    const explicitSection = detectKnownSectionHeading(block);
    if (explicitSection) activeSection = explicitSection;

    if (block.kind === "table") {
      const inferredSection = inferTableSectionHeading(block.plainText ?? "", activeSection);
      if (inferredSection && inferredSection !== activeSection) {
        withHeadings.push(createSyntheticHeadingBlock(inferredSection, layoutOptions));
        activeSection = inferredSection;
      }
    }

    withHeadings.push(block);
  }

  return withHeadings;
}

function detectKnownSectionHeading(block: ExportBlock) {
  const text = block.kind === "table" ? block.plainText ?? "" : block.kind === "break" ? "" : block.plainText ?? "";
  const normalized = normalizeTechnicalText(text).toUpperCase();
  for (const heading of KNOWN_HEADING_PREFIXES) {
    if (normalized === heading || normalized.startsWith(heading + " ")) return heading;
  }
  return "";
}

function inferTableSectionHeading(plainText: string, activeSection: string) {
  const normalized = normalizeTechnicalText(plainText).toUpperCase();
  if (!normalized) return "";
  if (/\bRATINGS\b/.test(normalized) && !/\bCONDITIONS\b/.test(normalized)) return activeSection || "ABSOLUTE MAXIMUM RATINGS";
  if (/\bINPUT VOLTAGE\b/.test(normalized) && /\bJUNCTION TEMPERATURE\b/.test(normalized)) return "RECOMMENDED OPERATING CONDITIONS";
  if (/\bCONDITIONS\b/.test(normalized) && /\bMIN\b/.test(normalized) && /\bTYP\b/.test(normalized) && /\bMAX\b/.test(normalized)) return "ELECTRICAL CHARACTERISTICS";
  return "";
}

function createSyntheticHeadingBlock(heading: string, layoutOptions: RenderLayoutOptions): HtmlBlock {
  return {
    kind: "html",
    role: "heading",
    html: `<h2>${escapeHtml(heading)}</h2>`,
    estimatedHeight: estimatePlainTextHeight(heading, isTechnicalDense(layoutOptions) ? 62 : 48, isTechnicalDense(layoutOptions) ? 7.8 : 10, isTechnicalDense(layoutOptions) ? 1.6 : 2),
    meaningful: true,
    plainText: heading,
    columnEligible: heading.length <= 54,
    fullWidth: false,
  };
}

function compactFeatureAndApplicationSections(blocks: ExportBlock[], layoutOptions: RenderLayoutOptions): ExportBlock[] {
  const compacted: ExportBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!(block.kind === "html" && block.role === "heading")) {
      compacted.push(block);
      continue;
    }
    const headingText = (block.plainText ?? "").trim().toUpperCase();
    if (headingText !== "FEATURES" && headingText !== "APPLICATIONS") {
      compacted.push(block);
      continue;
    }
    const collected: HtmlBlock[] = [];
    let cursor = index + 1;
    while (cursor < blocks.length) {
      const next = blocks[cursor];
      if (!(next.kind === "html") || next.role !== "paragraph") break;
      if (!next.plainText || next.plainText.length > 260) break;
      collected.push(next);
      cursor += 1;
    }
    const items = extractCompactListItems(headingText, collected);
    if (items.length < 2) {
      compacted.push(block);
      continue;
    }
    compacted.push(block);
    compacted.push(createCompactListBlock(items, layoutOptions));
    index = cursor - 1;
  }
  return compacted;
}

function extractCompactListItems(headingText: string, blocks: HtmlBlock[]) {
  if (blocks.length === 0) return [];
  if (blocks.length > 1) return blocks.map((block) => normalizeTechnicalText(block.plainText ?? "").trim()).filter((value) => value.length > 0);
  return splitCompactListText(normalizeTechnicalText(blocks[0].plainText ?? "").trim(), headingText);
}

function splitCompactListText(text: string, headingText: string) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return [text];
  const items: string[] = [];
  let current: string[] = [words[0]];
  const blockers = new Set(["and", "or", "of", "for", "to", "with", "in", "on", "at"]);
  for (let index = 1; index < words.length; index += 1) {
    const token = words[index];
    const previous = current[current.length - 1] ?? "";
    const currentText = current.join(" ");
    const startsLikeItem = /^[A-Z][A-Za-z0-9-]*/.test(token);
    const shouldSplit = startsLikeItem && current.length >= 2 && !blockers.has(previous.toLowerCase()) && (/\d|[%)]$/.test(previous) || current.length >= 3 || currentText.length >= 18);
    if (shouldSplit) {
      items.push(currentText);
      current = [token];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) items.push(current.join(" "));
  return items.filter((value) => value && value.toUpperCase() !== headingText);
}

function createCompactListBlock(items: string[], layoutOptions: RenderLayoutOptions): HtmlBlock {
  const dense = isTechnicalDense(layoutOptions);
  const itemHtml = items.map((item) => `<li>${applyTechnicalVariableMarkup(escapeHtml(normalizeTechnicalText(item)))}</li>`).join("");
  const plainText = items.join(" ");
  return { kind: "html", role: "list", html: `<ul>${itemHtml}</ul>`, estimatedHeight: Math.max(dense ? 8 : 12, (dense ? 2 : 4) + items.length * (dense ? 5 : 8) + Math.ceil(plainText.length / (dense ? 128 : 90)) * 2), meaningful: true, plainText, columnEligible: true, fullWidth: false };
}

function groupFigureBlocks(blocks: ExportBlock[]) {
  const grouped: ExportBlock[] = [];
  const seenImages = new Set<string>();
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind === "break") { grouped.push(block); continue; }
    if (block.kind === "html" && block.role === "caption") {
      const next = blocks[index + 1];
      if (next?.kind === "html" && next.role === "image") {
        if (next.imageKey && seenImages.has(next.imageKey)) { index += 1; continue; }
        if (next.imageKey) seenImages.add(next.imageKey);
        grouped.push(createFigureBlock([block, next]));
        index += 1;
        continue;
      }
    }
    if (block.kind === "html" && block.role === "image") {
      if (block.imageKey && seenImages.has(block.imageKey)) continue;
      const previous = grouped.at(-1);
      const next = blocks[index + 1];
      const headingBefore = isFigureHeadingBlock(previous);
      const captionBefore = isFigureCaptionBlock(previous);
      const captionAfter = next?.kind === "html" && next.role === "caption" ? next : null;
      if (block.imageKey) seenImages.add(block.imageKey);
      if (headingBefore || captionBefore || captionAfter) {
        if (headingBefore || captionBefore) grouped.pop();
        const parts = [headingBefore || captionBefore ? previous ?? null : null, block, captionAfter].filter(Boolean) as HtmlBlock[];
        grouped.push(createFigureBlock(parts));
        if (captionAfter) index += 1;
        continue;
      }
    }
    if (block.kind === "html" && block.role === "image" && block.imageKey) seenImages.add(block.imageKey);
    grouped.push(block);
  }
  return grouped;
}

function createFigureBlock(blocks: HtmlBlock[]): HtmlBlock {
  const heading = blocks.find((block) => block.role === "heading");
  const image = blocks.find((block) => block.role === "image");
  const combinedText = blocks.map((block) => block.plainText ?? "").join(" ").trim();
  const captionHtml = blocks.filter((block) => block.role === "caption" && !isGenericCaptionText(block.plainText ?? "")).map((block) => `<div class="figure-caption">${stripOuterParagraph(block.html)}</div>`).join("");
  const columnEligible = Boolean(image?.columnEligible) && !shouldForceFigureFullWidth(combinedText);
  return { kind: "html", role: "figure", html: `<section class="figure-block${columnEligible ? " figure-block-column" : ""}">${heading ? `<div class="figure-heading">${heading.html}</div>` : ""}${image ? `<div class="figure-image-wrap">${image.html}</div>` : ""}${captionHtml}</section>`, estimatedHeight: Math.min(blocks.reduce((sum, block) => sum + block.estimatedHeight, 0) + (columnEligible ? 1 : 4), PAGE_BODY_CAPACITY), meaningful: true, plainText: combinedText, imageKey: image?.imageKey, imageWidth: image?.imageWidth ?? null, imageHeight: image?.imageHeight ?? null, aspectRatio: image?.aspectRatio ?? null, columnEligible, fullWidth: !columnEligible, displaySize: image?.displaySize, variantClass: image?.variantClass, blockClass: resolveFigureBlockClass(image?.displaySize, columnEligible) };
}

function createListBlocks(node: Record<string, unknown>, tag: "ul" | "ol", layoutOptions: RenderLayoutOptions): ExportBlock[] {
  const items = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : [];
  const itemHtml = items.map((item) => {
    const content = renderNodes(Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []).trim();
    return content ? `<li>${stripOuterParagraph(content)}</li>` : "";
  }).filter(Boolean).join("");
  if (!itemHtml) return [];
  const dense = isTechnicalDense(layoutOptions);
  const plainText = normalizeTechnicalText(items.map(getPlainText).join(" ").replace(/\s+/g, " ").trim());
  return [{ kind: "html", role: "list", html: `<${tag}>${itemHtml}</${tag}>`, estimatedHeight: Math.max(dense ? 8 : 12, (dense ? 2 : 4) + items.length * (dense ? 5 : 8) + Math.ceil(plainText.length / (dense ? 128 : 90)) * 2), meaningful: true, plainText, columnEligible: true, fullWidth: false }];
}

function splitTableIntoBlocks(node: Record<string, unknown>, layoutOptions: RenderLayoutOptions): ExportBlock[] {
  const rows = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : [];
  if (rows.length === 0) return [];
  const [headerRow, ...bodyRows] = rows;
  const dense = isTechnicalDense(layoutOptions);
  const headerHeight = dense ? 10 : 14;
  const headerHtml = renderTableRow(headerRow, true);
  const rowHtml = bodyRows.map((row) => renderTableRow(row, false));
  const rowHeights = bodyRows.map((row) => estimateTableRowHeight(row, layoutOptions));
  const plainText = normalizeTechnicalText(rows.map(getPlainText).join(" ").replace(/\s+/g, " ").trim());
  const columnCount = Math.max(...rows.map((row) => Array.isArray(row.content) ? row.content.length : 0), 0);
  const variantClass = tableVariantClass(columnCount, plainText, layoutOptions);
  if (bodyRows.length <= 4) return [{ kind: "table", role: "table", estimatedHeight: headerHeight + rowHeights.reduce((sum, value) => sum + value, 0), meaningful: true, headerHtml, rowHtml, rowHeights, plainText, variantClass }];
  const segmentTargetHeight = dense ? TABLE_SEGMENT_TARGET_HEIGHT_DENSE : TABLE_SEGMENT_TARGET_HEIGHT;
  const maxSegmentHeight = dense ? MAX_TABLE_SEGMENT_HEIGHT_DENSE : MAX_TABLE_SEGMENT_HEIGHT;
  const segments: TableBlock[] = [];
  let currentRows: string[] = [];
  let currentHeights: number[] = [];
  let currentHeight = headerHeight;
  for (let index = 0; index < rowHtml.length; index += 1) {
    const nextHeight = rowHeights[index] ?? (dense ? 10 : 12);
    const remainingRows = rowHtml.length - index;
    const shouldSplit = currentRows.length >= MIN_TABLE_ROWS_PER_SEGMENT && currentHeight + nextHeight > segmentTargetHeight && remainingRows >= MIN_TABLE_ROWS_PER_SEGMENT;
    if (shouldSplit || currentHeight + nextHeight > maxSegmentHeight) {
      segments.push({ kind: "table", role: "table", estimatedHeight: currentHeight, meaningful: true, headerHtml, rowHtml: currentRows, rowHeights: currentHeights, plainText, variantClass });
      currentRows = [];
      currentHeights = [];
      currentHeight = headerHeight;
    }
    currentRows.push(rowHtml[index]);
    currentHeights.push(nextHeight);
    currentHeight += nextHeight;
  }
  if (currentRows.length > 0) segments.push({ kind: "table", role: "table", estimatedHeight: currentHeight, meaningful: true, headerHtml, rowHtml: currentRows, rowHeights: currentHeights, plainText, variantClass });
  return rebalanceTableSegments(segments, headerHeight);
}

function rebalanceTableSegments(segments: TableBlock[], headerHeight: number) {
  if (segments.length < 2) return segments;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    while (current.rowHtml.length < MIN_TABLE_ROWS_PER_SEGMENT && next.rowHtml.length > MIN_TABLE_ROWS_PER_SEGMENT) {
      current.rowHtml.push(next.rowHtml.shift() as string);
      current.rowHeights.push(next.rowHeights.shift() as number);
    }
    current.estimatedHeight = headerHeight + current.rowHeights.reduce((sum, value) => sum + value, 0);
    next.estimatedHeight = headerHeight + next.rowHeights.reduce((sum, value) => sum + value, 0);
  }

  const last = segments[segments.length - 1];
  const previous = segments[segments.length - 2];
  while (last.rowHtml.length < MIN_TABLE_ROWS_PER_SEGMENT && previous.rowHtml.length > MIN_TABLE_ROWS_PER_SEGMENT) {
    last.rowHtml.unshift(previous.rowHtml.pop() as string);
    last.rowHeights.unshift(previous.rowHeights.pop() as number);
  }
  previous.estimatedHeight = headerHeight + previous.rowHeights.reduce((sum, value) => sum + value, 0);
  last.estimatedHeight = headerHeight + last.rowHeights.reduce((sum, value) => sum + value, 0);

  return segments;
}

function renderNodes(nodes: Array<Record<string, unknown>>) { return nodes.map((node) => renderNode(node)).join(""); }

function renderNode(node: Record<string, unknown>): string {
  const type = String(node.type ?? "");
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const content = Array.isArray(node.content) ? renderNodes(node.content as Array<Record<string, unknown>>) : "";
  if (type === "text") return renderTextNode(node);
  if (type === "paragraph") return `<p${classAttribute(attrs)}>${content}</p>`;
  if (type === "heading") { const level = headingLevel(attrs); return `<h${level}>${content}</h${level}>`; }
  if (type === "bulletList") return `<ul>${Array.isArray(node.content) ? (node.content as Array<Record<string, unknown>>).map((item) => `<li>${stripOuterParagraph(renderNodes(Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []))}</li>`).join("") : ""}</ul>`;
  if (type === "orderedList") return `<ol>${Array.isArray(node.content) ? (node.content as Array<Record<string, unknown>>).map((item) => `<li>${stripOuterParagraph(renderNodes(Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []))}</li>`).join("") : ""}</ol>`;
  if (type === "table") { const rows = Array.isArray(node.content) ? node.content as Array<Record<string, unknown>> : []; const [header, ...body] = rows; return `<table class="technical-table"><thead>${header ? renderTableRow(header, true) : ""}</thead><tbody>${body.map((row) => renderTableRow(row, false)).join("")}</tbody></table>`; }
  if (type === "image") return renderImage(extractImageMeta(attrs), false);
  if (type === "horizontalRule") return "<hr />";
  if (type === "pageBreak") return '<div class="page-break"></div>';
  return content;
}

function renderTextNode(node: Record<string, unknown>) {
  let html = applyTechnicalVariableMarkup(escapeHtml(normalizeTechnicalText(String(node.text ?? ""))));
  const marks = Array.isArray(node.marks) ? node.marks as Array<Record<string, unknown>> : [];
  for (const mark of marks) {
    const type = String(mark.type ?? "");
    const attrs = isRecord(mark.attrs) ? mark.attrs : {};
    if (type === "bold") html = `<strong>${html}</strong>`;
    else if (type === "italic") html = `<em>${html}</em>`;
    else if (type === "underline") html = `<u>${html}</u>`;
    else if (type === "subscript") html = `<sub>${html}</sub>`;
    else if (type === "superscript") html = `<sup>${html}</sup>`;
    else if (type === "link") html = `<a href="${escapeAttribute(safeHref(String(attrs.href ?? "#")))}">${html}</a>`;
  }
  return html;
}

function extractImageMeta(attrs: Record<string, unknown>): ImageMeta {
  const src = safeImageSrc(String(attrs.src ?? ""));
  const alt = String(attrs.alt ?? "").trim();
  const width = parseNumericDimension(attrs.width);
  const height = parseNumericDimension(attrs.height);
  const aspectRatio = width && height ? width / height : null;
  const displaySize = parseImageDisplaySize(attrs.displaySize);
  return { src, alt, width, height, aspectRatio, imageKey: String(attrs.imageKey ?? attrs.id ?? src).trim(), variantClass: classifyImageVariant(width, height), displaySize };
}

function renderImage(image: ImageMeta, columnEligible: boolean) {
  const classes = ["content-image", "figure-image", image.variantClass, `figure-image-size-${image.displaySize}`, columnEligible ? "figure-image-column" : "figure-image-full-context"].filter(Boolean).join(" ");
  const widthStyle = image.displaySize === "full" || (!columnEligible && image.width && image.height && image.aspectRatio && image.aspectRatio > 1.85) ? "width: 100%;" : "";
  return `<img class="${classes}" src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.alt || "Datasheet figure")}"${image.width ? ` width="${image.width}"` : ""}${image.height ? ` height="${image.height}"` : ""} style="${widthStyle}" />`;
}

function parseImageDisplaySize(value: unknown): ImageDisplaySize {
  return value === "small" || value === "full" ? value : "medium";
}

function resolveFigureBlockClass(displaySize: ImageDisplaySize | undefined, columnEligible: boolean) {
  if (!columnEligible || displaySize === "full") return "full-width-figure";
  if (displaySize === "small") return "small-figure";
  if (displaySize === "medium") return "medium-figure";
  return "column-figure";
}

function classifyImageVariant(width: number | null, height: number | null) {
  if (!width || !height) return "figure-image-normal";
  const ratio = width / height;
  if (ratio >= 2.2) return "figure-image-full-width";
  if (ratio >= 1.45) return "figure-image-wide";
  if (ratio <= 0.72) return "figure-image-tall";
  return "figure-image-normal";
}

function shouldExcludeImage(image: ImageMeta, surroundingText: string) {
  if (!image.src) return true;
  const label = `${image.alt} ${surroundingText}`.toLowerCase();
  return /\b(qr|scan me|barcode)\b/.test(label) || /\b(logo|vellore semicon|www\.|http|datasheet studio)\b/.test(label) || (/header|footer/.test(label) && !isGenericCaptionText(image.alt));
}

function looksLikeFigureCaption(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return Boolean(normalized) && (isGenericCaptionText(normalized) || /^(figure|fig\.)\s*\d+[a-z]?([.:-]|\s)/i.test(normalized));
}

function isGenericCaptionText(text: string) { return /^image from source page\s+\d+$/i.test(text.replace(/\s+/g, " ").trim()); }
function isFigureCaptionBlock(block: ExportBlock | undefined): block is HtmlBlock { return Boolean(block && block.kind === "html" && block.role === "caption"); }
function isFigureHeadingBlock(block: ExportBlock | undefined): block is HtmlBlock { return Boolean(block && block.kind === "html" && block.role === "heading"); }
function stripOuterParagraph(html: string) { return html.replace(/^<p[^>]*>/, "").replace(/<\/p>$/, ""); }
function isMeaningfulBlock(block: ExportBlock) { return block.kind === "break" ? false : block.kind === "table" ? block.rowHtml.length > 0 : Boolean(block.meaningful && (block.plainText?.trim() || block.role === "image" || block.role === "figure")); }
function estimateParagraphHeight(node: Record<string, unknown>, attrs: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim()); const dense = isTechnicalDense(layoutOptions); const base = estimatePlainTextHeight(text, dense ? 148 : 112, dense ? 4.35 : 6, dense ? 3.1 : 6); return attrs.class === "image-caption" || looksLikeFigureCaption(text) ? Math.max(dense ? 5.9 : 10, base - (dense ? 2.3 : 2)) : base; }
function estimateHeadingHeight(node: Record<string, unknown>, attrs: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim()); const level = headingLevel(attrs); const dense = isTechnicalDense(layoutOptions); const perLine = level === 1 ? (dense ? 12.8 : 18) : level === 2 ? (dense ? 8.8 : 14) : (dense ? 7.9 : 12); const charsPerLine = level === 1 ? (dense ? 48 : 36) : dense ? 62 : 48; return Math.max(perLine, Math.ceil(Math.max(text.length, 1) / charsPerLine) * perLine + (dense ? 0.6 : 2)); }
function estimateImageHeight(image: Pick<ImageMeta, "width" | "height" | "aspectRatio" | "variantClass" | "displaySize">, layoutOptions: RenderLayoutOptions, columnEligible = false) { const dense = isTechnicalDense(layoutOptions); const scale = image.displaySize === "small" ? (columnEligible ? 0.52 : 0.38) : image.displaySize === "full" ? 1 : (columnEligible ? 0.78 : 0.62); const maxWidth = columnEligible ? COLUMN_IMAGE_MAX_WIDTH : IMAGE_MAX_WIDTH; const maxHeight = columnEligible ? (dense ? (image.displaySize === "small" ? 28 : 36) : 52) : (dense ? PAGE_BODY_IMAGE_MAX_DENSE : PAGE_BODY_IMAGE_MAX); if (image.aspectRatio && image.aspectRatio > 0) { const projected = (maxWidth * scale) / image.aspectRatio; const adjusted = image.variantClass === "figure-image-tall" ? Math.min(projected, maxHeight) : Math.min(projected + (columnEligible ? 0.6 : 3), maxHeight); return Math.max(columnEligible ? 12 : 20, adjusted); } if (image.width && image.height && image.height > 0) return Math.max(columnEligible ? 12 : 20, Math.min((maxWidth * scale * image.height) / image.width, maxHeight)); return columnEligible ? 20 : image.displaySize === "small" ? 34 : 52; }
function estimatePlainTextHeight(text: string, charsPerLine: number, lineUnit = 6, basePad = 6) { const normalized = text.replace(/\s+/g, " ").trim(); if (!normalized) return 0; const lines = Math.max(1, Math.ceil(normalized.length / charsPerLine)); return basePad + lines * lineUnit; }
function estimateTableRowHeight(row: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(row).replace(/\s+/g, " ").trim()); const dense = isTechnicalDense(layoutOptions); return Math.max(dense ? 5.8 : 12, (dense ? 3.2 : 8) + Math.ceil(Math.max(text.length, 1) / (dense ? 88 : 48)) * (dense ? 2.6 : 5)); }
function tableVariantClass(columnCount: number, plainText: string, layoutOptions: RenderLayoutOptions) { const dense = layoutOptions.layoutDensity === "technical-dense" || columnCount >= 4 || plainText.length > 280; return dense ? "technical-table technical-table-dense" : "technical-table"; }
function shouldRenderImageInColumn(image: ImageMeta, surroundingText: string) {
  const label = `${image.alt} ${surroundingText}`.toLowerCase();
  if (image.displaySize === "full") return false;
  if (/\b(pad location|bonding diagram|bonding|assembly|package outline|mechanical|block diagram)\b/.test(label)) return false;
  if (image.variantClass === "figure-image-full-width" || image.variantClass === "figure-image-tall") return false;
  const area = (image.width ?? 0) * (image.height ?? 0);
  if (image.displaySize === "small") return true;
  if (/\b(pin configuration|pinout|typical application|application schematic|application circuit|package)\b/.test(label) && (!area || area <= 1100000)) return true;
  if (image.displaySize === "medium") {
    if (image.variantClass === "figure-image-normal" && (!area || area <= 1400000)) return true;
    if (image.variantClass === "figure-image-wide" && (image.aspectRatio ?? 0) <= 1.95 && (!area || area <= 1050000)) return true;
  }
  return false;
}
function shouldForceFigureFullWidth(text: string) {
  return /\b(pad location|bonding diagram|bonding|assembly|package outline|mechanical|block diagram)\b/i.test(text);
}
function isTechnicalDense(layoutOptions: RenderLayoutOptions) { return layoutOptions.layoutMode === "two-column" && layoutOptions.layoutDensity === "technical-dense"; }
function resolvePageCapacity(layoutOptions: RenderLayoutOptions) { return isTechnicalDense(layoutOptions) ? PAGE_BODY_CAPACITY_DENSE : PAGE_BODY_CAPACITY; }
function shouldKeepHeadingWithNext(nextNode?: Record<string, unknown>) { return !!nextNode && ["paragraph", "bulletList", "orderedList", "table", "image"].includes(String(nextNode.type ?? "")); }
function isKeepWithNext(attrs: Record<string, unknown>) { return attrs.keepWithNext === true || attrs["data-keep-with-next"] === "true"; }
function headingLevel(attrs: Record<string, unknown>) { const level = Number(attrs.level ?? 2); return level >= 1 && level <= 3 ? level : 2; }
function classAttribute(attrs: Record<string, unknown>) { const className = typeof attrs.class === "string" ? attrs.class.trim() : ""; return className ? ` class="${escapeAttribute(className)}"` : ""; }
function renderTableRow(row: Record<string, unknown>, treatAsHeader: boolean) { const cells = Array.isArray(row.content) ? row.content as Array<Record<string, unknown>> : []; return `<tr>${cells.map((cell) => { const type = String(cell.type ?? ""); const tag = treatAsHeader || type === "tableHeader" ? "th" : "td"; const content = Array.isArray(cell.content) ? renderNodes(cell.content as Array<Record<string, unknown>>) : ""; return `<${tag}>${content}</${tag}>`; }).join("")}</tr>`; }
function getPlainText(node: Record<string, unknown>): string { const type = String(node.type ?? ""); if (type === "text") return String(node.text ?? ""); const attrs = isRecord(node.attrs) ? node.attrs : {}; const own = type === "image" ? String(attrs.alt ?? "") : ""; const content = Array.isArray(node.content) ? (node.content as Array<Record<string, unknown>>).map((child) => getPlainText(child)).join(" ") : ""; return `${own} ${content}`.trim(); }
function isGenericSourceCaption(node: Record<string, unknown>) { return isGenericCaptionText(getPlainText(node)); }
function parseNumericDimension(value: unknown) { if (typeof value === "number" && Number.isFinite(value) && value > 0) return value; if (typeof value === "string") { const match = value.match(/\d+(\.\d+)?/); if (match) { const parsed = Number(match[0]); if (Number.isFinite(parsed) && parsed > 0) return parsed; } } return null; }
function safeImageSrc(value: string) { if (!value) return ""; if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value) || value.startsWith("/")) return value; return ""; }
function safeHref(value: string) { if (/^https?:\/\//i.test(value) || value.startsWith("mailto:") || value.startsWith("#")) return value; return "#"; }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function escapeAttribute(value: string) { return escapeHtml(value); }
function escapeCssColor(value: string) { const trimmed = value.trim(); return /^#[0-9a-f]{3,8}$/i.test(trimmed) || /^[a-z]+$/i.test(trimmed) ? trimmed : "#0D2B55"; }
function applyTechnicalVariableMarkup(value: string) {
  return value
    .replace(/[Δ∆]\s*V\s*OUT/g, '<span class="technical-var">ΔV<sub>OUT</sub></span>')
    .replace(/[θϑ]\s*SA/g, '<span class="technical-var">θ<sub>SA</sub></span>')
    .replace(/[θϑ]\s*JC/g, '<span class="technical-var">θ<sub>JC</sub></span>')
    .replace(/[θϑ]\s*CS/g, '<span class="technical-var">θ<sub>CS</sub></span>')
    .replace(/\bVIN\b/g, '<span class="technical-var">V<sub>IN</sub></span>')
    .replace(/\bVOUT\b/g, '<span class="technical-var">V<sub>OUT</sub></span>')
    .replace(/\bIOUT\b/g, '<span class="technical-var">I<sub>OUT</sub></span>')
    .replace(/\bTA\b/g, '<span class="technical-var">T<sub>A</sub></span>')
    .replace(/\bTJ\b/g, '<span class="technical-var">T<sub>J</sub></span>')
    .replace(/\bPD\b/g, '<span class="technical-var">P<sub>D</sub></span>')
    .replace(/\bIQ\b/g, '<span class="technical-var">I<sub>Q</sub></span>')
    .replace(/\bVREF\b/g, '<span class="technical-var">V<sub>REF</sub></span>')
    .replace(/\bIADJ\b/g, '<span class="technical-var">I<sub>ADJ</sub></span>');
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }














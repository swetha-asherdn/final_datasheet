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
const KNOWN_HEADING_PREFIXES = ["RECOMMENDED OPERATING CONDITIONS", "ABSOLUTE MAXIMUM RATINGS", "ELECTRICAL CHARACTERISTICS", "ADJUSTABLE REGULATOR DESIGN", "PAD LOCATION AND COORDINATES", "ASSEMBLY CHARACTERISTICS", "APPLICATION INFORMATION", "CAPACITOR REQUIREMENTS", "MINIMUM LOAD CURRENT", "TYPICAL APPLICATION", "GENERAL DESCRIPTION", "PIN CONFIGURATION", "BONDING DIAGRAM", "ADDITIONAL INFORMATION", "THERMAL DESIGN", "BLOCK DIAGRAM", "APPLICATIONS", "PINOUT", "FEATURES"];

type RenderLayoutOptions = { layoutMode: DatasheetLayoutMode; layoutDensity: DatasheetLayoutDensity };

export function renderDatasheetExportHtml(params: { document: ExportDocumentSnapshot; template: ExportTemplateSnapshot }, options: { mode?: ExportRenderMode } = {}) {
  return renderExportDocumentHtml(buildExportPageModel(params), params.template, options);
}

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
  return { title, productCode, logoSrc, pages: finalizeExportPages(paginateExportBlocks(blocks, pageCapacity), pageCapacity) };
}

export function renderExportDocumentHtml(pageModel: ExportPageModel, template: ExportTemplateSnapshot, options: { mode?: ExportRenderMode } = {}) {
  const mode = options.mode ?? "pdf";
  const totalPages = pageModel.pages.length;
  return `<!doctype html><html lang="en" class="export-mode-${mode}"><head><meta charset="utf-8" /><title>${escapeHtml(pageModel.title || "Vellore Semicon Datasheet")}</title><style>
  @page { size: A4 portrait; margin: 0; } * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #1f2933; font-family: "Segoe UI", Arial, "Noto Sans", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", Helvetica, sans-serif; font-size: 10pt; line-height: 1.42; }
  html.export-mode-pdf, body.export-mode-pdf { width: 210mm; background: #ffffff; } html.export-mode-preview, body.export-mode-preview { width: auto; background: #eef3f8; }
  body.export-mode-pdf { width: 210mm; padding: 0; } body.export-mode-preview { padding: 8mm 0; }
  .pdf-document { width: 210mm; } body.export-mode-pdf .pdf-document { margin: 0; } body.export-mode-preview .pdf-document { margin: 0 auto; }
  .pdf-page { width: 210mm; height: 297mm; padding: 11mm 12.2mm 10.8mm; background: white; position: relative; display: flex; flex-direction: column; flex: none; overflow: hidden; page-break-after: always; page-break-inside: avoid; break-after: page; break-inside: avoid-page; box-sizing: border-box; }
  body.export-mode-preview .pdf-page { box-shadow: 0 1mm 4mm rgba(15, 23, 42, 0.08); margin: 0 0 8mm; } body.export-mode-pdf .pdf-page { box-shadow: none; margin: 0; }
  .pdf-page:last-child { page-break-after: auto; break-after: auto; } body.export-mode-preview .pdf-page:last-child { margin-bottom: 0; }
  .pdf-header { flex: 0 0 23.4mm; height: 23.4mm; display: flex; flex-direction: column; gap: 0.9mm; overflow: hidden; } .header-top { display: grid; grid-template-columns: minmax(36mm, 1fr) minmax(64mm, 114mm); align-items: start; gap: 6.2mm; }
  .logo-wrap { min-width: 0; display: flex; align-items: flex-start; } .logo { display: block; width: 36mm; max-width: 100%; max-height: 9.2mm; object-fit: contain; object-position: left center; }
  .header-meta { min-width: 0; text-align: right; } .product-code { color: ${escapeCssColor(template.primaryColor)}; font-size: ${pageModel.productCode.length > 48 ? "7.1pt" : "7.9pt"}; font-style: italic; font-weight: 700; line-height: 1.2; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }
  .gradient-line { height: 1.02mm; background: linear-gradient(90deg, ${escapeCssColor(template.accentColor)}, ${escapeCssColor(template.primaryColor)}); } .thin-line { height: 0.28mm; background: linear-gradient(90deg, ${escapeCssColor(template.accentColor)}, ${escapeCssColor(template.primaryColor)}); }
  .product-title { color: ${escapeCssColor(template.primaryColor)}; font-size: ${pageModel.title.length > 38 ? "7.05pt" : "8.15pt"}; font-style: italic; font-weight: 700; line-height: 1.16; text-align: right; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; }
  .pdf-body { flex: 1 1 auto; min-height: 0; height: 249.8mm; overflow: hidden; padding: 4.6mm 0 2.7mm; display: flex; flex-direction: column; gap: 0; } .pdf-body.layout-two-column { gap: 1.8mm; } .pdf-footer { flex: 0 0 12mm; height: 12mm; display: flex; flex-direction: column; justify-content: flex-end; color: #46505a; font-size: 7.45pt; overflow: hidden; }
  .footer-line { height: 0.28mm; margin-bottom: 1.55mm; background: ${escapeCssColor(template.primaryColor)}; } .footer-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 4mm; } .footer-center { text-align: center; } .footer-right { text-align: right; overflow-wrap: anywhere; word-break: break-word; }
  .page-body-block { break-inside: avoid; page-break-inside: avoid; flex: none; } .page-body-block.full-width-block { width: 100%; } .technical-columns { width: 100%; margin: 0; } .technical-columns-flow { column-count: 2; column-gap: 5.9mm; column-fill: balance; } .column-flow-item { break-inside: avoid-column; page-break-inside: avoid; margin: 0 0 1.8mm; } .column-flow-item.keep-cluster { display: inline-block; width: 100%; } .column-flow-item > *:last-child { margin-bottom: 0; } .figure-block { display: flex; flex-direction: column; gap: 1mm; break-inside: avoid; page-break-inside: avoid; margin: 0 0 1.7mm; }
  .figure-heading { margin-bottom: 0; } .figure-caption { margin: 0; color: #5c6670; font-size: 7pt; line-height: 1.18; text-align: center; overflow-wrap: anywhere; }
  .figure-image-wrap { display: flex; justify-content: center; align-items: center; width: 100%; } .content-image { display: block; width: auto; max-width: 100%; max-height: 112mm; height: auto; margin: 0 auto 0.85mm; object-fit: contain; }
  .content-image.figure-image { margin-bottom: 0; } .figure-image-size-small { max-width: 43%; } .figure-image-size-medium { max-width: 70%; } .figure-image-size-full { width: 100%; max-width: 100%; } .figure-image.figure-image-normal { max-height: 100mm; } .figure-image.figure-image-wide, .figure-image.figure-image-full-width { width: 100%; max-height: 82mm; } .figure-image.figure-image-tall { max-height: 126mm; width: auto; }
  h1, h2, h3 { display: block; clear: both; color: ${escapeCssColor(template.primaryColor)}; line-height: 1.18; break-after: avoid; page-break-after: avoid; } h1 { margin: 0 0 3mm; font-size: 15.2pt; } h2 { margin: 0 0 2.1mm; font-size: 11.2pt; } h3 { margin: 0 0 1.55mm; font-size: 10pt; }
  p { margin: 0 0 1.95mm; } hr { border: 0; border-top: 1px solid #c8d0d8; margin: 1.1mm 0 1.8mm; } ul, ol { margin: 0 0 2mm 5mm; padding-left: 4.2mm; } li { margin: 0 0 0.7mm; } a { color: ${escapeCssColor(template.primaryColor)}; text-decoration: underline; } .technical-var { font-weight: 600; white-space: nowrap; }
  table { width: 100%; max-width: 100%; margin: 0 0 1.95mm; border-collapse: collapse; table-layout: fixed; font-size: 6.9pt; line-height: 1.12; } thead { display: table-header-group; } th, td { border: 1px solid #c8d0d8; padding: 1.35px 2.8px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; } th { background: #edf3f7; color: ${escapeCssColor(template.primaryColor)}; font-weight: 700; letter-spacing: 0.008em; } .technical-table td:first-child, .technical-table th:first-child { width: 36%; } .technical-table-dense { font-size: 6.25pt; line-height: 1.06; } .technical-table-dense td, .technical-table-dense th { padding: 0.95px 2px; }
  .table-block + .table-block { margin-top: 0.75mm; } .table-review, .table-review-text { border-left: 1mm solid ${escapeCssColor(template.accentColor)}; background: #f7f9fb; padding: 1.8mm 2.6mm; color: #56616b; } .page-break { margin: 0; } strong { font-weight: 700; } em { font-style: italic; } u { text-decoration: underline; } sub, sup { font-size: 70%; line-height: 0; } .pdf-body.layout-two-column.layout-density-technical-dense { padding: 2.2mm 0 1.5mm; gap: 0.8mm; font-size: 7.55pt; line-height: 1.18; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-columns-flow { column-gap: 3.8mm; } .pdf-body.layout-two-column.layout-density-technical-dense .column-flow-item { margin: 0 0 0.8mm; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block { gap: 0.55mm; margin: 0 0 0.9mm; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-caption { font-size: 6.25pt; line-height: 1.12; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-wrap { justify-content: stretch; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-size-small { max-width: 92%; } .pdf-body.layout-two-column.layout-density-technical-dense .figure-block-column .figure-image-size-medium { max-width: 100%; } .pdf-body.layout-two-column.layout-density-technical-dense h1 { margin: 0 0 2.1mm; font-size: 12.8pt; } .pdf-body.layout-two-column.layout-density-technical-dense h2 { margin: 0 0 1.05mm; font-size: 9.35pt; } .pdf-body.layout-two-column.layout-density-technical-dense h3 { margin: 0 0 0.8mm; font-size: 8.45pt; } .pdf-body.layout-two-column.layout-density-technical-dense p { margin: 0 0 0.95mm; } .pdf-body.layout-two-column.layout-density-technical-dense ul, .pdf-body.layout-two-column.layout-density-technical-dense ol { margin: 0 0 0.95mm 4.2mm; padding-left: 3.8mm; } .pdf-body.layout-two-column.layout-density-technical-dense li { margin: 0 0 0.22mm; } .pdf-body.layout-two-column.layout-density-technical-dense hr { margin: 0.6mm 0 0.95mm; } .pdf-body.layout-two-column.layout-density-technical-dense table { margin: 0 0 0.95mm; font-size: 6.15pt; line-height: 1.08; } .pdf-body.layout-two-column.layout-density-technical-dense th, .pdf-body.layout-two-column.layout-density-technical-dense td { padding: 0.85px 2.1px; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense { font-size: 5.9pt; line-height: 1.04; } .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense td, .pdf-body.layout-two-column.layout-density-technical-dense .technical-table-dense th { padding: 0.75px 1.8px; }
  </style></head><body class="export-mode-${mode}"><div class="pdf-document">${pageModel.pages.map((page, index) => renderExportPageHtml(page, index, totalPages, template, pageModel)).join("")}</div></body></html>`;
}

export function renderExportPageHtml(page: ExportPage, index: number, totalPages: number, template: ExportTemplateSnapshot, pageModel: Pick<ExportPageModel, "title" | "productCode" | "logoSrc">) {
  return `<section class="pdf-page" data-page-number="${index + 1}" data-total-pages="${totalPages}"><header class="pdf-header"><div class="header-top"><div class="logo-wrap"><img class="logo" src="${escapeAttribute(pageModel.logoSrc)}" alt="${escapeAttribute(template.companyName || "Vellore Semicon")}" /></div><div class="header-meta"><div class="product-code">${escapeHtml(pageModel.productCode || "Product Code")}</div></div></div><div class="gradient-line"></div><div class="thin-line"></div><div class="product-title">${escapeHtml(pageModel.title || "Product Title")}</div></header><main class="pdf-body layout-${template.layoutMode} layout-density-${template.layoutDensity}">${renderPageBody(page.blocks, template.layoutMode, template.layoutDensity)}</main><footer class="pdf-footer"><div class="footer-line"></div><div class="footer-row"><div>${escapeHtml(template.website || "www.velloresemicon.com")}</div><div class="footer-center">${index + 1} / ${totalPages}</div><div class="footer-right">${escapeHtml(template.documentStatus || "Preliminary Datasheet")} | ${escapeHtml(template.revision || "Rev. A")}</div></div></footer></section>`;
}

export function renderTiptapNodesToExportBlocks(nodes: Array<Record<string, unknown>>, layoutOptions: RenderLayoutOptions = { layoutMode: "two-column", layoutDensity: "technical-dense" }): ExportBlock[] {
  const normalized = normalizeExportNodes(nodes);
  const rawBlocks = normalized.flatMap((node, index, source) => createBlocksForNode(node, source[index + 1], layoutOptions));
  return groupFigureBlocks(rawBlocks).filter((block) => block.kind === "break" || isMeaningfulBlock(block));
}

export function paginateExportBlocks(blocks: ExportBlock[], pageCapacity = PAGE_BODY_CAPACITY): ExportPage[] {
  const pages: ExportPage[] = [];
  let currentBlocks: ExportBlock[] = [];
  let currentHeight = 0;
  const pushPage = (locked = false) => {
    if (currentBlocks.length === 0) return;
    const page = { blocks: currentBlocks, usedHeight: currentHeight, locked };
    if (isMeaningfulPage(page)) pages.push(page);
    currentBlocks = [];
    currentHeight = 0;
  };
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.kind === "break") { pushPage(true); continue; }
    const next = findNextMeaningfulBlock(blocks, index + 1);
    const combinedHeight = block.kind === "html" && block.keepWithNext && next ? block.estimatedHeight + next.estimatedHeight : block.estimatedHeight;
    if (currentBlocks.length > 0 && currentHeight + combinedHeight > pageCapacity) pushPage();
    if (block.estimatedHeight > pageCapacity && currentBlocks.length > 0) pushPage();
    currentBlocks.push(block);
    currentHeight += Math.min(block.estimatedHeight, pageCapacity);
  }
  pushPage();
  return pages;
}

export function isMeaningfulPage(page: ExportPage) { return page.blocks.some(isMeaningfulBlock); }

function finalizeExportPages(pages: ExportPage[], pageCapacity = PAGE_BODY_CAPACITY): ExportPage[] {
  const filtered = pages.filter(isMeaningfulPage);
  if (filtered.length > 0) {
    const merged: ExportPage[] = [];
    for (const page of filtered) {
      const previous = merged.at(-1);
      if (previous && !previous.locked && isLowValuePage(page) && previous.usedHeight + page.usedHeight <= pageCapacity) {
        previous.blocks.push(...page.blocks);
        previous.usedHeight += page.usedHeight;
        continue;
      }
      merged.push({ blocks: [...page.blocks], usedHeight: page.usedHeight, locked: page.locked });
    }
    return merged;
  }
  const fallback: ExportPage = { blocks: [{ kind: "html", role: "paragraph", html: "<p>Editable datasheet draft</p>", estimatedHeight: 14, meaningful: true, plainText: "Editable datasheet draft", columnEligible: true, fullWidth: false }], usedHeight: 14 };
  return [fallback];
}

function renderBlock(block: ExportBlock) {
  if (block.kind === "table") return `<div class="page-body-block table-block full-width-block"><table class="${escapeAttribute(block.variantClass)}"><thead>${block.headerHtml}</thead><tbody>${block.rowHtml.join("")}</tbody></table></div>`;
  if (block.kind === "break") return "";
  return `<div class="page-body-block${block.kind === "html" && block.fullWidth ? " full-width-block" : ""}">${block.html}</div>`;
}

function renderPageBody(blocks: ExportBlock[], layoutMode: DatasheetLayoutMode, layoutDensity: DatasheetLayoutDensity) {
  return layoutMode === "single-column" ? blocks.map(renderBlock).join("") : renderTwoColumnPageBody(blocks, layoutDensity);
}

function renderTwoColumnPageBody(blocks: ExportBlock[], layoutDensity: DatasheetLayoutDensity) {
  const sections: string[] = [];
  let flowBlocks: HtmlBlock[] = [];
  const flushFlow = () => {
    if (flowBlocks.length === 0) return;
    sections.push(`<section class="page-body-block technical-columns technical-columns-density-${layoutDensity}"><div class="technical-columns-flow">${renderColumnFlowItems(flowBlocks)}</div></section>`);
    flowBlocks = [];
  };

  for (const block of blocks) {
    if (block.kind !== "html" || !isTwoColumnEligible(block)) {
      flushFlow();
      sections.push(renderBlock(block));
      continue;
    }
    flowBlocks.push(block);
  }

  flushFlow();
  return sections.join("");
}

function renderColumnFlowItems(blocks: HtmlBlock[]) {
  const items: string[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.keepWithNext && index + 1 < blocks.length) {
      items.push(`<div class="column-flow-item keep-cluster">${block.html}${blocks[index + 1].html}</div>`);
      index += 1;
      continue;
    }
    items.push(`<div class="column-flow-item">${block.html}</div>`);
  }
  return items.join("");
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
    if (!content.trim() || !plainText) return [];
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
    return [{ kind: "html", role: "image", html: renderImage(image, columnEligible), estimatedHeight: estimateImageHeight(image, layoutOptions, columnEligible), meaningful: true, plainText: image.alt || plainText || "Datasheet image", imageKey: image.imageKey, imageWidth: image.width, imageHeight: image.height, aspectRatio: image.aspectRatio, columnEligible, fullWidth: !columnEligible, displaySize: image.displaySize, variantClass: image.variantClass }];
  }
  if (type === "text") return plainText ? [{ kind: "html", role: "generic", html: renderTextNode(node), estimatedHeight: isTechnicalDense(layoutOptions) ? 5 : 6, meaningful: true, plainText, columnEligible: true, fullWidth: false }] : [];
  return content.trim() && plainText ? [{ kind: "html", role: "generic", html: content, estimatedHeight: estimatePlainTextHeight(plainText, isTechnicalDense(layoutOptions) ? 124 : 108, isTechnicalDense(layoutOptions) ? 5 : 6, isTechnicalDense(layoutOptions) ? 4 : 6), meaningful: true, plainText, columnEligible: true, fullWidth: false }] : [];
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
  return { kind: "html", role: "figure", html: `<section class="figure-block${columnEligible ? " figure-block-column" : ""}">${heading ? `<div class="figure-heading">${heading.html}</div>` : ""}${image ? `<div class="figure-image-wrap">${image.html}</div>` : ""}${captionHtml}</section>`, estimatedHeight: Math.min(blocks.reduce((sum, block) => sum + block.estimatedHeight, 0) + (columnEligible ? 1 : 4), PAGE_BODY_CAPACITY), meaningful: true, plainText: combinedText, imageKey: image?.imageKey, imageWidth: image?.imageWidth ?? null, imageHeight: image?.imageHeight ?? null, aspectRatio: image?.aspectRatio ?? null, columnEligible, fullWidth: !columnEligible, displaySize: image?.displaySize, variantClass: image?.variantClass };
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
  const headerHeight = dense ? 12 : 14;
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
  const widthStyle = image.displaySize === "full" || (!columnEligible && image.width && image.height && image.aspectRatio && image.aspectRatio > 1.85) ? "width: 100%;" : columnEligible && image.displaySize === "medium" ? "width: 100%;" : "";
  return `<img class="${classes}" src="${escapeAttribute(image.src)}" alt="${escapeAttribute(image.alt || "Datasheet figure")}"${image.width ? ` width="${image.width}"` : ""}${image.height ? ` height="${image.height}"` : ""} style="${widthStyle}" />`;
}

function parseImageDisplaySize(value: unknown): ImageDisplaySize {
  return value === "small" || value === "full" ? value : "medium";
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
  return /\b(qr|scan me|barcode)\b/.test(label) || /\b(logo|vellore semicon|www\.|http|datasheet studio)\b/.test(label) || /header|footer/.test(label);
}

function looksLikeFigureCaption(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return Boolean(normalized) && (isGenericCaptionText(normalized) || /^(figure|fig\.)\s*\d+[a-z]?([.:-]|\s)/i.test(normalized));
}

function isGenericCaptionText(text: string) { return /^image from source page\s+\d+$/i.test(text.replace(/\s+/g, " ").trim()); }
function isFigureCaptionBlock(block: ExportBlock | undefined): block is HtmlBlock { return Boolean(block && block.kind === "html" && block.role === "caption"); }
function isFigureHeadingBlock(block: ExportBlock | undefined): block is HtmlBlock { return Boolean(block && block.kind === "html" && block.role === "heading"); }
function stripOuterParagraph(html: string) { return html.replace(/^<p[^>]*>/, "").replace(/<\/p>$/, ""); }
function findNextMeaningfulBlock(blocks: ExportBlock[], startIndex: number) { for (let index = startIndex; index < blocks.length; index += 1) { const block = blocks[index]; if (block.kind !== "break" && isMeaningfulBlock(block)) return block; } return null; }
function isMeaningfulBlock(block: ExportBlock) { return block.kind === "break" ? false : block.kind === "table" ? block.rowHtml.length > 0 : Boolean(block.meaningful && (block.plainText?.trim() || block.role === "image" || block.role === "figure")); }
function isLowValuePage(page: ExportPage) {
  const meaningful = page.blocks.filter((block) => block.kind !== "break" && isMeaningfulBlock(block));
  if (meaningful.length === 0) return true;
  if (page.usedHeight <= 34) return true;
  if (meaningful.length === 1) {
    const first = meaningful[0];
    if (first.kind === "table") return first.rowHtml.length <= 3 && page.usedHeight <= 72;
    if (first.kind === "html" && (first.role === "figure" || first.role === "image")) return Boolean(first.columnEligible) && page.usedHeight <= 58;
  }
  return meaningful.length <= 2 && meaningful.every((block) => block.kind === "html" && (block.role === "caption" || block.role === "heading" || (block.role === "paragraph" && (block.plainText?.length ?? 0) <= 96)));
}
function estimateParagraphHeight(node: Record<string, unknown>, attrs: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim()); const dense = isTechnicalDense(layoutOptions); const base = estimatePlainTextHeight(text, dense ? 148 : 112, dense ? 4.35 : 6, dense ? 3.1 : 6); return attrs.class === "image-caption" || looksLikeFigureCaption(text) ? Math.max(dense ? 5.9 : 10, base - (dense ? 2.3 : 2)) : base; }
function estimateHeadingHeight(node: Record<string, unknown>, attrs: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(node).replace(/\s+/g, " ").trim()); const level = headingLevel(attrs); const dense = isTechnicalDense(layoutOptions); const perLine = level === 1 ? (dense ? 12.8 : 18) : level === 2 ? (dense ? 8.8 : 14) : (dense ? 7.9 : 12); const charsPerLine = level === 1 ? (dense ? 48 : 36) : dense ? 62 : 48; return Math.max(perLine, Math.ceil(Math.max(text.length, 1) / charsPerLine) * perLine + (dense ? 0.6 : 2)); }
function estimateImageHeight(image: Pick<ImageMeta, "width" | "height" | "aspectRatio" | "variantClass" | "displaySize">, layoutOptions: RenderLayoutOptions, columnEligible = false) { const dense = isTechnicalDense(layoutOptions); const scale = image.displaySize === "small" ? (columnEligible ? 0.94 : 0.43) : image.displaySize === "full" ? 1 : (columnEligible ? 1.02 : 0.68); const maxWidth = columnEligible ? COLUMN_IMAGE_MAX_WIDTH : IMAGE_MAX_WIDTH; const maxHeight = dense ? PAGE_BODY_IMAGE_MAX_DENSE : PAGE_BODY_IMAGE_MAX; if (image.aspectRatio && image.aspectRatio > 0) { const projected = (maxWidth * scale) / image.aspectRatio; const adjusted = image.variantClass === "figure-image-tall" ? Math.min(projected, maxHeight) : Math.min(projected + (columnEligible ? 1 : 4), maxHeight); return Math.max(columnEligible ? 16 : 22, adjusted); } if (image.width && image.height && image.height > 0) return Math.max(columnEligible ? 16 : 22, Math.min((maxWidth * scale * image.height) / image.width, maxHeight)); return columnEligible ? 26 : image.displaySize === "small" ? 38 : 64; }
function estimatePlainTextHeight(text: string, charsPerLine: number, lineUnit = 6, basePad = 6) { const normalized = text.replace(/\s+/g, " ").trim(); if (!normalized) return 0; const lines = Math.max(1, Math.ceil(normalized.length / charsPerLine)); return basePad + lines * lineUnit; }
function estimateTableRowHeight(row: Record<string, unknown>, layoutOptions: RenderLayoutOptions) { const text = normalizeTechnicalText(getPlainText(row).replace(/\s+/g, " ").trim()); const dense = isTechnicalDense(layoutOptions); return Math.max(dense ? 7.4 : 12, (dense ? 4.6 : 8) + Math.ceil(Math.max(text.length, 1) / (dense ? 72 : 48)) * (dense ? 3.2 : 5)); }
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
    .replace(/ΔVOUT/g, '<span class="technical-var">ΔV<sub>OUT</sub></span>')
    .replace(/\bVIN\b/g, '<span class="technical-var">V<sub>IN</sub></span>')
    .replace(/\bVOUT\b/g, '<span class="technical-var">V<sub>OUT</sub></span>')
    .replace(/\bIOUT\b/g, '<span class="technical-var">I<sub>OUT</sub></span>')
    .replace(/θSA/g, '<span class="technical-var">θ<sub>SA</sub></span>')
    .replace(/θJC/g, '<span class="technical-var">θ<sub>JC</sub></span>')
    .replace(/θCS/g, '<span class="technical-var">θ<sub>CS</sub></span>')
    .replace(/\bTA\b/g, '<span class="technical-var">T<sub>A</sub></span>')
    .replace(/\bTJ\b/g, '<span class="technical-var">T<sub>J</sub></span>')
    .replace(/\bPD\b/g, '<span class="technical-var">P<sub>D</sub></span>')
    .replace(/\bIQ\b/g, '<span class="technical-var">I<sub>Q</sub></span>')
    .replace(/\bVREF\b/g, '<span class="technical-var">V<sub>REF</sub></span>')
    .replace(/\bIADJ\b/g, '<span class="technical-var">I<sub>ADJ</sub></span>');
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }








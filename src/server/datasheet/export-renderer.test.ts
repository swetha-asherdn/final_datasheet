import { describe, expect, it, vi } from "vitest";
import {
  buildExportPageModel,
  paginateExportBlocks,
  renderDatasheetExportHtml,
  renderExportDocumentHtml,
  renderExportPageHtml,
  renderTiptapNodesToExportBlocks,
  type ExportPageModel,
  type ExportTemplateSnapshot,
} from "@/server/datasheet/export-renderer";

const template: ExportTemplateSnapshot = {
  logoAssetPath: "/branding/vellore-semicon-logo.svg",
  companyName: "Vellore Semicon",
  website: "www.velloresemicon.com",
  productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX",
  productTitle: "Low-Dropout Regulators",
  documentStatus: "Preliminary Datasheet",
  revision: "Rev. A",
  layoutMode: "two-column",
  layoutDensity: "technical-dense",
  pageFillStrategy: "balanced",
  primaryColor: "#0D2B55",
  accentColor: "#D6533E",
};

function createSimplePageModel() {
  return buildExportPageModel({
    template,
    document: {
      title: "Low-Dropout Regulators",
      productCode: template.productCode,
      productCategory: template.productTitle,
      editorJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Editable body" }] }],
      },
    },
  });
}

describe("export renderer", () => {
  it("uses explicit A4 page containers with separate header, body, and footer regions", () => {
    const pageModel = createSimplePageModel();
    const html = renderExportDocumentHtml(pageModel, template, { mode: "pdf" });

    expect(html).toContain("@page");
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("margin: 0;");
    expect(html).toContain('class="pdf-page"');
    expect(html).toContain('class="pdf-header"');
    expect(html).toContain('class="pdf-body layout-two-column layout-density-technical-dense"');
    expect(html).toContain('class="pdf-footer"');
    expect(html).toContain("CW29150R-XX / CW29150R-ADJ / CW29151R-XX");
    expect(html).toContain("Low-Dropout Regulators");
    expect(html).toContain("Preliminary Datasheet");
    expect(html).toContain("Rev. A");
    expect(html).toContain("www.velloresemicon.com");
    expect(html).toContain('data-page-number="1"');
    expect(html).toContain('data-total-pages="1"');
    expect(html).toContain("width: 210mm;");
    expect(html).toContain("height: 297mm;");
    expect(html).toContain("box-sizing: border-box;");
    expect(html).toContain("page-break-after: auto;");
  });

  it("exports modular page-model and page-render helpers for future preview reuse", () => {
    const pageModel = createSimplePageModel();

    expect(Array.isArray(pageModel.pages)).toBe(true);
    expect(pageModel.pages.length).toBe(1);
    expect(renderExportPageHtml(pageModel.pages[0], 0, pageModel.pages.length, template, pageModel)).toContain('class="pdf-footer"');
    expect(renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Page body" }] }],
        },
      },
    }, { mode: "pdf" })).toContain('class="pdf-page"');
  });

  it("separates preview styling from strict PDF print styling", () => {
    const pageModel = createSimplePageModel();
    const previewHtml = renderExportDocumentHtml(pageModel, template, { mode: "preview" });
    const pdfHtml = renderExportDocumentHtml(pageModel, template, { mode: "pdf" });

    expect(previewHtml).toContain("export-mode-preview");
    expect(previewHtml).toContain("padding: 8mm 0;");
    expect(previewHtml).toContain("box-shadow: 0 1mm 4mm rgba(15, 23, 42, 0.08);");
    expect(previewHtml).toContain("margin: 0 0 8mm;");
    expect(pdfHtml).toContain("export-mode-pdf");
    expect(pdfHtml).toContain("padding: 0;");
    expect(pdfHtml).toContain("box-shadow: none;");
    expect(pdfHtml).toContain("margin: 0;");
  });

  it("renders editor headings, paragraphs, lists, tables, images, and marks", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Features" }] },
            { type: "paragraph", content: [{ type: "text", text: "Fast response", marks: [{ type: "bold" }, { type: "italic" }] }] },
            { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Low dropout" }] }] }] },
            {
              type: "table",
              content: [
                { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
                { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Current limit" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "500mA" }] }] }] },
              ],
            },
            { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Figure 1" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("<h1>Features</h1>");
    expect(html).toContain("<em><strong>Fast response</strong></em>");
    expect(html).toContain("<ul>");
    expect(html).toContain('<table class="technical-table');
    expect(html).toContain('class="content-image figure-image');
    expect(html).toContain('class="figure-caption"');
  });

  it("splits heading-prefix paragraphs into real headings and body paragraphs", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", content: [{ type: "text", text: "GENERAL DESCRIPTION The CW29150R-XX is a high current regulator." }] },
      { type: "paragraph", content: [{ type: "text", text: "THERMAL DESIGN Linear regulators dissipate heat in the package." }] },
    ]);

    expect(blocks[0]?.kind).toBe("html");
    expect(blocks[0] && "html" in blocks[0] ? blocks[0].html : "").toContain("<h2>GENERAL DESCRIPTION</h2>");
    expect(blocks[1] && "html" in blocks[1] ? blocks[1].html : "").toContain("The CW29150R-XX is a high current regulator.");
    expect(blocks[2] && "html" in blocks[2] ? blocks[2].html : "").toContain("<h2>THERMAL DESIGN</h2>");
    expect(blocks[3] && "html" in blocks[3] ? blocks[3].html : "").toContain("Linear regulators dissipate heat in the package.");
  });

  it("does not create blank pages from explicit page breaks and empty blocks", () => {
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Intro text" }] },
            { type: "pageBreak" },
            { type: "paragraph", content: [{ type: "text", text: "   " }] },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Image from source page 1" }] },
            { type: "pageBreak" },
            { type: "paragraph", content: [{ type: "text", text: "Closing text" }] },
          ],
        },
      },
    });

    expect(pageModel.pages.length).toBe(2);
    expect(pageModel.pages.every((page) => page.blocks.length > 0)).toBe(true);
    expect(renderExportDocumentHtml(pageModel, template, { mode: "pdf" })).not.toContain('data-page-number="3"');
  });

  it("uses final filtered page count in the footer totals", () => {
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: Array.from({ length: 24 }, (_, index) => ({
            type: "paragraph",
            content: [{ type: "text", text: `Paragraph ${index + 1} ` + "content ".repeat(70) }],
          })),
        },
      },
    });
    const html = renderExportDocumentHtml(pageModel, template, { mode: "pdf" });

    const totalPages = pageModel.pages.length;
    expect(totalPages).toBeGreaterThan(1);
    expect(html).toContain(`1 / ${totalPages}`);
    expect(html).toContain(`${totalPages} / ${totalPages}`);
    expect((html.match(new RegExp(`data-total-pages="${totalPages}"`, "g")) ?? []).length).toBe(totalPages);
    expect((html.match(/class="pdf-page"/g) ?? []).length).toBe(totalPages);
  });

  it("packs small compatible blocks onto pages without unnecessary blank space explosions", () => {
    const blocks = renderTiptapNodesToExportBlocks(
      Array.from({ length: 10 }, (_, index) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Short paragraph ${index + 1} ` + "text ".repeat(12) }],
      })),
    );
    const pages = paginateExportBlocks(blocks);

    expect(pages.length).toBe(1);
    expect(pages[0]?.usedHeight).toBeGreaterThan(0);
  });

  it("splits large tables across meaningful fragments and repeats headers", () => {
    const tableRows = Array.from({ length: 22 }, (_, index) => ({
      type: "tableRow",
      content: [
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Parameter ${index + 1} with a long description that should force conservative row measurement across multiple lines` }] }] },
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${index + 1}.23V` }] }] },
      ],
    }));

    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [{
            type: "table",
            content: [
              { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
              ...tableRows,
            ],
          }],
        },
      },
    });
    const html = renderExportDocumentHtml(pageModel, template, { mode: "pdf" });

    expect((html.match(/<thead>/g) ?? []).length).toBeGreaterThan(1);
    expect((html.match(/table-block/g) ?? []).length).toBeGreaterThan(1);
    expect(pageModel.pages.every((page) => page.blocks.length > 0)).toBe(true);
    const tableBlockRowCounts = pageModel.pages.flatMap((page) => page.blocks.filter((block) => block.kind === "table").map((block) => block.rowHtml.length));
    expect(tableBlockRowCounts.every((count) => count >= 2)).toBe(true);
  });

  it("keeps small tables together when possible", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      {
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Current limit" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "500mA" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Dropout" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "250mV" }] }] }] },
        ],
      },
    ]);

    expect(blocks.filter((block) => block.kind === "table")).toHaveLength(1);
  });

  it("moves a large image to a safe page without creating blank pages around it", () => {
    const fillerParagraph = {
      type: "paragraph",
      content: [{ type: "text", text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(26) }],
    };
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            fillerParagraph,
            fillerParagraph,
            fillerParagraph,
            fillerParagraph,
            fillerParagraph,
            { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Tall chart", width: 600, height: 1100 } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
          ],
        },
      },
    });

    expect(pageModel.pages.length).toBeGreaterThan(1);
    expect(pageModel.pages.every((page) => page.blocks.length > 0)).toBe(true);
    expect(pageModel.pages.at(-1)?.blocks.some((block) => block.kind === "html" && block.html.includes("content-image"))).toBe(true);
  });

  it("hides generic source-page image captions while keeping the image", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Image from source page 1" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Image from source page 1" }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain('class="content-image figure-image');
    expect(html).not.toContain(">Image from source page 1</p>");
  });



  it("groups a heading, image, and caption into one anchored figure block", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "BLOCK DIAGRAM" }] },
            { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Block diagram", width: 1200, height: 500, imageKey: "diagram-1" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 3. Block diagram" }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect((html.match(/<section class="figure-block">/g) ?? []).length).toBe(1);
    expect(html).toContain("BLOCK DIAGRAM");
    expect(html).toContain("Figure 3. Block diagram");
  });

  it("does not emit duplicate image artifacts twice", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Figure 1", imageKey: "dup-1" } },
      { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
      { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Figure 1", imageKey: "dup-1" } },
    ]);

    expect(blocks.filter((block) => block.kind === "html" && block.role === "figure")).toHaveLength(1);
  });

  it("excludes likely logo or qr images from the export body", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Vellore Semicon logo" } },
      { type: "image", attrs: { src: "data:image/png;base64,efgh", alt: "Scan me QR" } },
      { type: "image", attrs: { src: "data:image/png;base64,ijkl", alt: "Pad location", width: 800, height: 600, imageKey: "pad-location" } },
    ]);

    expect(blocks.filter((block) => block.kind === "html")).toHaveLength(1);
    expect(blocks[0] && "html" in blocks[0] ? blocks[0].html : "").toContain("content-image");
  });

  it("honors keep-with-next metadata from editor content", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", attrs: { keepWithNext: true }, content: [{ type: "text", text: "Keep this note with the next block." }] },
      { type: "paragraph", content: [{ type: "text", text: "Following block." }] },
    ]);

    const first = blocks[0];
    expect(first && first.kind === "html" ? first.keepWithNext : false).toBe(true);
  });

  it("renders image display size metadata into export classes", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "image", attrs: { src: "data:image/png;base64,small", alt: "Small diagram", width: 800, height: 400, imageKey: "small", displaySize: "small" } },
            { type: "image", attrs: { src: "data:image/png;base64,full", alt: "Full diagram", width: 1400, height: 500, imageKey: "full", displaySize: "full" } },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("figure-image-size-small");
    expect(html).toContain("figure-image-size-full");
    expect(html).toContain('style="width: 100%;"');
  });

  it("uses image aspect ratio to estimate placement for wide and tall diagrams", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "image", attrs: { src: "data:image/png;base64,wide", alt: "Wide diagram", width: 1800, height: 500, imageKey: "wide" } },
      { type: "image", attrs: { src: "data:image/png;base64,tall", alt: "Tall diagram", width: 500, height: 1600, imageKey: "tall" } },
    ]);

    const wide = blocks[0];
    const tall = blocks[1];
    expect(wide && wide.kind === "html" ? wide.estimatedHeight : 0).toBeLessThan(tall && tall.kind === "html" ? tall.estimatedHeight : 0);
  });
  it("keeps long product metadata inside the header structure", () => {
    const pageModel: ExportPageModel = buildExportPageModel({
      template: {
        ...template,
        productCode: "CW29150R-XX / CW29150R-ADJ / CW29151R-XX / CW29152R-ADJ / CW29153R-XX",
        productTitle: "Very Long Low-Dropout Regulator Product Family",
      },
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
      },
    });
    const html = renderExportDocumentHtml(pageModel, {
      ...template,
      productCode: pageModel.productCode,
      productTitle: pageModel.title,
    }, { mode: "pdf" });

    expect(html).toContain('class="product-code"');
    expect(html).toContain('class="product-title"');
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("font-size: 7.1pt");
  });

  it("allows small figures to stay inside a column while large diagrams remain full width", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "image", attrs: { src: "data:image/png;base64,small", alt: "Typical application", width: 520, height: 360, imageKey: "small-figure", displaySize: "small" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
            { type: "image", attrs: { src: "data:image/png;base64,large", alt: "Pad location diagram", width: 1600, height: 700, imageKey: "pad-location", displaySize: "medium" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 2. Pad location diagram" }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("figure-block-column");
    expect(html).toContain("figure-image-column");
    expect(html).toContain("full-width-block");
    expect(html).toContain("Pad location diagram");
  });

  it("keeps explicit page breaks while still avoiding caption-only auto pages", () => {
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Intro text" }] },
            { type: "pageBreak" },
            { type: "paragraph", content: [{ type: "text", text: "Closing text" }] },
          ],
        },
      },
    });

    expect(pageModel.pages.length).toBe(2);

    const autoPacked = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 1 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 2 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 3 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 4 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 5 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 6 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 7 content content content content content content content content content content" }] },
            { type: "paragraph", content: [{ type: "text", text: "Dense paragraph 8 content content content content content content content content content content" }] },
            { type: "image", attrs: { src: "data:image/png;base64,small", alt: "Typical application", width: 520, height: 360, imageKey: "packed-small", displaySize: "small" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 3. Typical application" }] },
          ],
        },
      },
    });

    expect(autoPacked.pages.every((page) => page.blocks.some((block) => block.kind !== "html" || block.role !== "caption"))).toBe(true);
  });

  it("supports comfortable density in preview/export output", () => {
    const html = renderDatasheetExportHtml({
      template: { ...template, layoutDensity: "comfortable" },
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Comfortable body" }] }] },
      },
    }, { mode: "pdf" });

    expect(html).toContain('class="pdf-body layout-two-column layout-density-comfortable"');
    expect(html).not.toContain('class="pdf-body layout-two-column layout-density-technical-dense"');
  });
  it("renders two-column technical sections while keeping figures and tables full width", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "GENERAL DESCRIPTION" }] },
            { type: "paragraph", content: [{ type: "text", text: "Technical overview paragraph for column flow." }] },
            { type: "paragraph", content: [{ type: "text", text: "Additional column paragraph with VIN and V OUT <= 5V." }] },
            { type: "table", content: [
              { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
              { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Current limit" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "10uA" }] }] }] },
            ] },
            { type: "image", attrs: { src: "data:image/png;base64,abcd", alt: "Block diagram", width: 1200, height: 500 } },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("layout-two-column");
    expect(html).toContain("layout-density-technical-dense");
    expect(html).toContain("technical-columns-flow");
    expect(html).toContain(".pdf-body.layout-two-column.layout-density-technical-dense .technical-columns-flow { gap: 4.2mm; }");
    expect(html).toContain("font-size: 8.2pt;");
    expect(html).toContain("line-height: 1.28;");
    expect(html).toContain("class=\"page-body-block table-block\"");
    expect(html).toContain("figure-image");
  });

  it("keeps single-column output when requested", () => {
    const html = renderDatasheetExportHtml({
      template: { ...template, layoutMode: "single-column" },
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Single column body" }] }] },
      },
    }, { mode: "pdf" });

    expect(html).toContain("layout-single-column");
    expect(html).toContain("layout-density-technical-dense");
    expect(html).not.toContain('<section class="page-body-block technical-columns">');
  });

  it("normalizes technical symbols and variable rendering in export text", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: `10uA 47uF 200x200 um ${String.fromCharCode(0xf044)}V OUT ${String.fromCharCode(0xf071)} SA T A <= 125\u00b0\u0421 V OUT <= 5V I OUT >= 1A` }] }],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("10µA");
    expect(html).toContain("ΔV<sub>OUT</sub>");
    expect(html).toContain("θ<sub>SA</sub>");
    expect(html).toContain("T<sub>A</sub>");
    expect(html).toContain("47µF");
    expect(html).toContain("200×200 µm");
    expect(html).toContain("≤ 5V");
    expect(html).toContain("≥ 1A");
    expect(html).toContain("V<sub>OUT</sub>");
    expect(html).toContain("I<sub>OUT</sub>");
  });

  it("uses a less conservative dense table height estimate than comfortable mode", () => {
    const nodes = [{
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Output current limit over line and load regulation test case" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1.5A" }] }] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Dropout voltage at 500mA and 1A load conditions" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "250mV" }] }] }] },
      ],
    }];

    const denseBlocks = renderTiptapNodesToExportBlocks(nodes, { layoutMode: "two-column", layoutDensity: "technical-dense" });
    const comfortableBlocks = renderTiptapNodesToExportBlocks(nodes, { layoutMode: "two-column", layoutDensity: "comfortable" });
    const denseTable = denseBlocks.find((block) => block.kind === "table");
    const comfortableTable = comfortableBlocks.find((block) => block.kind === "table");

    expect(denseTable && denseTable.kind === "table" ? denseTable.estimatedHeight : 0).toBeLessThan(
      comfortableTable && comfortableTable.kind === "table" ? comfortableTable.estimatedHeight : 0,
    );
  });

  it("keeps a small dense table and following paragraph on the same page when space remains", () => {
    const intro = { type: "paragraph", content: [{ type: "text", text: "Dense introduction paragraph. ".repeat(18) }] };
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            intro,
            intro,
            {
              type: "table",
              content: [
                { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
                { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Current limit" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1.5A" }] }] }] },
                { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Dropout voltage" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "250mV" }] }] }] },
              ],
            },
            { type: "paragraph", content: [{ type: "text", text: "Follow-on application guidance should remain on the same page when there is still safe space below the table." }] },
          ],
        },
      },
    });

    expect(pageModel.pages).toHaveLength(1);
    expect(pageModel.pages[0]?.blocks.some((block) => block.kind === "table")).toBe(true);
    expect(pageModel.pages[0]?.blocks.some((block) => block.kind === "html" && block.role === "paragraph" && block.plainText?.includes("Follow-on application guidance"))).toBe(true);
  });

  it("escapes dangerous HTML and scripts from editor content", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Safe",
        productCode: "SAFE-1",
        productCategory: "Safe",
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
            { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('href="#"');
  });
  it("uses a tighter technical-dense table profile than the comfortable base rules", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [{
            type: "table",
            content: [
              { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
              { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Output current" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1.5A" }] }] }] },
            ],
          }],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("font-size: 6.15pt;");
    expect(html).toContain("font-size: 5.9pt;");
    expect(html).toContain("padding: 0.75px 1.8px;");
    expect(html).toContain("margin: 0 0 0.95mm;");
  });

  it("keeps a small column figure on the same page as nearby dense body text when space is available", () => {
    const intro = { type: "paragraph", content: [{ type: "text", text: "Dense introduction paragraph. ".repeat(14) }] };
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            intro,
            intro,
            intro,
            { type: "image", attrs: { src: "data:image/png;base64,small", alt: "Typical application", width: 520, height: 360, imageKey: "dense-small", displaySize: "small" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 8. Typical application" }] },
          ],
        },
      },
    });

    expect(pageModel.pages).toHaveLength(1);
    expect(pageModel.pages[0]?.blocks.some((block) => block.kind === "html" && block.role === "figure" && block.columnEligible)).toBe(true);
  });

  it("normalizes dirty editor content before export pagination", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", content: [{ type: "text", text: "   " }] },
      { type: "paragraph", content: [{ type: "text", text: "Image from source page 2" }] },
      { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
      { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
      { type: "paragraph", content: [{ type: "text", text: "Useful application text" }] },
    ]);

    expect(blocks.some((block) => block.kind === "html" && block.plainText?.includes("Image from source page"))).toBe(false);
    expect(blocks.filter((block) => block.kind === "html" && block.role === "caption")).toHaveLength(1);
    expect(blocks.some((block) => block.kind === "html" && block.plainText === "Useful application text")).toBe(true);
  });

  it("compacts loose feature and application paragraphs into export-only lists", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "FEATURES" }] },
      { type: "paragraph", content: [{ type: "text", text: "Low dropout voltage" }] },
      { type: "paragraph", content: [{ type: "text", text: "Fast transient response" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "APPLICATIONS" }] },
      { type: "paragraph", content: [{ type: "text", text: "Post regulators" }] },
      { type: "paragraph", content: [{ type: "text", text: "Battery-powered systems" }] },
    ]);

    const lists = blocks.filter((block) => block.kind === "html" && block.role === "list");
    expect(lists).toHaveLength(2);
    expect(lists[0] && "html" in lists[0] ? lists[0].html : "").toContain("<li>Low dropout voltage</li>");
    expect(blocks.filter((block) => block.kind === "html" && block.role === "paragraph")).toHaveLength(0);
  });

  it("normalizes technical symbols inside table cells without changing normal English words", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [{
            type: "table",
            content: [
              { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
              { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "V OUT <= 5V minimum maximum aluminum" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "10 Âµ F and 20 Âµ A" }] }] }] },
            ],
          }],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("V<sub>OUT</sub>");
    expect(html).toContain("≤ 5V");
    expect(html).toContain("10µF");
    expect(html).toContain("20µA");
    expect(html).toContain("minimum maximum aluminum");
  });

  it("classifies small figures so pin and typical application artwork can appear earlier", () => {
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "TYPICAL APPLICATION" }] },
            { type: "paragraph", content: [{ type: "text", text: "A compact application schematic is shown below." }] },
            { type: "image", attrs: { src: "data:image/png;base64,typical", alt: "Typical application schematic", width: 520, height: 360, imageKey: "typical-app", displaySize: "small" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 1. Typical application" }] },
          ],
        },
      },
    });

    expect(pageModel.pages).toHaveLength(1);
    expect(pageModel.pages[0]?.blocks.some((block) => block.kind === "html" && block.role === "figure" && block.blockClass === "small-figure" && block.columnEligible)).toBe(true);
  });

  it("uses page fill scoring to pull compatible content after a table fragment without crossing manual breaks", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      {
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Current limit" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1.5A" }] }] }] },
          { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Dropout voltage" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "250mV" }] }] }] },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Compatible follow-on text can backfill the same page." }] },
    ]);
    const pages = paginateExportBlocks(blocks, 42);
    const modelPages = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [
          { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
          { type: "pageBreak" },
          { type: "paragraph", content: [{ type: "text", text: "After break" }] },
        ] },
      },
    }).pages;

    expect(pages).toHaveLength(1);
    expect(pages[0]?.blocks.some((block) => block.kind === "table")).toBe(true);
    expect(pages[0]?.blocks.some((block) => block.kind === "html" && block.role === "paragraph")).toBe(true);
    expect(modelPages).toHaveLength(2);
  });

  it("keeps comfortable and single-column modes compatible with export cleanup", () => {
    const comfortable = renderDatasheetExportHtml({
      template: { ...template, layoutDensity: "comfortable" },
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Image from source page 5" }] }, { type: "paragraph", content: [{ type: "text", text: "Comfortable real body" }] }] },
      },
    }, { mode: "pdf" });
    const singleColumn = renderDatasheetExportHtml({
      template: { ...template, layoutMode: "single-column" },
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Single-column body" }] }] },
      },
    }, { mode: "pdf" });

    expect(comfortable).toContain('layout-density-comfortable');
    expect(comfortable).not.toContain("Image from source page 5");
    expect(singleColumn).toContain("layout-single-column");
    expect(singleColumn).not.toContain('<section class="page-body-block technical-columns">');
  });

  it("recovers compact bullets from a merged FEATURES paragraph", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", content: [{ type: "text", text: "FEATURES High Current Capability 1.5A Low-Dropout Voltage 450mV Low Ground Current Accurate 1% Guaranteed Tolerance Extremely Fast Transient Response Reverse-battery and Load Dump Protection Zero-Current Shutdown Mode" }] },
    ]);

    const heading = blocks.find((block) => block.kind === "html" && block.role === "heading");
    const list = blocks.find((block) => block.kind === "html" && block.role === "list");

    expect(heading && "html" in heading ? heading.html : "").toContain("FEATURES");
    expect(list && "html" in list ? list.html : "").toContain("<li>High Current Capability 1.5A</li>");
    expect(list && "html" in list ? list.html : "").toContain("<li>Low-Dropout Voltage 450mV</li>");
    expect(list && "html" in list ? list.html : "").toContain("<li>Low Ground Current</li>");
    expect(blocks.filter((block) => block.kind === "html" && block.role === "paragraph")).toHaveLength(0);
  });

  it("prints page-fill debug decisions with rejection reasons in development", () => {
    const previousDebug = process.env.DEBUG_EXPORT_LAYOUT;
    process.env.DEBUG_EXPORT_LAYOUT = "1";
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      buildExportPageModel({
        template,
        document: {
          title: "Low-Dropout Regulators",
          productCode: template.productCode,
          productCategory: template.productTitle,
          editorJson: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Dense paragraph ".repeat(160) }] },
              { type: "table", content: [
                { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
                ...Array.from({ length: 10 }, (_, index) => ({ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Parameter ${index + 1}` }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${index + 1}.0V` }] }] }] })),
              ] },
            ],
          },
        },
      });
      expect(spy).toHaveBeenCalledWith("[export-layout]", expect.arrayContaining([
        expect.objectContaining({ remainingHeight: expect.any(Number), blocksPlaced: expect.any(Array), finalizedBecause: expect.any(String) }),
      ]));
      const report = spy.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
      expect(JSON.stringify(report)).toContain("nextBlockReason");
    } finally {
      process.env.DEBUG_EXPORT_LAYOUT = previousDebug;
      spy.mockRestore();
    }
  });

  it("splits a leading table fragment to backfill sparse technical-dense pages", () => {
    const filler = { type: "paragraph", content: [{ type: "text", text: "Dense regulator description with operating notes. ".repeat(55) }] };
    const table = {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
        ...Array.from({ length: 34 }, (_, index) => ({
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Electrical characteristic row ${index + 1} with line regulation load regulation dropout voltage and output current limit condition` }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${index + 1}.25V` }] }] },
          ],
        })),
      ],
    };
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: { type: "doc", content: [filler, table, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "APPLICATION INFORMATION" }] }, { type: "paragraph", content: [{ type: "text", text: "Follow-on text should begin after a table fragment when space is available." }] }] },
      },
    });

    const pagesWithTables = pageModel.pages.filter((page) => page.blocks.some((block) => block.kind === "table"));
    expect(pagesWithTables.length).toBeGreaterThan(1);
    expect(pageModel.pages.slice(0, -1).some((page) => page.blocks.some((block) => block.kind === "table") && page.usedHeight >= 0.7 * 264)).toBe(true);
  });

  it("pulls a medium column figure forward when a sparse page has room", () => {
    const pageModel = buildExportPageModel({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Dense introductory operating description. ".repeat(82) }] },
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "TYPICAL APPLICATION" }] },
            { type: "image", attrs: { src: "data:image/png;base64,medium", alt: "Fixed-output typical application", width: 700, height: 460, imageKey: "fixed-output", displaySize: "medium" } },
            { type: "paragraph", attrs: { class: "image-caption" }, content: [{ type: "text", text: "Figure 2. Fixed-output regulator" }] },
          ],
        },
      },
    });

    expect(pageModel.pages.slice(0, 2).some((page) => page.blocks.some((block) => block.kind === "html" && block.role === "figure" && block.columnEligible))).toBe(true);
  });

  it("renders recovered FEATURES and APPLICATIONS as visible compact bullet lists", () => {
    const html = renderDatasheetExportHtml({
      template,
      document: {
        title: "Low-Dropout Regulators",
        productCode: template.productCode,
        productCategory: template.productTitle,
        editorJson: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "FEATURES High Current Capability 1.5A Low-Dropout Voltage 450mV Low Ground Current" }] },
            { type: "paragraph", content: [{ type: "text", text: "APPLICATIONS Battery-powered systems Post regulators Industrial supplies" }] },
          ],
        },
      },
    }, { mode: "pdf" });

    expect(html).toContain("<h2>FEATURES</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>High Current Capability 1.5A</li>");
    expect(html).toContain("<h2>APPLICATIONS</h2>");
    expect(html).toContain("<li>Battery-powered systems</li>");
  });
  it("splits an oversized paragraph across pages in fill-forward mode", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", content: [{ type: "text", text: "Dense technical paragraph with regulator behavior and operating notes. ".repeat(90) }] },
    ]);

    const pages = paginateExportBlocks(blocks, 42);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.usedHeight <= 42)).toBe(true);
    expect(pages.every((page) => page.blocks.some((block) => block.kind === "html" && block.role === "paragraph"))).toBe(true);
  });

  it("splits long bullet lists by item while preserving list blocks", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "bulletList", content: Array.from({ length: 9 }, (_, index) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Feature item ${index + 1} with compact technical wording` }] }] })) },
    ]);

    const pages = paginateExportBlocks(blocks, 24);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.blocks.some((block) => block.kind === "html" && block.role === "list"))).toBe(true);
  });

  it("prevents a final one-row table fragment when splitting fill-forward pages", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      {
        type: "table",
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Parameter" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }] },
          ...Array.from({ length: 10 }, (_, index) => ({ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Electrical characteristic row ${index + 1} with dropout voltage line regulation and current limit notes` }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${index + 1}.0V` }] }] }] })),
        ],
      },
    ]);

    const pages = paginateExportBlocks(blocks, 44);
    const lastTable = pages.at(-1)?.blocks.find((block) => block.kind === "table");

    expect(pages.length).toBeGreaterThan(1);
    expect(lastTable && lastTable.kind === "table" ? lastTable.rowHtml.length : 0).toBeGreaterThan(1);
  });

  it("keeps adjustable regulator, error flag, and enable input sections separate", () => {
    const blocks = renderTiptapNodesToExportBlocks([
      { type: "paragraph", content: [{ type: "text", text: "ADJUSTABLE REGULATOR DESIGN Figure 3 shows the resistor divider and where VOUT is the desired output voltage." }] },
      { type: "paragraph", content: [{ type: "text", text: "ERROR FLAG The error flag output pulls low when the regulator falls out of regulation." }] },
      { type: "paragraph", content: [{ type: "text", text: "ENABLE INPUT The enable input turns the regulator on and off without disturbing the error flag section." }] },
      { type: "paragraph", content: [{ type: "text", text: "BLOCK DIAGRAM Internal control blocks are shown below." }] },
    ]);

    const headings = blocks.filter((block) => block.kind === "html" && block.role === "heading").map((block) => block.kind === "html" ? block.plainText : "");

    expect(headings).toContain("ADJUSTABLE REGULATOR DESIGN");
    expect(headings).toContain("ERROR FLAG");
    expect(headings).toContain("ENABLE INPUT");
    expect(headings).toContain("BLOCK DIAGRAM");
  });

});













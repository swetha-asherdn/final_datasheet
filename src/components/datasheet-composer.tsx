"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowDown, ArrowUp, Bold, Download, ExternalLink, EyeOff, FileDown, FilePlus2, Heading1, Heading2, ImageIcon, Italic, List, ListOrdered, Maximize2, RefreshCcw, Save, SplitSquareVertical, SubscriptIcon, SuperscriptIcon, Table2, UnderlineIcon } from "lucide-react";
import { ExtractionReview } from "@/components/extraction-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectStatus = "DRAFT" | "UPLOADED" | "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";
type ComposerTab = "extraction" | "editor" | "paged-layout" | "paged-preview" | "template" | "cleanup" | "export";
type CleanupFilter = "all" | "removed-text" | "removed-images" | "uncertain" | "restored";
type CleanupItem = { id: string; itemType: "text" | "image"; pageNumber: number; text?: string; storageKey?: string; confidence: number; reasons: string[]; decision: string };
type CleanupReport = { removedTextBlocks: CleanupItem[]; removedImages: CleanupItem[]; uncertainItems: CleanupItem[]; confidence: number; reasonCodes: string[] };
type DatasheetDocument = { id: string; status: string; title: string; productCode: string; productCategory: string; editorJson: JSONContent; sourceCleanupReport: CleanupReport; lastSavedAt: string };
type TemplateSettings = { id: string; logoAssetPath: string; companyName: string; website: string; productCode: string; productTitle: string; documentStatus: string; revision: string; layoutMode: "two-column" | "single-column"; layoutDensity: "comfortable" | "technical-dense"; pageFillStrategy: "safe" | "balanced" | "aggressive"; primaryColor: string; accentColor: string; footerText: string; showPageNumbers: boolean };
type DatasheetQualitySummary = { sectionsDetected: number; tablesDetected: number; figuresDetected: number; warningsCount: number; unresolvedSymbolsCount: number; warnings?: string[] };
type DatasheetBundle = { document: DatasheetDocument; template: TemplateSettings; qualitySummary?: DatasheetQualitySummary };
type DatasheetLayoutExportMode = "auto" | "saved";
type DatasheetLayoutBlock = {
  id: string;
  sourceBlockId?: string | null;
  kind: "html" | "table";
  blockType: "heading" | "paragraph" | "list" | "table" | "image" | "caption" | "section" | "rule" | "generic" | "figure";
  column: "left" | "right" | "full";
  flowSlot: number;
  hiddenFromExport: boolean;
  widthPreset: "small" | "medium" | "large" | "full" | "auto";
  keepWithCaption: boolean;
  keepTogether: boolean;
  allowSplit: boolean;
  preventOrphanRows: boolean;
  pageBreakBefore: boolean;
  plainText: string;
  estimatedHeight: number;
  role?: string;
  html?: string;
  fullWidth?: boolean;
  columnEligible?: boolean;
  displaySize?: "small" | "medium" | "full";
  variantClass?: string;
  blockClass?: string;
  imageKey?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  aspectRatio?: number | null;
  headerHtml?: string;
  rowHtml?: string[];
  rowHeights?: number[];
};
type DatasheetLayoutPage = { pageNumber: number; usedHeight: number; bodyHeight: number; warnings: string[]; blocks: DatasheetLayoutBlock[] };
type DatasheetLayout = { id: string; projectId: string; datasheetDocumentId: string; exportMode: DatasheetLayoutExportMode; templateSnapshot: Pick<TemplateSettings, "logoAssetPath" | "companyName" | "website" | "productCode" | "productTitle" | "documentStatus" | "revision" | "layoutMode" | "layoutDensity" | "pageFillStrategy" | "primaryColor" | "accentColor">; pages: DatasheetLayoutPage[]; warnings: string[]; lastGeneratedAt: string; lastSavedAt: string; updatedAt: string };
type LayoutLoadState = "idle" | "loading" | "ready" | "missing" | "failed";
type DatasheetExport = { id: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; filename: string; fileSize: number | null; errorMessage: string | null; completedAt: string | null; createdAt: string; downloadUrl: string | null };
type SaveState = "idle" | "saving" | "saved" | "failed";
type ExportState = "idle" | "loading" | "exporting" | "failed";
type ApiErrorBody = { error?: { message?: string; code?: string; details?: unknown } };

type Notice = { tone: "error" | "success"; text: string } | null;

const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-break", class: "page-break" }), ["span", { class: "page-break-label" }, "Page Break"]];
  },
});

const layoutMetadataNodeTypes = ["paragraph", "heading", "bulletList", "orderedList", "image", "table", "horizontalRule"];

type LayoutPreferenceWidth = "auto" | "column" | "half" | "full";
type LayoutPreferencePlacement = "auto" | "current-page" | "previous-page" | "next-page";
type LayoutPriority = "normal" | "high";

type LayoutAttributes = {
  blockId?: string | null;
  keepWithNext?: boolean;
  keepWithPrevious?: boolean;
  forcePageBreakBefore?: boolean;
  forcePageBreakAfter?: boolean;
  allowSplit?: boolean;
  avoidOrphan?: boolean;
  preferredWidth?: LayoutPreferenceWidth;
  preferredPlacement?: LayoutPreferencePlacement;
  priority?: LayoutPriority;
  hiddenFromExport?: boolean;
  keepSectionTogether?: boolean;
  minimumRowsPerFragment?: number;
};

const LayoutMetadata = Extension.create({
  name: "layoutMetadata",
  addGlobalAttributes() {
    return [{
      types: layoutMetadataNodeTypes,
      attributes: {
        blockId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-block-id"),
          renderHTML: (attributes) => attributes.blockId ? { "data-block-id": String(attributes.blockId) } : {},
        },
        keepWithNext: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-keep-with-next") === "true",
          renderHTML: (attributes) => attributes.keepWithNext ? { "data-keep-with-next": "true" } : {},
        },
        keepWithPrevious: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-keep-with-previous") === "true",
          renderHTML: (attributes) => attributes.keepWithPrevious ? { "data-keep-with-previous": "true" } : {},
        },
        forcePageBreakBefore: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-page-break-before") === "true",
          renderHTML: (attributes) => attributes.forcePageBreakBefore ? { "data-page-break-before": "true" } : {},
        },
        forcePageBreakAfter: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-page-break-after") === "true",
          renderHTML: (attributes) => attributes.forcePageBreakAfter ? { "data-page-break-after": "true" } : {},
        },
        allowSplit: {
          default: true,
          parseHTML: (element) => element.getAttribute("data-allow-split") !== "false",
          renderHTML: (attributes) => attributes.allowSplit === false ? { "data-allow-split": "false" } : {},
        },
        avoidOrphan: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-avoid-orphan") === "true",
          renderHTML: (attributes) => attributes.avoidOrphan ? { "data-avoid-orphan": "true" } : {},
        },
        preferredWidth: {
          default: "auto",
          parseHTML: (element) => element.getAttribute("data-preferred-width") || "auto",
          renderHTML: (attributes) => attributes.preferredWidth && attributes.preferredWidth !== "auto" ? { "data-preferred-width": String(attributes.preferredWidth) } : {},
        },
        preferredPlacement: {
          default: "auto",
          parseHTML: (element) => element.getAttribute("data-preferred-placement") || "auto",
          renderHTML: (attributes) => attributes.preferredPlacement && attributes.preferredPlacement !== "auto" ? { "data-preferred-placement": String(attributes.preferredPlacement) } : {},
        },
        priority: {
          default: "normal",
          parseHTML: (element) => element.getAttribute("data-priority") || "normal",
          renderHTML: (attributes) => attributes.priority && attributes.priority !== "normal" ? { "data-priority": String(attributes.priority) } : {},
        },
        hiddenFromExport: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-hidden-from-export") === "true",
          renderHTML: (attributes) => attributes.hiddenFromExport ? { "data-hidden-from-export": "true" } : {},
        },
        keepSectionTogether: {
          default: false,
          parseHTML: (element) => element.getAttribute("data-keep-section-together") === "true",
          renderHTML: (attributes) => attributes.keepSectionTogether ? { "data-keep-section-together": "true" } : {},
        },
        minimumRowsPerFragment: {
          default: 2,
          parseHTML: (element) => Number(element.getAttribute("data-min-rows-fragment") || 2),
          renderHTML: (attributes) => Number(attributes.minimumRowsPerFragment || 2) > 2 ? { "data-min-rows-fragment": String(attributes.minimumRowsPerFragment) } : {},
        },
      },
    }];
  },
});

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      displaySize: {
        default: "medium",
        parseHTML: (element) => element.getAttribute("data-display-size") || "medium",
        renderHTML: (attributes) => {
          const displaySize = attributes.displaySize || "medium";
          return {
            "data-display-size": displaySize,
            class: `datasheet-editor-image datasheet-editor-image-${displaySize}`,
          };
        },
      },
    };
  },
});

const editorExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  TextStyle,
  Color,
  Underline,
  Link.configure({ openOnClick: false }),
  ResizableImage.configure({ allowBase64: false }),
  PageBreak,
  LayoutMetadata,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  Subscript,
  Superscript,
  Placeholder.configure({ placeholder: "Start shaping the datasheet body..." }),
  TextAlign.configure({ types: ["heading", "paragraph"] })
];

export function DatasheetComposer({ projectId, status, originalPdfUrl }: { projectId: string; status: ProjectStatus; originalPdfUrl: string }) {
  const [tab, setTab] = useState<ComposerTab>("extraction");
  const [bundle, setBundle] = useState<DatasheetBundle | null>(null);
  const [layout, setLayout] = useState<DatasheetLayout | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [layoutState, setLayoutState] = useState<LayoutLoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [layoutSaveState, setLayoutSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [exports, setExports] = useState<DatasheetExport[]>([]);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [hasUnsavedEditorChanges, setHasUnsavedEditorChanges] = useState(false);
  const [hasUnsavedTemplateChanges, setHasUnsavedTemplateChanges] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewMode, setPreviewMode] = useState<DatasheetLayoutExportMode>("auto");
  const [exportMode, setExportMode] = useState<DatasheetLayoutExportMode>("auto");
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const canCreate = status === "REVIEW_REQUIRED";
  const canRegenerate = Boolean(bundle);
  const hasUnsavedChanges = hasUnsavedEditorChanges || hasUnsavedTemplateChanges;

  useEffect(() => {
    void loadDatasheet();
  }, [projectId]);

  useEffect(() => {
    if (loadState === "ready" && bundle) {
      void loadLayout();
      return;
    }
    setLayout(null);
    setLayoutState("idle");
    setPreviewMode("auto");
    setExportMode("auto");
  }, [bundle?.document.id, loadState, projectId]);

  async function loadDatasheet() {
    setLoadState("loading");
    const response = await fetch(`/api/projects/${projectId}/datasheet`, { cache: "no-store" });
    if (response.status === 404) {
      setBundle(null);
      setLayout(null);
      setLoadState("missing");
      return;
    }
    if (!response.ok) {
      setBundle(null);
      setLayout(null);
      setLoadState("failed");
      return;
    }
    setBundle((await response.json()) as DatasheetBundle);
    setLoadState("ready");
    setHasUnsavedEditorChanges(false);
    setHasUnsavedTemplateChanges(false);
    setPreviewVersion((current) => current + 1);
    void loadExports();
  }

  async function loadLayout() {
    if (!bundle) return;
    setLayoutState("loading");
    const response = await fetch(`/api/projects/${projectId}/datasheet/layout`, { cache: "no-store" });
    if (response.status === 404) {
      setLayout(null);
      setLayoutState("missing");
      setLayoutError(null);
      setPreviewMode("auto");
      setExportMode("auto");
      return;
    }
    if (!response.ok) {
      setLayout(null);
      setLayoutState("failed");
      setLayoutError(await safeErrorMessage(response, "Paged layout could not be loaded."));
      return;
    }
    const result = (await response.json()) as DatasheetLayout;
    setLayout(result);
    setLayoutState("ready");
    setLayoutSaveState("idle");
    setLayoutError(null);
    setPreviewMode("auto");
    setExportMode("auto");
  }

  function createDatasheet() {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/datasheet/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      if (!response.ok) {
        setNotice({ tone: "error", text: "Editable datasheet could not be created yet." });
        return;
      }
      setBundle((await response.json()) as DatasheetBundle);
      setLayout(null);
      setLayoutState("missing");
      setLoadState("ready");
      setTab("editor");
      setHasUnsavedEditorChanges(false);
      setHasUnsavedTemplateChanges(false);
      setPreviewVersion((current) => current + 1);
      void loadExports();
      setNotice(null);
    });
  }

  function regenerateDatasheet() {
    if (!bundle) return;
    const confirmed = window.confirm("This will overwrite the current editable draft. Template settings will be preserved.");
    if (!confirmed) return;
    startTransition(async () => {
      setNotice(null);
      const response = await fetch(`/api/projects/${projectId}/datasheet/regenerate`, { method: "POST" });
      if (!response.ok) {
        setNotice({ tone: "error", text: await safeErrorMessage(response, "Editable datasheet could not be regenerated.") });
        return;
      }
      const nextBundle = (await response.json()) as DatasheetBundle;
      setBundle(nextBundle);
      setLayout(null);
      setLayoutState("missing");
      setSaveState("saved");
      setSaveError(null);
      setHasUnsavedEditorChanges(false);
      setHasUnsavedTemplateChanges(false);
      setPreviewMode("auto");
      setExportMode("auto");
      setPreviewVersion((current) => current + 1);
      void loadExports();
      setTab("editor");
      setNotice({ tone: "success", text: regenerateSummaryMessage(nextBundle.qualitySummary) });
    });
  }

  async function saveDocument(input: Partial<DatasheetDocument>) {
    setSaveState("saving");
    setSaveError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response, "Datasheet could not be saved.");
      if (process.env.NODE_ENV === "development") console.warn("Datasheet save failed", { status: response.status, message: errorMessage });
      setSaveError(errorMessage);
      setSaveState("failed");
      return false;
    }
    setBundle((await response.json()) as DatasheetBundle);
    setSaveState("saved");
    setHasUnsavedEditorChanges(false);
    setPreviewVersion((current) => current + 1);
    return true;
  }

  async function saveTemplate(input: Partial<TemplateSettings>) {
    setSaveState("saving");
    setSaveError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet/template`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response, "Template settings could not be saved.");
      if (process.env.NODE_ENV === "development") console.warn("Template save failed", { status: response.status, message: errorMessage });
      setSaveError(errorMessage);
      setSaveState("failed");
      return false;
    }
    setBundle((await response.json()) as DatasheetBundle);
    setSaveState("saved");
    setHasUnsavedTemplateChanges(false);
    setPreviewVersion((current) => current + 1);
    return true;
  }

  async function loadExports() {
    setExportState((current) => current === "exporting" ? current : "loading");
    const response = await fetch(`/api/projects/${projectId}/datasheet/export`, { cache: "no-store" });
    if (!response.ok) {
      setExportState("failed");
      setExportError(await safeErrorMessage(response, "Export history could not be loaded."));
      return;
    }
    const body = await response.json() as { exports?: DatasheetExport[] };
    setExports(body.exports ?? []);
    setExportState("idle");
    setExportError(null);
  }

  async function persistLayoutPatch(input: Partial<Pick<DatasheetLayout, "pages" | "warnings" | "exportMode">>) {
    if (!bundle) return false;
    setLayoutSaveState("saving");
    setLayoutError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet/layout`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response, "Paged layout could not be saved.");
      setLayoutSaveState("failed");
      setLayoutError(errorMessage);
      return false;
    }
    const result = (await response.json()) as DatasheetLayout;
    setLayout(result);
    setLayoutState("ready");
    setLayoutSaveState("saved");
    setLayoutError(null);
    if (input.exportMode) {
      setPreviewMode(input.exportMode);
      setExportMode(input.exportMode);
    }
    setPreviewVersion((current) => current + 1);
    return true;
  }

  async function generateLayout(options?: { openTab?: boolean }) {
    if (!bundle) return null;
    setLayoutState("loading");
    setLayoutSaveState("saving");
    setLayoutError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet/layout/generate`, { method: "POST" });
    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response, "Paged layout could not be generated.");
      setLayoutState("failed");
      setLayoutSaveState("failed");
      setLayoutError(errorMessage);
      return null;
    }
    const result = (await response.json()) as DatasheetLayout;
    setLayout(result);
    setLayoutState("ready");
    setLayoutSaveState("saved");
    setLayoutError(null);
    setPreviewVersion((current) => current + 1);
    if (options?.openTab) setTab("paged-layout");
    return result;
  }

  async function resetLayout() {
    if (!bundle) return;
    const confirmed = window.confirm("Reset the paged layout back to a fresh generated draft?");
    if (!confirmed) return;
    setLayoutState("loading");
    setLayoutSaveState("saving");
    const response = await fetch(`/api/projects/${projectId}/datasheet/layout/reset`, { method: "POST" });
    if (!response.ok) {
      const errorMessage = await safeErrorMessage(response, "Paged layout could not be reset.");
      setLayoutState("failed");
      setLayoutSaveState("failed");
      setLayoutError(errorMessage);
      return;
    }
    const result = (await response.json()) as DatasheetLayout;
    setLayout(result);
    setLayoutState("ready");
    setLayoutSaveState("saved");
    setLayoutError(null);
    setPreviewMode("auto");
    setExportMode("auto");
    setPreviewVersion((current) => current + 1);
  }

  async function applyExportMode(mode: DatasheetLayoutExportMode) {
    setPreviewMode(mode);
    setExportMode(mode);
    if (mode === "saved" && !layout) {
      const generated = await generateLayout();
      if (!generated) {
        setPreviewMode("auto");
        setExportMode("auto");
        return;
      }
      if (generated.exportMode !== "saved") await persistLayoutPatch({ exportMode: "saved" });
      return;
    }
    if (layout && layout.exportMode !== mode) await persistLayoutPatch({ exportMode: mode });
  }

  async function createPdfExport(mode = exportMode) {
    setExportState("exporting");
    setExportError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet/export/pdf`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    if (!response.ok) {
      setExportState("failed");
      setExportError(await safeErrorMessage(response, "PDF export failed."));
      return;
    }
    const created = await response.json() as DatasheetExport;
    setExports((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setExportState("idle");
  }

  async function cleanupAction(action: "restore" | "remove", itemId: string) {
    const response = await fetch(`/api/projects/${projectId}/datasheet/cleanup/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId }) });
    if (response.ok) setBundle((await response.json()) as DatasheetBundle);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "extraction"} onClick={() => setTab("extraction")}>Extraction Review</TabButton>
          <TabButton active={tab === "editor"} onClick={() => setTab("editor")} disabled={!bundle}>Datasheet Editor</TabButton>
          <TabButton active={tab === "paged-layout"} onClick={() => setTab("paged-layout")} disabled={!bundle}>Paged Layout Editor</TabButton>
          <TabButton active={tab === "paged-preview"} onClick={() => setTab("paged-preview")} disabled={!bundle}>Paged Preview</TabButton>
          <TabButton active={tab === "template"} onClick={() => setTab("template")} disabled={!bundle}>Branding Template</TabButton>
          <TabButton active={tab === "cleanup"} onClick={() => setTab("cleanup")} disabled={!bundle}>Cleanup Review</TabButton>
          <TabButton active={tab === "export"} onClick={() => { setTab("export"); void loadExports(); }} disabled={!bundle}>Exports</TabButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {bundle ? <Button type="button" variant="outline" size="sm" onClick={() => void generateLayout({ openTab: true })} disabled={layoutState === "loading" || hasUnsavedChanges}><RefreshCcw size={15} />{layout ? "Refresh paged layout" : "Generate paged layout"}</Button> : null}
          {canRegenerate ? <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={regenerateDatasheet}><RefreshCcw size={15} />{isPending ? "Regenerating..." : "Regenerate editable datasheet from extraction"}</Button> : null}
        </div>
      </div>

      {notice ? <p className={`rounded-md p-3 text-sm ${notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</p> : null}
      {tab === "extraction" ? <ExtractionReview projectId={projectId} status={status} originalPdfUrl={originalPdfUrl} /> : null}
      {tab === "extraction" && loadState === "missing" ? <CreateDatasheetPanel canCreate={canCreate} isPending={isPending} onCreate={createDatasheet} /> : null}
      {tab !== "extraction" && loadState === "loading" ? <ComposerState label="Loading editable datasheet..." /> : null}
      {tab !== "extraction" && loadState === "missing" ? <CreateDatasheetPanel canCreate={canCreate} isPending={isPending} onCreate={createDatasheet} /> : null}
      {tab !== "extraction" && loadState === "failed" ? <ComposerState label="Datasheet composer could not be loaded." /> : null}
      {tab === "editor" && bundle ? <DatasheetEditor bundle={bundle} saveState={saveState} saveError={saveError} onDirtyChange={setHasUnsavedEditorChanges} onTemplateDirtyChange={setHasUnsavedTemplateChanges} onSave={saveDocument} onTemplateSave={saveTemplate} onOpenPagedLayout={() => setTab("paged-layout")} /> : null}
      {tab === "paged-layout" && bundle ? <PagedLayoutEditorPanel bundle={bundle} layout={layout} layoutState={layoutState} layoutSaveState={layoutSaveState} layoutError={layoutError} hasUnsavedChanges={hasUnsavedChanges} onGenerate={() => generateLayout()} onSave={(nextLayout) => persistLayoutPatch({ pages: nextLayout.pages, warnings: nextLayout.warnings, exportMode: nextLayout.exportMode })} onReset={resetLayout} onModeChange={applyExportMode} /> : null}
      {tab === "paged-preview" && bundle ? <PagedPreviewPanel projectId={projectId} bundle={bundle} previewVersion={previewVersion} hasUnsavedChanges={hasUnsavedChanges} previewMode={previewMode} layoutState={layoutState} onModeChange={applyExportMode} onGenerateLayout={() => generateLayout()} onRefresh={() => setPreviewVersion((current) => current + 1)} /> : null}
      {tab === "template" && bundle ? <TemplatePanel template={bundle.template} saveState={saveState} saveError={saveError} onDirtyChange={setHasUnsavedTemplateChanges} onSave={saveTemplate} /> : null}
      {tab === "cleanup" && bundle ? <CleanupPanel report={bundle.document.sourceCleanupReport} onRestore={(id) => cleanupAction("restore", id)} onRemove={(id) => cleanupAction("remove", id)} /> : null}
      {tab === "export" && bundle ? <ExportPanel exports={exports} exportState={exportState} exportError={exportError} hasUnsavedChanges={hasUnsavedChanges} exportMode={exportMode} layoutState={layoutState} onModeChange={applyExportMode} onGenerateLayout={() => generateLayout()} onExport={createPdfExport} onRefresh={loadExports} /> : null}
    </div>
  );
}

function regenerateSummaryMessage(summary?: DatasheetQualitySummary) {
  if (!summary) return "Editable datasheet regenerated from the latest extraction.";
  return `Editable datasheet regenerated: ${summary.sectionsDetected} sections, ${summary.tablesDetected} tables, ${summary.figuresDetected} figures, ${summary.warningsCount} warnings, ${summary.unresolvedSymbolsCount} unresolved symbols.`;
}

function DatasheetEditor({ bundle, saveState, saveError, onDirtyChange, onTemplateDirtyChange, onSave, onTemplateSave, onOpenPagedLayout }: { bundle: DatasheetBundle; saveState: SaveState; saveError: string | null; onDirtyChange: (dirty: boolean) => void; onTemplateDirtyChange: (dirty: boolean) => void; onSave: (input: Partial<DatasheetDocument>) => Promise<boolean>; onTemplateSave: (input: Partial<TemplateSettings>) => Promise<boolean>; onOpenPagedLayout: () => void }) {
  const [title, setTitle] = useState(bundle.document.title);
  const [productCode, setProductCode] = useState(bundle.document.productCode);
  const [productCategory, setProductCategory] = useState(bundle.document.productCategory);
  const [dirty, setDirty] = useState(false);
  const [editorDoc, setEditorDoc] = useState<JSONContent>(ensureEditorJsonHasBlockIds(bundle.document.editorJson));
  const [selectionVersion, setSelectionVersion] = useState(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions,
    content: ensureEditorJsonHasBlockIds(bundle.document.editorJson),
    onUpdate: ({ editor }) => {
      const normalized = ensureEditorJsonHasBlockIds(editor.getJSON());
      setEditorDoc(normalized);
      setSelectionVersion((current) => current + 1);
      setDirty(true);
      onDirtyChange(true);
    },
    onSelectionUpdate: () => setSelectionVersion((current) => current + 1),
    editorProps: { attributes: { class: "datasheet-editor-surface min-h-[780px] bg-white px-8 py-9 text-[13px] leading-6 text-slate-800 outline-none [&_a]:text-blue-700 [&_a]:underline [&_caption]:text-xs [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-[#0D2B55] [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[#0D2B55] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:text-[#0D2B55] [&_li]:my-1 [&_ol]:mb-4 [&_ol]:ml-7 [&_ol]:list-decimal [&_p.image-caption]:text-center [&_p.image-caption]:text-xs [&_p.image-caption]:text-slate-500 [&_p]:mb-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#0D2B55] [&_ul]:mb-4 [&_ul]:ml-7 [&_ul]:list-disc [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-[#D6533E] [&_.datasheet-editor-image]:mx-auto [&_.datasheet-editor-image]:block [&_.datasheet-editor-image]:h-auto [&_.datasheet-editor-image]:max-w-full [&_.datasheet-editor-image-small]:w-[45%] [&_.datasheet-editor-image-medium]:w-[72%] [&_.datasheet-editor-image-full]:w-full [&_[data-keep-with-next='true']]:border-l-2 [&_[data-keep-with-next='true']]:border-amber-300 [&_[data-keep-with-next='true']]:pl-3 [&_[data-page-break-before='true']]:border-t-2 [&_[data-page-break-before='true']]:border-dashed [&_[data-page-break-before='true']]:border-sky-300 [&_[data-page-break-before='true']]:pt-3 [&_[data-hidden-from-export='true']]:opacity-50 [&_[data-hidden-from-export='true']]:grayscale [&_.page-break]:my-7 [&_.page-break]:flex [&_.page-break]:items-center [&_.page-break]:gap-3 [&_.page-break]:border-t-2 [&_.page-break]:border-dashed [&_.page-break]:border-slate-300 [&_.page-break]:text-xs [&_.page-break]:font-semibold [&_.page-break]:uppercase [&_.page-break]:tracking-wide [&_.page-break]:text-slate-400" } }
  });

  const selectedBlock = useMemo(() => editor ? getSelectedBlockState(editor) : null, [editor, selectionVersion]);
  const sections = useMemo(() => extractSectionsFromEditorJson(editorDoc), [editorDoc]);

  useEffect(() => {
    if (!editor) return;
    const normalized = ensureEditorJsonHasBlockIds(bundle.document.editorJson);
    editor.commands.setContent(normalized);
    setEditorDoc(normalized);
    setTitle(bundle.document.title);
    setProductCode(bundle.document.productCode);
    setProductCategory(bundle.document.productCategory);
    setDirty(false);
    onDirtyChange(false);
  }, [bundle.document.editorJson, bundle.document.lastSavedAt, bundle.document.productCategory, bundle.document.productCode, bundle.document.title, editor, onDirtyChange]);

  useEffect(() => {
    if (!dirty || !editor) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void onSave({ title, productCode, productCategory, editorJson: ensureEditorJsonHasBlockIds(editor.getJSON()), status: "EDITING" }).then((saved) => {
        if (saved) setDirty(false);
      });
    }, 1600);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [dirty, editor, onSave, productCategory, productCode, title]);

  function updateMetadata(setter: (value: string) => void, value: string) {
    setter(value);
    setDirty(true);
    onDirtyChange(true);
  }

  async function saveNow() {
    if (!editor) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    const saved = await onSave({ title, productCode, productCategory, editorJson: ensureEditorJsonHasBlockIds(editor.getJSON()), status: "EDITING" });
    if (saved) {
      setDirty(false);
      onDirtyChange(false);
    }
  }

  function markEditorDirty() {
    setDirty(true);
    onDirtyChange(true);
    if (editor) setEditorDoc(ensureEditorJsonHasBlockIds(editor.getJSON()));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Datasheet Editor</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <SaveStatus dirty={dirty} saveState={saveState} saveError={saveError} />
              <Button type="button" size="sm" onClick={saveNow} disabled={saveState === "saving"}><Save size={15} />Save</Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Edit the datasheet body on a document canvas. Header and footer fields can be adjusted in the panel beside it. Layout: {layoutModeLabel(bundle.template.layoutMode)}. Density: {layoutDensityLabel(bundle.template.layoutDensity)}. Fill strategy: {pageFillStrategyLabel(bundle.template.pageFillStrategy)}.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <EditorToolbar editor={editor} selectedBlock={selectedBlock} onMutate={markEditorDirty} onOpenPagedLayout={onOpenPagedLayout} />
          <div data-testid="editor-workspace" className="overflow-auto rounded-md border bg-slate-200 px-3 py-5 sm:px-6 lg:px-8"><div data-testid="editor-document-canvas" className="mx-auto min-h-[920px] w-full max-w-[794px] rounded-sm border border-slate-300 bg-white shadow-lg"><EditorContent editor={editor} /></div></div><style>{`.datasheet-editor-surface .page-break::before,.datasheet-editor-surface .page-break::after{content:"";height:1px;flex:1;background:#cbd5e1}.datasheet-editor-surface .page-break-label{border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;padding:2px 10px}.datasheet-editor-surface [data-keep-with-next='true']{position:relative}.datasheet-editor-surface [data-keep-with-next='true']::before{content:"Keep with next";display:inline-block;margin-right:8px;border-radius:999px;background:#fef3c7;color:#92400e;padding:1px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}.datasheet-editor-surface [data-hidden-from-export='true']::after{content:"Hidden from export";display:inline-block;margin-left:8px;border-radius:999px;background:#e2e8f0;color:#334155;padding:1px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}`}</style>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Document Metadata</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Title" value={title} onChange={(value) => updateMetadata(setTitle, value)} />
            <Field label="Product code" value={productCode} onChange={(value) => updateMetadata(setProductCode, value)} />
            <Field label="Product category" value={productCategory} onChange={(value) => updateMetadata(setProductCategory, value)} />
            <p className="text-xs text-muted-foreground">Last saved {new Date(bundle.document.lastSavedAt).toLocaleString()}</p>
          </CardContent>
        </Card>
        <SectionNavigatorPanel editor={editor} sections={sections} onMutate={markEditorDirty} />
        <HeaderFooterSettingsPanel template={bundle.template} saveState={saveState} saveError={saveError} onDirtyChange={onTemplateDirtyChange} onSave={onTemplateSave} />
      </div>
    </div>
  );
}

function PagedLayoutEditorPanel({ bundle, layout, layoutState, layoutSaveState, layoutError, hasUnsavedChanges, onGenerate, onSave, onReset, onModeChange }: { bundle: DatasheetBundle; layout: DatasheetLayout | null; layoutState: LayoutLoadState; layoutSaveState: SaveState; layoutError: string | null; hasUnsavedChanges: boolean; onGenerate: () => Promise<DatasheetLayout | null>; onSave: (layout: DatasheetLayout) => Promise<boolean>; onReset: () => Promise<void>; onModeChange: (mode: DatasheetLayoutExportMode) => Promise<void> }) {
  const [draft, setDraft] = useState<DatasheetLayout | null>(layout);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(layout);
    setDirty(false);
  }, [layout]);

  function updateDraft(updater: (current: DatasheetLayout) => DatasheetLayout) {
    setDraft((current) => current ? updater(current) : current);
    setDirty(true);
  }

  async function saveDraft() {
    if (!draft) return;
    const saved = await onSave(draft);
    if (saved) setDirty(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Paged Layout Editor</CardTitle>
          <p className="text-sm text-muted-foreground">Visual layout editor is experimental. Auto Flow is still the recommended workflow for higher-quality PDF composition.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Use Auto Flow for normal preview/export. Saved Layout remains optional and is hidden below because it still exposes raw renderer blocks rather than a true page canvas.</p>
          {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save editor and template changes before generating or resetting an experimental saved layout.</p> : null}
          {layoutError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{layoutError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => void onModeChange("auto")}>Use Auto Flow</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void onModeChange("saved")} disabled={!draft}>Use Saved Layout</Button>
          </div>
        </CardContent>
      </Card>
      <details data-testid="experimental-saved-layout-editor" className="rounded-md border bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800">Experimental saved layout editor</summary>
        <div className="space-y-4 border-t p-4">
          {!draft ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Generate a saved layout draft only if you want to inspect or experiment with the raw paged block model.</p><Button type="button" onClick={() => void onGenerate()} disabled={hasUnsavedChanges || layoutState === "loading"}><RefreshCcw size={15} />Generate experimental saved layout</Button></div> : <><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void onGenerate()} disabled={hasUnsavedChanges || layoutState === "loading"}><RefreshCcw size={15} />Regenerate</Button><Button type="button" variant="outline" size="sm" onClick={() => void onReset()}>Reset</Button><Button type="button" size="sm" onClick={() => void saveDraft()} disabled={!dirty || layoutSaveState === "saving"}><Save size={15} />Save layout</Button></div><p className="text-xs text-muted-foreground">{layoutSaveState === "saving" ? "Saving experimental layout..." : layoutSaveState === "failed" ? "Experimental layout save failed." : dirty ? "Unsaved experimental layout changes" : "Experimental layout saved"}</p>{draft.warnings.length ? <div className="flex flex-wrap gap-2">{draft.warnings.map((warning) => <span key={warning} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">{warning}</span>)}</div> : null}<div className="grid gap-4 xl:grid-cols-2">{draft.pages.map((page, pageIndex) => <Card key={page.pageNumber}><CardHeader><CardTitle className="text-base">Page {page.pageNumber}</CardTitle><p className="text-xs text-muted-foreground">{bundle.template.productCode} | {bundle.template.documentStatus} | {bundle.template.revision}</p></CardHeader><CardContent className="space-y-3">{page.blocks.map((block, blockIndex) => <div key={block.id} className="rounded-md border bg-slate-50 p-3"><div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full bg-white px-2 py-1 font-medium text-slate-800">{block.blockType}</span><span>Column: {block.column}</span><span>Width: {block.widthPreset}</span>{block.hiddenFromExport ? <span className="rounded-full bg-slate-200 px-2 py-1">Hidden</span> : null}</div><div className="rounded border bg-white p-2 text-sm text-slate-700">{block.plainText || block.role || block.blockType}</div><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; const pageBlocks = next.pages[pageIndex].blocks; if (blockIndex > 0) [pageBlocks[blockIndex - 1], pageBlocks[blockIndex]] = [pageBlocks[blockIndex], pageBlocks[blockIndex - 1]]; return next; })}><ArrowUp size={14} />Up</Button><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; const pageBlocks = next.pages[pageIndex].blocks; if (blockIndex < pageBlocks.length - 1) [pageBlocks[blockIndex + 1], pageBlocks[blockIndex]] = [pageBlocks[blockIndex], pageBlocks[blockIndex + 1]]; return next; })}><ArrowDown size={14} />Down</Button><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; const item = next.pages[pageIndex].blocks[blockIndex]; item.column = item.column === "left" ? "right" : item.column === "right" ? "full" : "left"; item.fullWidth = item.column === "full"; return next; })}>Cycle column</Button><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; const item = next.pages[pageIndex].blocks[blockIndex]; item.hiddenFromExport = !item.hiddenFromExport; return next; })}>{block.hiddenFromExport ? "Show" : "Hide"}</Button><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; next.pages[pageIndex].blocks.splice(blockIndex + 1, 0, { ...block, id: block.id + "-copy" }); return next; })}>Duplicate</Button><Button type="button" variant="outline" size="sm" onClick={() => updateDraft((current) => { const next = structuredClone(current) as DatasheetLayout; next.pages[pageIndex].blocks.splice(blockIndex, 1); next.pages = next.pages.filter((item) => item.blocks.length > 0).map((item, index) => ({ ...item, pageNumber: index + 1 })); return next; })}>Delete</Button></div></div>)}</CardContent></Card>)}</div></>}
        </div>
      </details>
    </div>
  );
}

function SaveStatus({ dirty, saveState, saveError }: { dirty: boolean; saveState: SaveState; saveError: string | null }) {
  if (saveState === "saving") return <span>Saving...</span>;
  if (saveState === "failed") return <span className="text-red-700">Save failed: {saveError ?? "Please try again."}</span>;
  if (dirty) return <span>Unsaved changes</span>;
  return <span>Saved</span>;
}

function HeaderFooterSettingsPanel({ template, saveState, saveError, onDirtyChange, onSave, buttonLabel = "Save header/footer" }: { template: TemplateSettings; saveState: SaveState; saveError: string | null; onDirtyChange: (dirty: boolean) => void; onSave: (input: Partial<TemplateSettings>) => Promise<boolean>; buttonLabel?: string }) {
  const [form, setForm] = useState(template);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(template);
    setDirty(false);
    onDirtyChange(false);
  }, [template, onDirtyChange]);

  function updateField<K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    onDirtyChange(true);
  }

  async function saveHeaderFooter() {
    const saved = await onSave({
      productCode: form.productCode,
      productTitle: form.productTitle,
      documentStatus: form.documentStatus,
      revision: form.revision,
      website: form.website,
      layoutMode: form.layoutMode,
      layoutDensity: form.layoutDensity,
      pageFillStrategy: form.pageFillStrategy,
      primaryColor: form.primaryColor,
      accentColor: form.accentColor,
    });
    if (saved) {
      setDirty(false);
      onDirtyChange(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Header/Footer Settings</CardTitle>
        <p className="text-sm text-muted-foreground">These fields drive the Vellore header/footer in paged preview and PDF export.</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Field label="Product code" value={form.productCode} onChange={(value) => updateField("productCode", value)} />
        <Field label="Product title/category" value={form.productTitle} onChange={(value) => updateField("productTitle", value)} />
        <Field label="Document status" value={form.documentStatus} onChange={(value) => updateField("documentStatus", value)} />
        <Field label="Revision" value={form.revision} onChange={(value) => updateField("revision", value)} />
        <Field label="Website" value={form.website} onChange={(value) => updateField("website", value)} />
        <LayoutModeField value={form.layoutMode} onChange={(value) => updateField("layoutMode", value)} />
        <LayoutDensityField value={form.layoutDensity} onChange={(value) => updateField("layoutDensity", value)} />
        <PageFillStrategyField value={form.pageFillStrategy} onChange={(value) => updateField("pageFillStrategy", value)} />
        <Field label="Primary color" value={form.primaryColor} onChange={(value) => updateField("primaryColor", value)} type="color" />
        <Field label="Accent color" value={form.accentColor} onChange={(value) => updateField("accentColor", value)} type="color" />
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="button" onClick={() => void saveHeaderFooter()} disabled={saveState === "saving"}><Save size={15} />{buttonLabel}</Button>
          <span className="text-xs text-muted-foreground">{saveState === "saving" ? "Saving..." : saveState === "failed" ? "Save failed: " + (saveError ?? "Please try again.") : dirty ? "Unsaved header/footer changes" : "Saved"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PagedPreviewPanel({ projectId, bundle, previewVersion, hasUnsavedChanges, previewMode, layoutState, onModeChange, onGenerateLayout, onRefresh }: { projectId: string; bundle: DatasheetBundle; previewVersion: number; hasUnsavedChanges: boolean; previewMode: DatasheetLayoutExportMode; layoutState: LayoutLoadState; onModeChange: (mode: DatasheetLayoutExportMode) => Promise<void>; onGenerateLayout: () => Promise<DatasheetLayout | null>; onRefresh: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [zoom, setZoom] = useState<"fit" | "75" | "100">("fit");
  const previewSrc = "/api/projects/" + projectId + "/datasheet/export/preview?v=" + previewVersion + "&saved=" + encodeURIComponent(bundle.document.lastSavedAt) + "&mode=" + previewMode;
  const zoomClass = zoom === "fit" ? "w-full max-w-[980px]" : zoom === "75" ? "w-[75%] min-w-[720px]" : "w-[1000px]";

  useEffect(() => {
    setState("loading");
  }, [previewSrc]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Paged Preview</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Saved datasheet rendered through the same A4 layout used for branded PDF export.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={previewMode === "auto" ? "default" : "outline"} size="sm" onClick={() => void onModeChange("auto")}>Auto flow</Button>
            <Button type="button" variant={previewMode === "saved" ? "default" : "outline"} size="sm" onClick={() => void onModeChange("saved")}>Saved layout</Button>
            <Button type="button" variant={zoom === "fit" ? "default" : "outline"} size="sm" onClick={() => setZoom("fit")}>Fit width</Button>
            <Button type="button" variant={zoom === "75" ? "default" : "outline"} size="sm" onClick={() => setZoom("75")}>75%</Button>
            <Button type="button" variant={zoom === "100" ? "default" : "outline"} size="sm" onClick={() => setZoom("100")}>100%</Button>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}><RefreshCcw size={15} />Refresh preview</Button>
            <Button type="button" variant="outline" size="sm" asChild><a href={previewSrc} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open in new tab</a></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Preview mode: {previewMode === "saved" ? "Saved layout" : "Auto flow"}. Current layout: {layoutModeLabel(bundle.template.layoutMode)}. Density: {layoutDensityLabel(bundle.template.layoutDensity)}. Fill strategy: {pageFillStrategyLabel(bundle.template.pageFillStrategy)}.</p>
        {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save changes to update preview/export.</p> : null}
        {previewMode === "saved" && layoutState === "missing" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground"><span>No saved paged layout exists yet.</span><Button type="button" variant="outline" size="sm" onClick={() => void onGenerateLayout()}>Generate paged layout</Button></div> : null}
        {state === "loading" ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Loading paged preview...</p> : null}
        {state === "failed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700"><span>Paged preview could not be loaded.</span><Button type="button" variant="outline" size="sm" onClick={onRefresh}>Retry</Button></div> : null}
        <div className="h-[76vh] overflow-auto rounded-md border bg-slate-200 p-4">
          <iframe key={previewSrc} title="Paged datasheet preview" data-testid="paged-preview-frame" src={previewSrc} className={"mx-auto h-full " + zoomClass + " bg-white shadow-sm"} onLoad={() => setState("ready")} onError={() => setState("failed")} />
        </div>
      </CardContent>
    </Card>
  );
}

function ExportPanel({ exports, exportState, exportError, hasUnsavedChanges, exportMode, layoutState, onModeChange, onGenerateLayout, onExport, onRefresh }: { exports: DatasheetExport[]; exportState: ExportState; exportError: string | null; hasUnsavedChanges: boolean; exportMode: DatasheetLayoutExportMode; layoutState: LayoutLoadState; onModeChange: (mode: DatasheetLayoutExportMode) => Promise<void>; onGenerateLayout: () => Promise<DatasheetLayout | null>; onExport: (mode?: DatasheetLayoutExportMode) => Promise<void>; onRefresh: () => Promise<void> }) {
  const isExporting = exportState === "exporting";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Branded PDF Export</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Generate a Vellore Semicon PDF from the saved editable datasheet and template.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={exportMode === "auto" ? "default" : "outline"} size="sm" onClick={() => void onModeChange("auto")}>Export auto flow</Button>
            <Button type="button" variant={exportMode === "saved" ? "default" : "outline"} size="sm" onClick={() => void onModeChange("saved")}>Export saved layout</Button>
            <Button type="button" variant="outline" onClick={() => void onRefresh()} disabled={isExporting}><RefreshCcw size={15} />Refresh</Button>
            <Button type="button" onClick={() => void onExport(exportMode)} disabled={isExporting || hasUnsavedChanges}><FileDown size={15} />{isExporting ? "Exporting..." : "Export PDF"}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Current export mode: {exportMode === "saved" ? "Saved layout" : "Auto flow"}.</p>
        {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save changes to update preview/export.</p> : null}
        {exportMode === "saved" && layoutState === "missing" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground"><span>Generate and save a paged layout before exporting with saved layout mode.</span><Button type="button" variant="outline" size="sm" onClick={() => void onGenerateLayout()}>Generate paged layout</Button></div> : null}
        {exportError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{exportError}</p> : null}
        {exportState === "loading" ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Loading export history...</p> : null}
        {exports.length === 0 && exportState !== "loading" ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No PDF exports yet.</p> : null}
        {exports.map((item) => <ExportHistoryRow key={item.id} item={item} />)}
      </CardContent>
    </Card>
  );
}

function ExportHistoryRow({ item }: { item: DatasheetExport }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-white p-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium">{item.filename}</p>
        <p className="text-sm text-muted-foreground">{item.status} - {item.completedAt ? new Date(item.completedAt).toLocaleString() : new Date(item.createdAt).toLocaleString()}{item.fileSize ? ` - ${formatBytes(item.fileSize)}` : ""}</p>
        {item.errorMessage ? <p className="mt-1 text-sm text-red-700">{item.errorMessage}</p> : null}
      </div>
      {item.downloadUrl ? <Button type="button" asChild><a href={item.downloadUrl}><Download size={15} />Download PDF</a></Button> : null}
    </div>
  );
}

function EditorToolbar({ editor, selectedBlock, onMutate, onOpenPagedLayout }: { editor: Editor | null; selectedBlock: SelectedBlockState | null; onMutate: () => void; onOpenPagedLayout: () => void }) {
  if (!editor) return <div className="h-10 rounded-md border bg-secondary/40" />;
  const selectedType = selectedBlock?.type ?? null;
  const selectedAttrs = selectedBlock?.attrs ?? {};
  const canApplyLayout = Boolean(selectedType);
  const isImageSelected = selectedType === "image";
  return (
    <div className="flex flex-wrap items-stretch gap-2 rounded-md border bg-secondary/40 p-2">
      <ToolbarGroup label="Format">
        <ToolButton label="H1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolButton>
        <ToolButton label="H2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolButton>
        <ToolButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></ToolButton>
        <ToolButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolButton>
        <ToolButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolButton>
        <ToolButton label="Subscript" active={editor.isActive("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()}><SubscriptIcon size={15} /></ToolButton>
        <ToolButton label="Superscript" active={editor.isActive("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()}><SuperscriptIcon size={15} /></ToolButton>
      </ToolbarGroup>
      <ToolbarGroup label="Lists">
        <ToolButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></ToolButton>
        <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolButton>
      </ToolbarGroup>
      <ToolbarGroup label="Table">
        <ToolButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={15} /></ToolButton>
        <ToolButton label="Add table row" onClick={() => editor.chain().focus().addRowAfter().run()}>+ row</ToolButton>
        <ToolButton label="Add table column" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ col</ToolButton>
        <ToolButton label="Table keep together" active={selectedAttrs.allowSplit === false} onClick={() => { if (setSelectedBlockAttrs(editor, { allowSplit: selectedAttrs.allowSplit === false ? true : false, avoidOrphan: true })) onMutate(); }}><SplitSquareVertical size={15} /></ToolButton>
      </ToolbarGroup>
      <ToolbarGroup label="Layout">
        <ToolButton label="Insert page break" onClick={() => { editor.chain().focus().insertContent({ type: "pageBreak" }).run(); onMutate(); }}><FilePlus2 size={15} /></ToolButton>
        <ToolButton label="Open paged layout editor" onClick={onOpenPagedLayout}><ExternalLink size={15} /></ToolButton>
      </ToolbarGroup>
      <ToolbarGroup label="Image">
        <ToolButton label="Image small" onClick={() => { if (applyWidthPreference(editor, "half")) onMutate(); }} disabled={!isImageSelected}><ImageIcon size={15} /></ToolButton>
        <ToolButton label="Image medium" onClick={() => { if (applyWidthPreference(editor, "column")) onMutate(); }} disabled={!isImageSelected}><ImageIcon size={15} /></ToolButton>
        <ToolButton label="Image full width" onClick={() => { if (applyWidthPreference(editor, "full")) onMutate(); }} disabled={!isImageSelected}><Maximize2 size={15} /></ToolButton>
      </ToolbarGroup>
      <details className="min-w-[260px] rounded-md border bg-white/80 px-3 py-2 text-xs text-muted-foreground" data-testid="advanced-layout-controls">
        <summary className="cursor-pointer font-semibold text-slate-700">Advanced layout controls</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <ToolButton label="Move block up" onClick={() => { if (moveSelectedBlock(editor, -1)) onMutate(); }} disabled={!canApplyLayout}><ArrowUp size={15} /></ToolButton>
          <ToolButton label="Move block down" onClick={() => { if (moveSelectedBlock(editor, 1)) onMutate(); }} disabled={!canApplyLayout}><ArrowDown size={15} /></ToolButton>
          <ToolButton label="Keep with next" active={selectedAttrs.keepWithNext === true} onClick={() => { if (setSelectedBlockAttrs(editor, { keepWithNext: selectedAttrs.keepWithNext !== true })) onMutate(); }} disabled={!canApplyLayout}>Keep next</ToolButton>
          <ToolButton label="Keep with previous" active={selectedAttrs.keepWithPrevious === true} onClick={() => { if (setSelectedBlockAttrs(editor, { keepWithPrevious: selectedAttrs.keepWithPrevious !== true })) onMutate(); }} disabled={!canApplyLayout}>Keep prev</ToolButton>
          <ToolButton label="Page break before" active={selectedAttrs.forcePageBreakBefore === true} onClick={() => { if (setSelectedBlockAttrs(editor, { forcePageBreakBefore: selectedAttrs.forcePageBreakBefore !== true })) onMutate(); }} disabled={!canApplyLayout}>Break before</ToolButton>
          <ToolButton label="Page break after" active={selectedAttrs.forcePageBreakAfter === true} onClick={() => { if (setSelectedBlockAttrs(editor, { forcePageBreakAfter: selectedAttrs.forcePageBreakAfter !== true })) onMutate(); }} disabled={!canApplyLayout}>Break after</ToolButton>
          <ToolButton label="Allow split" active={selectedAttrs.allowSplit !== false} onClick={() => { if (setSelectedBlockAttrs(editor, { allowSplit: selectedAttrs.allowSplit === false ? true : false })) onMutate(); }} disabled={!canApplyLayout}>Split</ToolButton>
          <ToolButton label="Prevent orphan" active={selectedAttrs.avoidOrphan === true} onClick={() => { if (setSelectedBlockAttrs(editor, { avoidOrphan: selectedAttrs.avoidOrphan !== true })) onMutate(); }} disabled={!canApplyLayout}>Orphan</ToolButton>
          <ToolButton label="High priority" active={selectedAttrs.priority === "high"} onClick={() => { if (setSelectedBlockAttrs(editor, { priority: selectedAttrs.priority === "high" ? "normal" : "high" })) onMutate(); }} disabled={!canApplyLayout}>Priority</ToolButton>
          {(["auto", "column", "half", "full"] as LayoutPreferenceWidth[]).map((value) => <ToolButton key={value} label={`Width ${value}`} active={(selectedAttrs.preferredWidth ?? "auto") === value || (isImageSelected && value === imageDisplayToPreferredWidth(selectedAttrs.displaySize))} onClick={() => { if (applyWidthPreference(editor, value)) onMutate(); }} disabled={!canApplyLayout}>{value}</ToolButton>)}
          {(["auto", "current-page", "previous-page", "next-page"] as LayoutPreferencePlacement[]).map((value) => <ToolButton key={value} label={`Placement ${value}`} active={(selectedAttrs.preferredPlacement ?? "auto") === value} onClick={() => { if (setSelectedBlockAttrs(editor, { preferredPlacement: value })) onMutate(); }} disabled={!canApplyLayout}>{placementButtonLabel(value)}</ToolButton>)}
          <ToolButton label="Hide image from export" active={selectedAttrs.hiddenFromExport === true} onClick={() => { if (setSelectedBlockAttrs(editor, { hiddenFromExport: selectedAttrs.hiddenFromExport !== true })) onMutate(); }} disabled={!isImageSelected}><EyeOff size={15} /></ToolButton>
          <ToolButton label="Remove selected image" onClick={() => { editor.chain().focus().deleteSelection().run(); onMutate(); }} disabled={!isImageSelected}><ImageIcon size={15} /></ToolButton>
        </div>
        {selectedBlock ? <div className="mt-3 flex min-w-[220px] flex-col justify-center rounded border bg-white/80 px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-slate-700">Selected block</span><span>{selectedBlock.label}</span><span>ID: {selectedBlock.attrs.blockId ?? "pending"}</span></div> : null}
      </details>
    </div>
  );
}

type SelectedBlockState = {
  type: string;
  label: string;
  index: number;
  pos: number;
  attrs: LayoutAttributes & Record<string, unknown>;
};

type SectionSummary = { blockId: string; title: string; level: number };

function SectionNavigatorPanel({ editor, sections, onMutate }: { editor: Editor | null; sections: SectionSummary[]; onMutate: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section Navigator</CardTitle>
        <p className="text-sm text-muted-foreground">Jump between sections and keep major technical sections together when needed.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {sections.length === 0 ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No sections detected yet.</p> : sections.map((section) => <div key={section.blockId} className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-2"><button type="button" className="text-left text-sm font-medium text-slate-800 hover:text-slate-950" onClick={() => { if (editor) jumpToBlock(editor, section.blockId); }}>{section.title}</button><div className="ml-auto flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { if (editor && toggleHeadingSectionFlag(editor, section.blockId, "keepSectionTogether")) onMutate(); }}>Keep together</Button><Button type="button" variant="outline" size="sm" onClick={() => { if (editor && toggleHeadingSectionFlag(editor, section.blockId, "forcePageBreakBefore")) onMutate(); }}>Break before</Button><Button type="button" variant="outline" size="sm" onClick={() => { if (editor && moveBlockById(editor, section.blockId, -1)) onMutate(); }}><ArrowUp size={14} /></Button><Button type="button" variant="outline" size="sm" onClick={() => { if (editor && moveBlockById(editor, section.blockId, 1)) onMutate(); }}><ArrowDown size={14} /></Button></div></div>)}
      </CardContent>
    </Card>
  );
}

function ensureEditorJsonHasBlockIds(value: JSONContent): JSONContent {
  let counter = 0;
  function visit(node: JSONContent | undefined, topLevel = false): JSONContent | undefined {
    if (!node || typeof node !== "object") return node;
    const content = Array.isArray(node.content) ? node.content.map((child) => visit(child, false)).filter((child): child is JSONContent => Boolean(child)) : node.content;
    if (!node.type || node.type === "text" || node.type === "doc" || node.type === "listItem") {
      return { ...node, ...(content ? { content } : {}) };
    }
    const shouldTrack = topLevel || layoutMetadataNodeTypes.includes(node.type);
    const attrs = { ...(isObjectRecord(node.attrs) ? node.attrs : {}) } as Record<string, unknown>;
    if (shouldTrack && !attrs.blockId && node.type !== "pageBreak") {
      counter += 1;
      attrs.blockId = `block-${counter}`;
    }
    return { ...node, attrs: Object.keys(attrs).length ? attrs : node.attrs, ...(content ? { content } : {}) };
  }
  const rootContent = Array.isArray(value.content) ? value.content.map((child) => visit(child, true)).filter((child): child is JSONContent => Boolean(child)) : value.content;
  return { ...value, content: rootContent };
}

function extractSectionsFromEditorJson(value: JSONContent) {
  const sections: SectionSummary[] = [];
  for (const node of value.content ?? []) {
    if (!node || node.type !== "heading") continue;
    const attrs = isObjectRecord(node.attrs) ? node.attrs : {};
    const title = extractPlainTextFromJson(node).replace(/\s+/g, " ").trim();
    if (!title) continue;
    sections.push({ blockId: String(attrs.blockId ?? title), title, level: typeof attrs.level === "number" ? attrs.level : 2 });
  }
  return sections;
}

function extractPlainTextFromJson(node: JSONContent | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  return Array.isArray(node.content) ? node.content.map((child) => extractPlainTextFromJson(child)).join(" ") : "";
}

function getSelectedBlockState(editor: Editor): SelectedBlockState | null {
  const { state } = editor;
  const depth = Math.max(1, state.selection.$from.depth);
  for (let currentDepth = depth; currentDepth >= 1; currentDepth -= 1) {
    const node = state.selection.$from.node(currentDepth);
    if (!node || !layoutMetadataNodeTypes.includes(node.type.name)) continue;
    const attrs = (node.attrs ?? {}) as LayoutAttributes & Record<string, unknown>;
    return { type: node.type.name, label: formatBlockLabel(node.type.name, attrs), index: state.selection.$from.index(0), pos: currentDepth === 0 ? 0 : state.selection.$from.before(currentDepth), attrs };
  }
  return null;
}

function formatBlockLabel(type: string, attrs: Record<string, unknown>) {
  if (type === "image") return attrs.hiddenFromExport ? "Image (hidden from export)" : "Image";
  if (type === "table") return "Table";
  if (type === "bulletList") return "Bullet list";
  if (type === "orderedList") return "Numbered list";
  if (type === "horizontalRule") return "Rule";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function setSelectedBlockAttrs(editor: Editor, patch: Partial<LayoutAttributes & Record<string, unknown>>) {
  const selected = getSelectedBlockState(editor);
  if (!selected) return false;
  editor.chain().focus().updateAttributes(selected.type, patch).run();
  return true;
}

function applyWidthPreference(editor: Editor, value: LayoutPreferenceWidth) {
  const selected = getSelectedBlockState(editor);
  if (!selected) return false;
  const patch: Record<string, unknown> = { preferredWidth: value };
  if (selected.type === "image") patch.displaySize = preferredWidthToDisplaySize(value);
  editor.chain().focus().updateAttributes(selected.type, patch).run();
  return true;
}

function preferredWidthToDisplaySize(value: LayoutPreferenceWidth) {
  if (value === "full") return "full";
  if (value === "half") return "small";
  return "medium";
}

function imageDisplayToPreferredWidth(value: unknown): LayoutPreferenceWidth {
  if (value === "full") return "full";
  if (value === "small") return "half";
  return "column";
}

function placementButtonLabel(value: LayoutPreferencePlacement) {
  if (value === "current-page") return "Current";
  if (value === "previous-page") return "Earlier";
  if (value === "next-page") return "Later";
  return "Auto";
}

function moveSelectedBlock(editor: Editor, direction: -1 | 1) {
  const selected = getSelectedBlockState(editor);
  if (!selected) return false;
  return moveTopLevelBlockAt(editor, selected.index, direction);
}

function moveBlockById(editor: Editor, blockId: string, direction: -1 | 1) {
  const doc = ensureEditorJsonHasBlockIds(editor.getJSON());
  const nodes = Array.isArray(doc.content) ? [...doc.content] : [];
  const index = nodes.findIndex((node) => isObjectRecord(node?.attrs) && node.attrs.blockId === blockId);
  if (index < 0) return false;
  return moveTopLevelBlockAt(editor, index, direction);
}

function moveTopLevelBlockAt(editor: Editor, index: number, direction: -1 | 1) {
  const doc = ensureEditorJsonHasBlockIds(editor.getJSON());
  const nodes = Array.isArray(doc.content) ? [...doc.content] : [];
  const targetIndex = index + direction;
  if (index < 0 || index >= nodes.length || targetIndex < 0 || targetIndex >= nodes.length) return false;
  const [item] = nodes.splice(index, 1);
  nodes.splice(targetIndex, 0, item);
  editor.commands.setContent({ ...doc, content: nodes });
  const movedId = isObjectRecord(item?.attrs) ? String(item.attrs.blockId ?? "") : "";
  if (movedId) jumpToBlock(editor, movedId);
  return true;
}

function jumpToBlock(editor: Editor, blockId: string) {
  let targetPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    if (attrs.blockId === blockId) {
      targetPos = pos;
      return false;
    }
    return true;
  });
  if (targetPos !== null) editor.chain().focus().setTextSelection(targetPos + 1).run();
}

function toggleHeadingSectionFlag(editor: Editor, blockId: string, key: "keepSectionTogether" | "forcePageBreakBefore") {
  const doc = ensureEditorJsonHasBlockIds(editor.getJSON());
  const nodes = Array.isArray(doc.content) ? [...doc.content] : [];
  const index = nodes.findIndex((node) => node?.type === "heading" && isObjectRecord(node.attrs) && node.attrs.blockId === blockId);
  if (index < 0) return false;
  const node = nodes[index] as JSONContent;
  const attrs = { ...(isObjectRecord(node.attrs) ? node.attrs : {}) } as Record<string, unknown>;
  attrs[key] = attrs[key] === true ? false : true;
  nodes[index] = { ...node, attrs };
  editor.commands.setContent({ ...doc, content: nodes });
  jumpToBlock(editor, blockId);
  return true;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 rounded border bg-white/70 p-1.5"><span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><div className="flex flex-wrap gap-1">{children}</div></div>;
}

function TemplatePanel({ template, saveState, saveError, onDirtyChange, onSave }: { template: TemplateSettings; saveState: SaveState; saveError: string | null; onDirtyChange: (dirty: boolean) => void; onSave: (input: Partial<TemplateSettings>) => Promise<boolean> }) {
  const previewStyle = useMemo(() => ({ "--primary": template.primaryColor, "--accent": template.accentColor } as React.CSSProperties), [template.primaryColor, template.accentColor]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <HeaderFooterSettingsPanel template={template} saveState={saveState} saveError={saveError} onDirtyChange={onDirtyChange} onSave={onSave} buttonLabel="Save template" />
      <Card>
        <CardHeader><CardTitle>A4 Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="relative aspect-[595/842] overflow-hidden rounded-sm border bg-white text-[8px]" style={previewStyle}>
            <img src={template.logoAssetPath} alt="Vellore Semicon" className="absolute left-[5%] top-[3.4%] h-[3.2%] w-[21%] object-contain object-left" />
            <div data-testid="template-preview-product-code" className="absolute right-[5%] top-[3.9%] flex max-w-[52%] justify-end text-right text-[7px] font-semibold uppercase italic leading-tight whitespace-normal break-words" style={{ color: template.primaryColor }}>{template.productCode || "PRODUCT CODE"}</div>
            <div className="absolute left-[5%] top-[6.75%] h-[0.36%] w-[90%]" style={{ background: "linear-gradient(90deg, " + template.accentColor + ", " + template.primaryColor + ")" }} />
            <div className="absolute left-[5%] top-[7.35%] h-px w-[90%]" style={{ background: "linear-gradient(90deg, " + template.accentColor + ", " + template.primaryColor + ")" }} />
            <div data-testid="template-preview-product-title" className="absolute right-[5%] top-[8.2%] max-w-[48%] text-right uppercase italic leading-tight whitespace-normal break-words" style={{ color: template.primaryColor }}>{template.productTitle || "Product title"}</div>
            <div className="absolute bottom-[6.5%] left-[5%] h-px w-[90%]" style={{ backgroundColor: template.primaryColor }} />
            <div className="absolute bottom-[4.4%] left-[5%] text-[#464646]">{template.website}</div>
            <div className="absolute bottom-[4.4%] left-1/2 -translate-x-1/2 text-[#464646]">1</div>
            <div className="absolute bottom-[4.4%] right-[5%] text-right text-[#464646]">{template.documentStatus} | {template.revision}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CleanupPanel({ report, onRestore, onRemove }: { report: CleanupReport; onRestore: (id: string) => void; onRemove: (id: string) => void }) {
  const [filter, setFilter] = useState<CleanupFilter>("all");
  const allItems = [...report.removedTextBlocks, ...report.removedImages, ...report.uncertainItems];
  const filters: Array<{ id: CleanupFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: allItems.length },
    { id: "removed-text", label: "Removed text", count: report.removedTextBlocks.length },
    { id: "removed-images", label: "Removed images", count: report.removedImages.length },
    { id: "uncertain", label: "Uncertain", count: report.uncertainItems.length },
    { id: "restored", label: "Manually restored", count: allItems.filter((item) => item.reasons.includes("MANUAL_RESTORED") || item.decision === "kept").length }
  ];
  const items = allItems.filter((item) => {
    if (filter === "removed-text") return item.itemType === "text" && item.decision === "removed";
    if (filter === "removed-images") return item.itemType === "image" && item.decision === "removed";
    if (filter === "uncertain") return item.decision === "uncertain";
    if (filter === "restored") return item.reasons.includes("MANUAL_RESTORED") || item.decision === "kept";
    return true;
  });

  return (
    <Card>
      <CardHeader><CardTitle>Source Cleanup Review</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Cleanup confidence {Math.round(report.confidence * 100)}%. Decisions are generic and reviewable.</p>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => <Button key={item.id} type="button" variant={filter === item.id ? "default" : "outline"} size="sm" onClick={() => setFilter(item.id)}>{item.label} ({item.count})</Button>)}
        </div>
        {items.length ? items.map((item) => <CleanupRow key={item.id} item={item} onRestore={onRestore} onRemove={onRemove} />) : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No cleanup items match this filter.</p>}
      </CardContent>
    </Card>
  );
}

function CleanupRow({ item, onRestore, onRemove }: { item: CleanupItem; onRestore: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div className="grid gap-3 rounded-md border bg-white p-3 lg:grid-cols-[1fr_auto]">
      <div>
        <p className="text-sm font-medium">Page {item.pageNumber} {item.itemType}</p>
        <p className="mt-1 text-sm text-muted-foreground">{item.text || item.storageKey || item.id}</p>
        <p className="mt-2 text-xs text-muted-foreground">{item.reasons.join(", ")} - {Math.round(item.confidence * 100)}% - {item.decision}</p>
      </div>
      <div className="flex gap-2 self-start"><Button type="button" variant="outline" size="sm" onClick={() => onRestore(item.id)}>Restore</Button><Button type="button" variant="outline" size="sm" onClick={() => onRemove(item.id)}>Keep removed</Button></div>
    </div>
  );
}

function CreateDatasheetPanel({ canCreate, isPending, onCreate }: { canCreate: boolean; isPending: boolean; onCreate: () => void }) {
  return <Card><CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Create editable datasheet</p><p className="text-sm text-muted-foreground">Generate a Vellore-branded editable draft from the completed extraction.</p></div><Button type="button" disabled={!canCreate || isPending} onClick={onCreate}><RefreshCcw size={15} />{isPending ? "Creating..." : "Create editable datasheet"}</Button></CardContent></Card>;
}

function ComposerState({ label }: { label: string }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{label}</p>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "color" }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function LayoutModeField({ value, onChange }: { value: TemplateSettings["layoutMode"]; onChange: (value: TemplateSettings["layoutMode"]) => void }) {
  return <div className="space-y-2"><Label>Layout mode</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value === "single-column" ? "single-column" : "two-column")}><option value="two-column">Two-column technical datasheet</option><option value="single-column">Single-column document</option></select></div>;
}

function layoutModeLabel(value: TemplateSettings["layoutMode"]) {
  return value === "single-column" ? "Single-column document" : "Two-column technical datasheet";
}

function LayoutDensityField({ value, onChange }: { value: TemplateSettings["layoutDensity"]; onChange: (value: TemplateSettings["layoutDensity"]) => void }) {
  return <div className="space-y-2"><Label>Layout density</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value === "comfortable" ? "comfortable" : "technical-dense")}><option value="technical-dense">Technical dense</option><option value="comfortable">Comfortable</option></select></div>;
}

function layoutDensityLabel(value: TemplateSettings["layoutDensity"]) {
  return value === "comfortable" ? "Comfortable" : "Technical dense";
}

function PageFillStrategyField({ value, onChange }: { value: TemplateSettings["pageFillStrategy"]; onChange: (value: TemplateSettings["pageFillStrategy"]) => void }) {
  return <div className="space-y-2"><Label>Page fill strategy</Label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={value} onChange={(event) => onChange(event.target.value === "safe" ? "safe" : event.target.value === "aggressive" ? "aggressive" : "balanced")}><option value="safe">Safe</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></div>;
}

function pageFillStrategyLabel(value: TemplateSettings["pageFillStrategy"]) {
  return value === "safe" ? "Safe" : value === "aggressive" ? "Aggressive" : "Balanced";
}

function TabButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" disabled={disabled} onClick={onClick}>{children}</Button>;
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="gap-1.5">{children}<span className="sr-only sm:not-sr-only">{label}</span></Button>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function safeErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  return body?.error?.message ?? fallback;
}


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
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Download, ExternalLink, FileDown, FilePlus2, Heading1, Heading2, ImageIcon, Italic, List, ListOrdered, Maximize2, RefreshCcw, Save, SubscriptIcon, SuperscriptIcon, Table2, UnderlineIcon } from "lucide-react";
import { ExtractionReview } from "@/components/extraction-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectStatus = "DRAFT" | "UPLOADED" | "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";
type ComposerTab = "extraction" | "editor" | "paged-preview" | "template" | "cleanup" | "export";
type CleanupFilter = "all" | "removed-text" | "removed-images" | "uncertain" | "restored";
type CleanupItem = { id: string; itemType: "text" | "image"; pageNumber: number; text?: string; storageKey?: string; confidence: number; reasons: string[]; decision: string };
type CleanupReport = { removedTextBlocks: CleanupItem[]; removedImages: CleanupItem[]; uncertainItems: CleanupItem[]; confidence: number; reasonCodes: string[] };
type DatasheetDocument = { id: string; status: string; title: string; productCode: string; productCategory: string; editorJson: JSONContent; sourceCleanupReport: CleanupReport; lastSavedAt: string };
type TemplateSettings = { id: string; logoAssetPath: string; companyName: string; website: string; productCode: string; productTitle: string; documentStatus: string; revision: string; layoutMode: "two-column" | "single-column"; layoutDensity: "comfortable" | "technical-dense"; primaryColor: string; accentColor: string; footerText: string; showPageNumbers: boolean };
type DatasheetBundle = { document: DatasheetDocument; template: TemplateSettings };
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

const KeepWithNext = Extension.create({
  name: "keepWithNext",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          keepWithNext: {
            default: false,
            parseHTML: (element) => element.getAttribute("data-keep-with-next") === "true",
            renderHTML: (attributes) => attributes.keepWithNext ? { "data-keep-with-next": "true", class: "keep-with-next" } : {},
          },
        },
      },
    ];
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
  KeepWithNext,
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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exports, setExports] = useState<DatasheetExport[]>([]);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [hasUnsavedEditorChanges, setHasUnsavedEditorChanges] = useState(false);
  const [hasUnsavedTemplateChanges, setHasUnsavedTemplateChanges] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const canCreate = status === "REVIEW_REQUIRED";
  const canRegenerate = Boolean(bundle);

  useEffect(() => {
    void loadDatasheet();
  }, [projectId]);

  async function loadDatasheet() {
    setLoadState("loading");
    const response = await fetch(`/api/projects/${projectId}/datasheet`, { cache: "no-store" });
    if (response.status === 404) {
      setLoadState("missing");
      return;
    }
    if (!response.ok) {
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

  function createDatasheet() {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/datasheet/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      if (!response.ok) {
        setNotice({ tone: "error", text: "Editable datasheet could not be created yet." });
        return;
      }
      setBundle((await response.json()) as DatasheetBundle);
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
      setBundle((await response.json()) as DatasheetBundle);
      setSaveState("saved");
      setSaveError(null);
      setHasUnsavedEditorChanges(false);
      setHasUnsavedTemplateChanges(false);
      setPreviewVersion((current) => current + 1);
      void loadExports();
      setTab("editor");
      setNotice({ tone: "success", text: "Editable datasheet regenerated from the latest extraction." });
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

  async function createPdfExport() {
    setExportState("exporting");
    setExportError(null);
    const response = await fetch(`/api/projects/${projectId}/datasheet/export/pdf`, { method: "POST" });
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
          <TabButton active={tab === "paged-preview"} onClick={() => setTab("paged-preview")} disabled={!bundle}>Paged Preview</TabButton>
          <TabButton active={tab === "template"} onClick={() => setTab("template")} disabled={!bundle}>Branding Template</TabButton>
          <TabButton active={tab === "cleanup"} onClick={() => setTab("cleanup")} disabled={!bundle}>Cleanup Review</TabButton>
          <TabButton active={tab === "export"} onClick={() => { setTab("export"); void loadExports(); }} disabled={!bundle}>Exports</TabButton>
        </div>
        {canRegenerate ? <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={regenerateDatasheet}><RefreshCcw size={15} />{isPending ? "Regenerating..." : "Regenerate editable datasheet from extraction"}</Button> : null}
      </div>

      {notice ? <p className={`rounded-md p-3 text-sm ${notice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</p> : null}
      {tab === "extraction" ? <ExtractionReview projectId={projectId} status={status} originalPdfUrl={originalPdfUrl} /> : null}
      {tab === "extraction" && loadState === "missing" ? <CreateDatasheetPanel canCreate={canCreate} isPending={isPending} onCreate={createDatasheet} /> : null}
      {tab !== "extraction" && loadState === "loading" ? <ComposerState label="Loading editable datasheet..." /> : null}
      {tab !== "extraction" && loadState === "missing" ? <CreateDatasheetPanel canCreate={canCreate} isPending={isPending} onCreate={createDatasheet} /> : null}
      {tab !== "extraction" && loadState === "failed" ? <ComposerState label="Datasheet composer could not be loaded." /> : null}
      {tab === "editor" && bundle ? <DatasheetEditor bundle={bundle} saveState={saveState} saveError={saveError} onDirtyChange={setHasUnsavedEditorChanges} onTemplateDirtyChange={setHasUnsavedTemplateChanges} onSave={saveDocument} onTemplateSave={saveTemplate} /> : null}
      {tab === "paged-preview" && bundle ? <PagedPreviewPanel projectId={projectId} bundle={bundle} previewVersion={previewVersion} hasUnsavedChanges={hasUnsavedEditorChanges || hasUnsavedTemplateChanges} onRefresh={() => setPreviewVersion((current) => current + 1)} /> : null}
      {tab === "template" && bundle ? <TemplatePanel template={bundle.template} saveState={saveState} saveError={saveError} onDirtyChange={setHasUnsavedTemplateChanges} onSave={saveTemplate} /> : null}
      {tab === "cleanup" && bundle ? <CleanupPanel report={bundle.document.sourceCleanupReport} onRestore={(id) => cleanupAction("restore", id)} onRemove={(id) => cleanupAction("remove", id)} /> : null}
      {tab === "export" && bundle ? <ExportPanel exports={exports} exportState={exportState} exportError={exportError} hasUnsavedChanges={hasUnsavedEditorChanges || hasUnsavedTemplateChanges} onExport={createPdfExport} onRefresh={loadExports} /> : null}
    </div>
  );
}

function DatasheetEditor({ bundle, saveState, saveError, onDirtyChange, onTemplateDirtyChange, onSave, onTemplateSave }: { bundle: DatasheetBundle; saveState: SaveState; saveError: string | null; onDirtyChange: (dirty: boolean) => void; onTemplateDirtyChange: (dirty: boolean) => void; onSave: (input: Partial<DatasheetDocument>) => Promise<boolean>; onTemplateSave: (input: Partial<TemplateSettings>) => Promise<boolean> }) {
  const [title, setTitle] = useState(bundle.document.title);
  const [productCode, setProductCode] = useState(bundle.document.productCode);
  const [productCategory, setProductCategory] = useState(bundle.document.productCategory);
  const [dirty, setDirty] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions,
    content: bundle.document.editorJson,
    onUpdate: () => {
      setDirty(true);
      onDirtyChange(true);
    },
    editorProps: { attributes: { class: "datasheet-editor-surface min-h-[780px] bg-white px-8 py-9 text-[13px] leading-6 text-slate-800 outline-none [&_a]:text-blue-700 [&_a]:underline [&_caption]:text-xs [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:text-[22px] [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-[#0D2B55] [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-[17px] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[#0D2B55] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[14px] [&_h3]:font-bold [&_h3]:text-[#0D2B55] [&_li]:my-1 [&_ol]:mb-4 [&_ol]:ml-7 [&_ol]:list-decimal [&_p.image-caption]:text-center [&_p.image-caption]:text-xs [&_p.image-caption]:text-slate-500 [&_p]:mb-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#0D2B55] [&_ul]:mb-4 [&_ul]:ml-7 [&_ul]:list-disc [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-[#D6533E] [&_.datasheet-editor-image]:mx-auto [&_.datasheet-editor-image]:block [&_.datasheet-editor-image]:h-auto [&_.datasheet-editor-image]:max-w-full [&_.datasheet-editor-image-small]:w-[45%] [&_.datasheet-editor-image-medium]:w-[72%] [&_.datasheet-editor-image-full]:w-full [&_.keep-with-next]:border-l-2 [&_.keep-with-next]:border-amber-300 [&_.keep-with-next]:pl-3 [&_.page-break]:my-7 [&_.page-break]:flex [&_.page-break]:items-center [&_.page-break]:gap-3 [&_.page-break]:border-t-2 [&_.page-break]:border-dashed [&_.page-break]:border-slate-300 [&_.page-break]:text-xs [&_.page-break]:font-semibold [&_.page-break]:uppercase [&_.page-break]:tracking-wide [&_.page-break]:text-slate-400" } }
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(bundle.document.editorJson);
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
      void onSave({ title, productCode, productCategory, editorJson: editor.getJSON(), status: "EDITING" }).then((saved) => {
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
    const saved = await onSave({ title, productCode, productCategory, editorJson: editor.getJSON(), status: "EDITING" });
    if (saved) {
      setDirty(false);
      onDirtyChange(false);
    }
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
          <p className="text-sm text-muted-foreground">Edit the datasheet body on a document canvas. Header and footer fields can be adjusted in the panel beside it. Layout: {layoutModeLabel(bundle.template.layoutMode)}. Density: {layoutDensityLabel(bundle.template.layoutDensity)}.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <EditorToolbar editor={editor} />
          <div data-testid="editor-workspace" className="overflow-auto rounded-md border bg-slate-200 px-3 py-5 sm:px-6 lg:px-8"><div data-testid="editor-document-canvas" className="mx-auto min-h-[920px] w-full max-w-[794px] rounded-sm border border-slate-300 bg-white shadow-lg"><EditorContent editor={editor} /></div></div><style>{`.datasheet-editor-surface .page-break::before,.datasheet-editor-surface .page-break::after{content:"";height:1px;flex:1;background:#cbd5e1}.datasheet-editor-surface .page-break-label{border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;padding:2px 10px}.datasheet-editor-surface .keep-with-next{position:relative}.datasheet-editor-surface .keep-with-next::before{content:"Keep with next";display:inline-block;margin-right:8px;border-radius:999px;background:#fef3c7;color:#92400e;padding:1px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}`}</style>
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
        <HeaderFooterSettingsPanel template={bundle.template} saveState={saveState} saveError={saveError} onDirtyChange={onTemplateDirtyChange} onSave={onTemplateSave} />
      </div>
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

function PagedPreviewPanel({ projectId, bundle, previewVersion, hasUnsavedChanges, onRefresh }: { projectId: string; bundle: DatasheetBundle; previewVersion: number; hasUnsavedChanges: boolean; onRefresh: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [zoom, setZoom] = useState<"fit" | "75" | "100">("fit");
  const previewSrc = "/api/projects/" + projectId + "/datasheet/export/preview?v=" + previewVersion + "&saved=" + encodeURIComponent(bundle.document.lastSavedAt);
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
            <Button type="button" variant={zoom === "fit" ? "default" : "outline"} size="sm" onClick={() => setZoom("fit")}>Fit width</Button>
            <Button type="button" variant={zoom === "75" ? "default" : "outline"} size="sm" onClick={() => setZoom("75")}>75%</Button>
            <Button type="button" variant={zoom === "100" ? "default" : "outline"} size="sm" onClick={() => setZoom("100")}>100%</Button>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}><RefreshCcw size={15} />Refresh preview</Button>
            <Button type="button" variant="outline" size="sm" asChild><a href={previewSrc} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open in new tab</a></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">Preview uses saved content. Current layout: {layoutModeLabel(bundle.template.layoutMode)}. Density: {layoutDensityLabel(bundle.template.layoutDensity)}.</p>
        {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save changes to update preview/export.</p> : null}
        {state === "loading" ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Loading paged preview...</p> : null}
        {state === "failed" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700"><span>Paged preview could not be loaded.</span><Button type="button" variant="outline" size="sm" onClick={onRefresh}>Retry</Button></div> : null}
        <div className="h-[76vh] overflow-auto rounded-md border bg-slate-200 p-4">
          <iframe key={previewSrc} title="Paged datasheet preview" data-testid="paged-preview-frame" src={previewSrc} className={"mx-auto h-full " + zoomClass + " bg-white shadow-sm"} onLoad={() => setState("ready")} onError={() => setState("failed")} />
        </div>
      </CardContent>
    </Card>
  );
}

function ExportPanel({ exports, exportState, exportError, hasUnsavedChanges, onExport, onRefresh }: { exports: DatasheetExport[]; exportState: ExportState; exportError: string | null; hasUnsavedChanges: boolean; onExport: () => Promise<void>; onRefresh: () => Promise<void> }) {
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
            <Button type="button" variant="outline" onClick={() => void onRefresh()} disabled={isExporting}><RefreshCcw size={15} />Refresh</Button>
            <Button type="button" onClick={() => void onExport()} disabled={isExporting || hasUnsavedChanges}><FileDown size={15} />{isExporting ? "Exporting..." : "Export PDF"}</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save changes to update preview/export.</p> : null}
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

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
  if (!editor) return <div className="h-10 rounded-md border bg-secondary/40" />;
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
      </ToolbarGroup>
      <ToolbarGroup label="Layout">
        <ToolButton label="Insert page break" onClick={() => editor.chain().focus().insertContent({ type: "pageBreak" }).run()}><FilePlus2 size={15} /></ToolButton>
        <ToolButton label="Keep with next" active={editor.isActive({ keepWithNext: true })} onClick={() => {
          const nodeType = editor.isActive("heading") ? "heading" : "paragraph";
          editor.chain().focus().updateAttributes(nodeType, { keepWithNext: true }).run();
        }}>Keep</ToolButton>
      </ToolbarGroup>
      <ToolbarGroup label="Image">
        <ToolButton label="Image small" onClick={() => editor.chain().focus().updateAttributes("image", { displaySize: "small" }).run()}><ImageIcon size={15} /></ToolButton>
        <ToolButton label="Image medium" onClick={() => editor.chain().focus().updateAttributes("image", { displaySize: "medium" }).run()}><ImageIcon size={15} /></ToolButton>
        <ToolButton label="Image full width" onClick={() => editor.chain().focus().updateAttributes("image", { displaySize: "full" }).run()}><Maximize2 size={15} /></ToolButton>
        <ToolButton label="Remove selected image" onClick={() => editor.chain().focus().deleteSelection().run()}><ImageIcon size={15} /></ToolButton>
      </ToolbarGroup>
    </div>
  );
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

function TabButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" disabled={disabled} onClick={onClick}>{children}</Button>;
}

function ToolButton({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" title={label} aria-label={label} onClick={onClick} className="gap-1.5">{children}<span className="sr-only sm:not-sr-only">{label}</span></Button>;
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

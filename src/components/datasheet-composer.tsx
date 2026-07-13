"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { Bold, Download, FileDown, Heading1, Heading2, ImageIcon, Italic, List, ListOrdered, RefreshCcw, Save, SubscriptIcon, SuperscriptIcon, Table2, UnderlineIcon } from "lucide-react";
import { ExtractionReview } from "@/components/extraction-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectStatus = "DRAFT" | "UPLOADED" | "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";
type ComposerTab = "extraction" | "editor" | "template" | "cleanup" | "export";
type CleanupFilter = "all" | "removed-text" | "removed-images" | "uncertain" | "restored";
type CleanupItem = { id: string; itemType: "text" | "image"; pageNumber: number; text?: string; storageKey?: string; confidence: number; reasons: string[]; decision: string };
type CleanupReport = { removedTextBlocks: CleanupItem[]; removedImages: CleanupItem[]; uncertainItems: CleanupItem[]; confidence: number; reasonCodes: string[] };
type DatasheetDocument = { id: string; status: string; title: string; productCode: string; productCategory: string; editorJson: JSONContent; sourceCleanupReport: CleanupReport; lastSavedAt: string };
type TemplateSettings = { id: string; logoAssetPath: string; companyName: string; website: string; productCode: string; productTitle: string; documentStatus: string; revision: string; primaryColor: string; accentColor: string; footerText: string; showPageNumbers: boolean };
type DatasheetBundle = { document: DatasheetDocument; template: TemplateSettings };
type DatasheetExport = { id: string; status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"; filename: string; fileSize: number | null; errorMessage: string | null; completedAt: string | null; createdAt: string; downloadUrl: string | null };
type SaveState = "idle" | "saving" | "saved" | "failed";
type ExportState = "idle" | "loading" | "exporting" | "failed";
type ApiErrorBody = { error?: { message?: string; code?: string; details?: unknown } };

type Notice = { tone: "error" | "success"; text: string } | null;

const editorExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
  TextStyle,
  Color,
  Underline,
  Link.configure({ openOnClick: false }),
  Image.configure({ allowBase64: false }),
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
      {tab === "editor" && bundle ? <DatasheetEditor bundle={bundle} saveState={saveState} saveError={saveError} onDirtyChange={setHasUnsavedEditorChanges} onSave={saveDocument} /> : null}
      {tab === "template" && bundle ? <TemplatePanel template={bundle.template} saveState={saveState} saveError={saveError} onSave={saveTemplate} /> : null}
      {tab === "cleanup" && bundle ? <CleanupPanel report={bundle.document.sourceCleanupReport} onRestore={(id) => cleanupAction("restore", id)} onRemove={(id) => cleanupAction("remove", id)} /> : null}
      {tab === "export" && bundle ? <ExportPanel exports={exports} exportState={exportState} exportError={exportError} hasUnsavedChanges={hasUnsavedEditorChanges} onExport={createPdfExport} onRefresh={loadExports} /> : null}
    </div>
  );
}

function DatasheetEditor({ bundle, saveState, saveError, onDirtyChange, onSave }: { bundle: DatasheetBundle; saveState: SaveState; saveError: string | null; onDirtyChange: (dirty: boolean) => void; onSave: (input: Partial<DatasheetDocument>) => Promise<boolean> }) {
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
    editorProps: { attributes: { class: "datasheet-editor-surface min-h-[620px] bg-white px-7 py-6 text-[0.95rem] leading-7 outline-none" } }
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
          <p className="text-sm text-muted-foreground">Editing body content only. Header/footer controlled in Branding Template.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <EditorToolbar editor={editor} />
          <div className="overflow-hidden rounded-md border bg-white"><EditorContent editor={editor} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Document Metadata</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Title" value={title} onChange={(value) => updateMetadata(setTitle, value)} />
          <Field label="Product code" value={productCode} onChange={(value) => updateMetadata(setProductCode, value)} />
          <Field label="Product category" value={productCategory} onChange={(value) => updateMetadata(setProductCategory, value)} />
          <p className="text-xs text-muted-foreground">Last saved {new Date(bundle.document.lastSavedAt).toLocaleString()}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SaveStatus({ dirty, saveState, saveError }: { dirty: boolean; saveState: SaveState; saveError: string | null }) {
  if (saveState === "saving") return <span>Saving...</span>;
  if (saveState === "failed") return <span className="text-red-700">Save failed: {saveError ?? "Please try again."}</span>;
  if (dirty) return <span>Unsaved changes</span>;
  return <span>Saved</span>;
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
        {hasUnsavedChanges ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Save changes before export.</p> : null}
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
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-secondary/40 p-1.5">
      <ToolButton label="H1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolButton>
      <ToolButton label="H2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolButton>
      <ToolButton label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></ToolButton>
      <ToolButton label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolButton>
      <ToolButton label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolButton>
      <ToolButton label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></ToolButton>
      <ToolButton label="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolButton>
      <ToolButton label="Subscript" onClick={() => editor.chain().focus().toggleSubscript().run()}><SubscriptIcon size={15} /></ToolButton>
      <ToolButton label="Superscript" onClick={() => editor.chain().focus().toggleSuperscript().run()}><SuperscriptIcon size={15} /></ToolButton>
      <ToolButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={15} /></ToolButton>
      <ToolButton label="Add table row" onClick={() => editor.chain().focus().addRowAfter().run()}>+ row</ToolButton>
      <ToolButton label="Add table column" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ col</ToolButton>
      <ToolButton label="Remove selected image" onClick={() => editor.chain().focus().deleteSelection().run()}><ImageIcon size={15} /></ToolButton>
    </div>
  );
}

function TemplatePanel({ template, saveState, saveError, onSave }: { template: TemplateSettings; saveState: SaveState; saveError: string | null; onSave: (input: Partial<TemplateSettings>) => Promise<boolean> }) {
  const [form, setForm] = useState(template);
  const previewStyle = useMemo(() => ({ "--primary": form.primaryColor, "--accent": form.accentColor } as React.CSSProperties), [form.primaryColor, form.accentColor]);

  useEffect(() => {
    setForm(template);
  }, [template]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader><CardTitle>Branding Template</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Product code" value={form.productCode} onChange={(value) => setForm({ ...form, productCode: value })} />
          <Field label="Product title/category" value={form.productTitle} onChange={(value) => setForm({ ...form, productTitle: value })} />
          <Field label="Document status" value={form.documentStatus} onChange={(value) => setForm({ ...form, documentStatus: value })} />
          <Field label="Revision" value={form.revision} onChange={(value) => setForm({ ...form, revision: value })} />
          <Field label="Website" value={form.website} onChange={(value) => setForm({ ...form, website: value })} />
          <Field label="Primary color" value={form.primaryColor} onChange={(value) => setForm({ ...form, primaryColor: value })} type="color" />
          <Field label="Accent color" value={form.accentColor} onChange={(value) => setForm({ ...form, accentColor: value })} type="color" />
          <div className="md:col-span-2"><Button type="button" onClick={() => void onSave(form)} disabled={saveState === "saving"}><Save size={15} />Save template</Button><span className="ml-3 text-xs text-muted-foreground">{saveState === "saving" ? "Saving..." : saveState === "failed" ? `Save failed: ${saveError ?? "Please try again."}` : "Saved"}</span></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>A4 Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="relative aspect-[595/842] overflow-hidden rounded-sm border bg-white text-[8px]" style={previewStyle}>
            <img src={form.logoAssetPath} alt="Vellore Semicon" className="absolute left-[5%] top-[3.4%] h-[3.2%] w-[21%] object-contain object-left" />
            <div data-testid="template-preview-product-code" className="absolute right-[5%] top-[3.9%] flex max-w-[52%] justify-end text-right text-[7px] font-semibold uppercase italic leading-tight whitespace-normal break-words" style={{ color: form.primaryColor }}>{form.productCode || "PRODUCT CODE"}</div>
            <div className="absolute left-[5%] top-[6.75%] h-[0.36%] w-[90%]" style={{ background: `linear-gradient(90deg, ${form.accentColor}, ${form.primaryColor})` }} />
            <div className="absolute left-[5%] top-[7.35%] h-px w-[90%]" style={{ background: `linear-gradient(90deg, ${form.accentColor}, ${form.primaryColor})` }} />
            <div data-testid="template-preview-product-title" className="absolute right-[5%] top-[8.2%] max-w-[48%] text-right uppercase italic leading-tight whitespace-normal break-words" style={{ color: form.primaryColor }}>{form.productTitle || "Product title"}</div>
            <div className="absolute bottom-[6.5%] left-[5%] h-px w-[90%]" style={{ backgroundColor: form.primaryColor }} />
            <div className="absolute bottom-[4.4%] left-[5%] text-[#464646]">{form.website}</div>
            <div className="absolute bottom-[4.4%] left-1/2 -translate-x-1/2 text-[#464646]">1</div>
            <div className="absolute bottom-[4.4%] right-[5%] text-right text-[#464646]">{form.documentStatus} | {form.revision}</div>
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

function TabButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant={active ? "default" : "outline"} size="sm" disabled={disabled} onClick={onClick}>{children}</Button>;
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" variant="outline" size="sm" title={label} aria-label={label} onClick={onClick}>{children}</Button>;
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

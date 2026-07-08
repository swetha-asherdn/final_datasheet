"use client";

import React, { useEffect, useState, useTransition } from "react";
import { AlertTriangle, FileText, ImageIcon, RefreshCcw, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProjectStatus = "DRAFT" | "UPLOADED" | "QUEUED" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED";
type Summary = { textBlockCount: number; imageCount: number; tableCount: number; warningCount: number; ocrUsed: boolean; nativeTextDetected: boolean };
type Run = { id: string; status: string; pageCount: number; summary: Summary; warnings: string[]; errorSummary: string | null };
type PageSummary = { pageNumber: number; width: number; height: number; textBlockCount: number; imageCount: number; tableCount: number; warnings: string[]; confidence: number; previewUrl?: string };
type TextBlock = { id: string; type: string; text: string; extractionMethod: "native" | "ocr"; confidence: number; readingOrderIndex: number };
type ExtractedImage = { id: string; pageNumber: number; width: number; height: number; mimeType: string; confidence: number; warnings: string[]; url?: string };
type TableCell = { text: string; rowSpan: number; colSpan: number };
type ExtractedTable = { id: string; rows: TableCell[][]; confidence: number; warnings: string[] };
type PageDetail = PageSummary & { previewUrl: string; textBlocks: TextBlock[]; images: ExtractedImage[]; tables: ExtractedTable[] };
type ExtractionResponse = { run: Run | null; pages: PageSummary[]; pagination: { page: number; pageSize: number; total: number; pageCount: number } };
type PageResponse = { page: PageDetail };
type ArtifactImageProps = {
  src?: string;
  alt: string;
  className: string;
  placeholderClassName: string;
  loadingLabel: string;
  missingLabel: string;
  failedLabel: string;
  retryLabel?: string;
  wrapperClassName?: string;
};

type ArtifactStatus = "loading" | "loaded" | "error" | "missing";

export function ExtractionReview({ projectId, status, originalPdfUrl }: { projectId: string; status: ProjectStatus; originalPdfUrl: string }) {
  const [summary, setSummary] = useState<ExtractionResponse | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [page, setPage] = useState<PageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function loadSummary() {
    const response = await fetch(`/api/projects/${projectId}/extraction`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load extraction summary");
    const body = (await response.json()) as ExtractionResponse;
    setSummary(body);
    const firstPage = body.pages[0]?.pageNumber;
    if (firstPage && !selectedPage) setSelectedPage(firstPage);
  }

  async function loadPage(pageNumber: number) {
    setIsPageLoading(true);
    const response = await fetch(`/api/projects/${projectId}/extraction/pages/${pageNumber}`, { cache: "no-store" });
    if (!response.ok) {
      setPage(null);
      setIsPageLoading(false);
      return;
    }
    const body = (await response.json()) as PageResponse;
    setPage(body.page);
    setIsPageLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await loadSummary();
        setError(null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load extraction");
      }
    }
    void load();
    if (!["QUEUED", "PROCESSING"].includes(status)) return () => { active = false; };
    const interval = window.setInterval(() => void load(), 3500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [projectId, status]);

  useEffect(() => {
    if (!selectedPage) return;
    void loadPage(selectedPage);
  }, [projectId, selectedPage]);

  async function retryExtraction() {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/retry-extraction`, { method: "POST" });
      if (!response.ok) {
        setError("Retry could not be started");
        return;
      }
      await loadSummary();
    });
  }

  const run = summary?.run ?? null;
  const runSummary = run?.summary;
  const isProcessing = ["QUEUED", "PROCESSING"].includes(status);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<FileText size={18} />} label="Pages" value={String(run?.pageCount ?? summary?.pagination.total ?? 0)} />
        <Metric icon={<FileText size={18} />} label="Text blocks" value={String(runSummary?.textBlockCount ?? 0)} />
        <Metric icon={<ImageIcon size={18} />} label="Images" value={String(runSummary?.imageCount ?? 0)} />
        <Metric icon={<Table2 size={18} />} label="Tables" value={String(runSummary?.tableCount ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Extraction review</CardTitle>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span>OCR {runSummary?.ocrUsed ? "used" : "not used"}</span>
              <span>{runSummary?.warningCount ?? 0} warnings</span>
              <Button variant="outline" size="sm" asChild><a href={originalPdfUrl} target="_blank" rel="noreferrer">Original PDF</a></Button>
              {status === "FAILED" ? <Button size="sm" onClick={retryExtraction} disabled={isPending}><RefreshCcw size={15} />Retry</Button> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <StateMessage tone="error" message={error} /> : null}
          {status === "FAILED" ? <StateMessage tone="error" message="Extraction failed. The original upload is preserved and can be retried." /> : null}
          {isProcessing ? <StateMessage tone="info" message="Extraction is running. This view refreshes while the worker processes pages." /> : null}
          {!isProcessing && !run ? <StateMessage tone="info" message="No extraction run is available yet." /> : null}

          <div className="grid gap-5 lg:grid-cols-[180px_1fr_360px]">
            <aside className="space-y-2">
              {(summary?.pages ?? []).map((item) => (
                <button
                  key={item.pageNumber}
                  type="button"
                  onClick={() => setSelectedPage(item.pageNumber)}
                  className={`w-full rounded-md border p-2 text-left text-sm transition ${selectedPage === item.pageNumber ? "border-primary bg-secondary" : "border-border bg-white hover:border-primary/50"}`}
                >
                  <ArtifactImage
                    src={item.previewUrl}
                    alt={`Page ${item.pageNumber}`}
                    className="mb-2 aspect-[3/4] w-full rounded border bg-white object-cover"
                    placeholderClassName="mb-2 aspect-[3/4] w-full rounded border"
                    loadingLabel="Loading preview..."
                    missingLabel="Preview unavailable"
                    failedLabel="Preview failed to load"
                  />
                  <span className="font-medium">Page {item.pageNumber}</span>
                  <span className="block text-xs text-muted-foreground">{item.textBlockCount} text, {item.imageCount} images</span>
                </button>
              ))}
              {summary?.pages.length === 0 ? <p className="text-sm text-muted-foreground">Page previews will appear after extraction.</p> : null}
            </aside>

            <section className="min-h-[520px] rounded-md border bg-secondary/30 p-3">
              {isPageLoading ? <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">Loading extracted page...</div> : null}
              {!isPageLoading && page ? (
                <ArtifactImage
                  src={page.previewUrl}
                  alt={`Extracted page ${page.pageNumber}`}
                  className="mx-auto max-h-[760px] rounded-sm border bg-white object-contain"
                  placeholderClassName="flex min-h-[420px] items-center justify-center rounded-sm border bg-white"
                  loadingLabel="Loading page preview..."
                  missingLabel="Preview artifact missing"
                  failedLabel="Preview could not be loaded"
                  retryLabel="Retry preview"
                  wrapperClassName="flex min-h-[420px] items-center justify-center"
                />
              ) : null}
              {!isPageLoading && !page ? <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">Select a page after extraction completes.</div> : null}
            </section>

            <aside className="space-y-4">
              <Panel title="Text">
                {page?.textBlocks.length ? page.textBlocks.slice(0, 12).map((block) => <p key={block.id} className="rounded border bg-white p-2 text-sm leading-6">{block.text}</p>) : <Empty label="No text detected on this page." />}
              </Panel>
              <Panel title="Images">
                {page?.images.length ? page.images.map((image) => <div key={image.id} className="rounded border bg-white p-2 text-sm"><span>{image.width} x {image.height}</span><ArtifactImage src={image.url} alt={image.id} className="mt-2 max-h-28 rounded border bg-white object-contain" placeholderClassName="mt-2 flex min-h-28 items-center justify-center rounded border bg-secondary/40" loadingLabel="Loading image..." missingLabel="Image artifact missing" failedLabel="Image failed to load" /></div>) : <Empty label="No embedded images detected." />}
              </Panel>
              <Panel title="Tables">
                {page?.tables.length ? page.tables.map((table) => <TablePreview key={table.id} table={table} />) : <Empty label="No reliable tables detected." />}
              </Panel>
              <Panel title="Warnings">
                {page?.warnings.length ? page.warnings.map((warning) => <p key={warning} className="flex gap-2 text-sm text-amber-700"><AlertTriangle size={15} />{warning}</p>) : <Empty label="No page warnings." />}
              </Panel>
              <p className="text-xs text-muted-foreground">Editing arrives in Phase 3.</p>
            </aside>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ArtifactImage({ src, alt, className, placeholderClassName, loadingLabel, missingLabel, failedLabel, retryLabel, wrapperClassName }: ArtifactImageProps) {
  const [status, setStatus] = useState<ArtifactStatus>(src ? "loading" : "missing");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!src) {
      setStatus("missing");
      return;
    }

    let active = true;
    const image = new window.Image();
    setStatus("loading");
    image.onload = () => {
      if (active) setStatus("loaded");
    };
    image.onerror = () => {
      if (active) setStatus("error");
    };
    image.src = src;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [src, retryCount]);

  if (!src) {
    return <ArtifactPlaceholder className={placeholderClassName} label={missingLabel} />;
  }

  if (status === "loaded") {
    return <img src={src} alt={alt} onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} className={className} />;
  }

  return (
    <div className={wrapperClassName}>
      <ArtifactPlaceholder className={placeholderClassName} label={status === "error" ? failedLabel : loadingLabel}>
        {status === "error" && retryLabel ? <Button type="button" variant="outline" size="sm" onClick={() => setRetryCount((value) => value + 1)}>{retryLabel}</Button> : null}
      </ArtifactPlaceholder>
    </div>
  );
}

function ArtifactPlaceholder({ className, label, children }: { className: string; label: string; children?: React.ReactNode }) {
  return <div className={`${className} flex flex-col gap-2 text-center text-xs text-muted-foreground`}><span className="px-3">{label}</span>{children}</div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3><div className="space-y-2">{children}</div></div>;
}

function Empty({ label }: { label: string }) {
  return <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">{label}</p>;
}

function StateMessage({ tone, message }: { tone: "info" | "error"; message: string }) {
  const className = tone === "error" ? "mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" : "mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700";
  return <p className={className}>{message}</p>;
}

function TablePreview({ table }: { table: ExtractedTable }) {
  return (
    <div className="overflow-auto rounded border bg-white">
      <table className="w-full text-xs">
        <tbody>
          {table.rows.slice(0, 6).map((row, rowIndex) => (
            <tr key={`${table.id}-${rowIndex}`}>
              {row.map((cell, cellIndex) => <td key={`${table.id}-${rowIndex}-${cellIndex}`} className="border p-1">{cell.text}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


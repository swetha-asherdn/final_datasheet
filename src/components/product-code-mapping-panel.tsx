"use client";

import React, { useState } from "react";
import { Check, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ArrowRight, RefreshCcw, Save, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SupplierCodeMapping, ReplacementReport } from "@/lib/supplier-product-code-mapping";

export type ProductCodeMappingPanelProps = {
  mappings: SupplierCodeMapping[];
  report?: ReplacementReport | null;
  onUpdateMapping: (id: string, patch: Partial<SupplierCodeMapping>) => void;
  onAutoGenerate: () => void;
  onConfirmAll: () => void;
  onApplyAndSave: () => Promise<void>;
  isSaving?: boolean;
};

export function ProductCodeMappingPanel({
  mappings,
  report,
  onUpdateMapping,
  onAutoGenerate,
  onConfirmAll,
  onApplyAndSave,
  isSaving = false,
}: ProductCodeMappingPanelProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "confirmed" | "pending" | "ignored">("all");

  const filteredMappings = mappings.filter((m) => {
    const matchesSearch =
      m.supplierCode.toLowerCase().includes(search.toLowerCase()) ||
      m.velloreCode.toLowerCase().includes(search.toLowerCase()) ||
      m.section.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || m.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const confirmedCount = mappings.filter((m) => m.status === "confirmed").length;
  const pendingCount = mappings.filter((m) => m.status === "pending").length;
  const ignoredCount = mappings.filter((m) => m.status === "ignored").length;

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <Card className="border-violet-100 bg-gradient-to-r from-violet-50/50 via-white to-slate-50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="text-violet-600" size={20} />
                Product Code Detection & Rebranding Mappings
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 mt-1">
                Original manufacturer product codes detected across titles, headers, tables, pinouts, and body text.
                Review and approve mappings before export. Unconfirmed or ignored codes are safely kept original without blank gaps.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={onAutoGenerate}
              >
                <Sparkles size={14} className="mr-1 text-violet-500" />
                Regenerate VS- Mappings
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={onConfirmAll}
                disabled={pendingCount === 0}
              >
                <CheckCircle2 size={14} className="mr-1 text-emerald-600" />
                Confirm All ({pendingCount})
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                onClick={() => void onApplyAndSave()}
                disabled={isSaving}
              >
                <Save size={14} className="mr-1" />
                {isSaving ? "Saving..." : "Save Mappings"}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Replacement Report KPI Cards */}
        {report && (
          <CardContent className="pt-0">
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <div className="rounded border border-blue-100 bg-blue-50/50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Attempted</span>
                <p className="mt-1 text-2xl font-bold text-blue-900">{report.attempted}</p>
                <p className="text-[10px] text-blue-600">Product code tokens found</p>
              </div>
              <div className="rounded border border-emerald-100 bg-emerald-50/50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Successful</span>
                <p className="mt-1 text-2xl font-bold text-emerald-900">{report.successful}</p>
                <p className="text-[10px] text-emerald-600">Safely rebranded</p>
              </div>
              <div className="rounded border border-amber-100 bg-amber-50/50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Kept Original</span>
                <p className="mt-1 text-2xl font-bold text-amber-900">{report.keptOriginal}</p>
                <p className="text-[10px] text-amber-600">Protected / unconfirmed</p>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">Failed / Warnings</span>
                <p className={`mt-1 text-2xl font-bold ${report.failed > 0 ? "text-red-700" : "text-slate-800"}`}>
                  {report.failed} <span className="text-xs font-normal text-slate-500">({report.warnings.length} warn)</span>
                </p>
                <p className="text-[10px] text-slate-600">Manual review items</p>
              </div>
            </div>

            {report.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                  <AlertTriangle size={14} className="text-amber-600" />
                  Replacement Report Warnings & Manual Review Notes:
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
                  {report.warnings.slice(0, 5).map((w, idx) => (
                    <li key={`rep-w-${idx}`}>{w}</li>
                  ))}
                  {report.warnings.length > 5 && (
                    <li className="font-medium text-amber-700">+ {report.warnings.length - 5} additional warnings</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product codes..."
              className="h-8 pl-8 text-xs w-64"
            />
          </div>
          <div className="flex gap-1 text-xs">
            <Button
              type="button"
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterStatus("all")}
            >
              All ({mappings.length})
            </Button>
            <Button
              type="button"
              variant={filterStatus === "confirmed" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterStatus("confirmed")}
            >
              Confirmed ({confirmedCount})
            </Button>
            <Button
              type="button"
              variant={filterStatus === "pending" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterStatus("pending")}
            >
              Pending ({pendingCount})
            </Button>
            <Button
              type="button"
              variant={filterStatus === "ignored" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setFilterStatus("ignored")}
            >
              Ignored ({ignoredCount})
            </Button>
          </div>
        </div>

        <span className="text-xs text-slate-500">
          Showing {filteredMappings.length} of {mappings.length} detected codes
        </span>
      </div>

      {/* Mappings Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        {filteredMappings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No product code mappings match your search or filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Original Supplier Code</th>
                  <th className="py-2.5 px-3 w-8 text-center"></th>
                  <th className="py-2.5 px-3">Vellore Semicon Rebrand Code</th>
                  <th className="py-2.5 px-3">Detection Context</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
                {filteredMappings.map((mapping) => {
                  const isConfirmed = mapping.status === "confirmed";
                  const isIgnored = mapping.status === "ignored";

                  return (
                    <tr
                      key={mapping.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isIgnored ? "bg-slate-50/40 text-slate-400" : ""
                      }`}
                    >
                      {/* Supplier Code */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {mapping.supplierCode}
                      </td>

                      {/* Arrow */}
                      <td className="py-2.5 px-1 text-center text-slate-400">
                        <ArrowRight size={13} />
                      </td>

                      {/* Editable Vellore Code */}
                      <td className="py-2.5 px-3">
                        <Input
                          value={mapping.velloreCode}
                          onChange={(e) =>
                            onUpdateMapping(mapping.id, { velloreCode: e.target.value })
                          }
                          disabled={isIgnored}
                          className="h-7 text-xs font-mono font-semibold text-emerald-800 bg-white border-slate-200 focus:border-violet-500 max-w-xs"
                        />
                      </td>

                      {/* Location & Context */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">
                        <span className="font-medium text-slate-700">p.{mapping.pageNumber}</span>
                        <span className="text-slate-400 mx-1">•</span>
                        <span className="capitalize text-slate-500">{mapping.section}</span>
                      </td>

                      {/* Confidence */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            mapping.confidence >= 0.85
                              ? "bg-emerald-100 text-emerald-800"
                              : mapping.confidence >= 0.65
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {(mapping.confidence * 100).toFixed(0)}%
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                            <Check size={12} /> Confirmed
                          </span>
                        ) : isIgnored ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                            <XCircle size={12} /> Ignored (Kept Original)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            <AlertTriangle size={12} /> Pending Review
                          </span>
                        )}
                      </td>

                      {/* Action Toggle */}
                      <td className="py-2.5 px-3 text-right">
                        {isConfirmed ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-slate-500 hover:text-red-700"
                            onClick={() => onUpdateMapping(mapping.id, { status: "ignored" })}
                          >
                            Ignore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => onUpdateMapping(mapping.id, { status: "confirmed" })}
                          >
                            Confirm
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

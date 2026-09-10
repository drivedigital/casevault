"use client";

import Link from "next/link";
import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  SOURCE_TYPES,
  SOURCE_STATUSES,
  EVIDENCE_REVIEW_STATUSES,
  OCR_STATUSES,
  type Source,
} from "@/lib/types";
import { Badge } from "@/components/badge";
import { SourceReviewBadge, SourceStatusBadge } from "@/components/source-badge";
import { Field, inputClass, buttonClass, secondaryButtonClass } from "@/components/field";

export default function EvidenceIndex() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [matterId, setMatterId] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [excludedOnly, setExcludedOnly] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  // Shipped GET /sources supports q, matter_id, source_type and
  // evidence_review_status only (as-shipped delta). The remaining filters are
  // applied client-side over the full list until filter parity lands (BACKLOG).
  const sources = useQuery({
    queryKey: ["sources", q, matterId, sourceType, sourceStatus, reviewStatus, ocrStatus, includedOnly, excludedOnly],
    queryFn: () =>
      api.listSources({
        q: q || undefined,
        matter_id: matterId || undefined,
        source_type: sourceType || undefined,
        evidence_review_status: reviewStatus || undefined,
      }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadSource(file, { title: file.name.replace(/\.[^.]+$/, "") }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const update = useMutation({
    mutationFn: (p: { id: string; payload: Partial<Source> }) => api.updateSource(p.id, p.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > 100 * 1024 * 1024) {
        alert("File too large (max 100 MB).");
        return;
      }
      upload.mutate(file);
    },
    [upload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const fetched = sources.data ?? [];
  const items = fetched.filter(
    (s) =>
      (!sourceStatus || s.source_status === sourceStatus) &&
      (!ocrStatus || s.ocr_status === ocrStatus) &&
      (!includedOnly || s.included_flag) &&
      (!excludedOnly || s.excluded_flag),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Evidence</h1>
        <span className="text-xs text-slate-400">{items.length} results</span>
      </div>

      {/* Filters */}
      <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search title / filename">
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keyword"
          />
        </Field>
        <Field label="Matter">
          <select className={inputClass} value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            <option value="">All matters</option>
            {(matters.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source type">
          <select className={inputClass} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="">All</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source status">
          <select className={inputClass} value={sourceStatus} onChange={(e) => setSourceStatus(e.target.value)}>
            <option value="">All</option>
            {SOURCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Review status">
          <select className={inputClass} value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
            <option value="">All</option>
            {EVIDENCE_REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="OCR status">
          <select className={inputClass} value={ocrStatus} onChange={(e) => setOcrStatus(e.target.value)}>
            <option value="">All</option>
            {OCR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Included / Excluded">
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={includedOnly} onChange={() => { setIncludedOnly((v) => !v); setExcludedOnly(false); }} /> Included
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={excludedOnly} onChange={() => { setExcludedOnly((v) => !v); setIncludedOnly(false); }} /> Excluded
            </label>
          </div>
        </Field>
      </div>

      {/* Upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mb-6 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}
      >
        <input ref={inputRef} type="file" className="hidden" onChange={onInput} />
        <p className="text-sm font-medium text-slate-700">Drag & drop a file here, or click to upload</p>
        <p className="text-xs text-slate-400">PDF, image, text, email, spreadsheet — max 100 MB (server limit)</p>
        {upload.isPending && <p className="mt-2 text-sm text-blue-600">Uploading…</p>}
        {upload.isError && <p className="mt-2 text-sm text-red-600">Upload failed.</p>}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Title / File</th>
              <th className="px-4 py-2 font-medium">Matters</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Review</th>
              <th className="px-4 py-2 font-medium">Pages</th>
              <th className="px-4 py-2 font-medium">OCR</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.isLoading ? (
              <tr><td colSpan={9} className="px-4 py-6 text-sm text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-6 text-sm text-slate-500">No evidence matches.</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/evidence/${s.id}`} className="font-medium text-blue-700 hover:underline block">
                      {s.title || s.original_filename || "Untitled"}
                    </Link>
                    <span className="text-xs text-slate-400">{s.original_filename}</span>
                    {s.duplicate_of && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        Duplicate of {s.duplicate_of.title}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <MattersBadge sourceId={s.id} />
                  </td>
                  <td className="px-4 py-2"><Badge label={s.source_type} color="blue" /></td>
                  <td className="px-4 py-2"><SourceStatusBadge status={s.source_status} /></td>
                  <td className="px-4 py-2"><SourceReviewBadge status={s.evidence_review_status} /></td>
                  <td className="px-4 py-2 text-xs text-slate-600">{s.page_count ?? "—"}</td>
                  <td className="px-4 py-2"><Badge label={s.ocr_status} color={s.ocr_status === "complete" ? "green" : s.ocr_status === "skipped" ? "slate" : "amber"} /></td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => update.mutate({ id: s.id, payload: { included_flag: true, excluded_flag: false } })}
                        disabled={s.included_flag}
                        className={`${secondaryButtonClass} text-xs px-2 py-0.5`}
                      >
                        Include
                      </button>
                      <button
                        onClick={() => update.mutate({ id: s.id, payload: { excluded_flag: true, included_flag: false } })}
                        disabled={s.excluded_flag}
                        className={`${secondaryButtonClass} text-xs px-2 py-0.5`}
                      >
                        Exclude
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MattersBadge({ sourceId }: { sourceId: string }) {
  const links = useQuery({
    queryKey: ["source-matters", sourceId],
    queryFn: () => api.listSourceMatters(sourceId),
    enabled: !!sourceId,
  });
  if (links.isLoading) return <span className="text-xs text-slate-400">…</span>;
  const arr = links.data ?? [];
  if (arr.length === 0) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {arr.slice(0, 3).map((l) => (
        <Link key={l.id} href={`/matters/${l.matter_id}`} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:underline">
          {l.matter_name}
        </Link>
      ))}
      {arr.length > 3 && <span className="text-xs text-slate-400">+{arr.length - 3}</span>}
    </div>
  );
}

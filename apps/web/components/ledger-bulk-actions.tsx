"use client";

import { useState } from "react";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/field";
import { SOURCE_STATUSES, STRENGTH_LABELS, type LedgerEntryInput, type SourceStatus, type StrengthLabel } from "@/lib/types";

type BulkMode = "tags" | "source_status" | "confidence_level";

export function LedgerBulkActions({
  selectedCount,
  busy,
  onApply,
  onClear,
}: {
  selectedCount: number;
  busy: boolean;
  onApply: (patch: Pick<LedgerEntryInput, "tags" | "source_status" | "confidence_level">) => void;
  onClear: () => void;
}) {
  const [mode, setMode] = useState<BulkMode>("tags");
  const [tags, setTags] = useState("");
  const [sourceStatus, setSourceStatus] = useState<"" | SourceStatus>("");
  const [confidence, setConfidence] = useState<"" | StrengthLabel>("");

  if (!selectedCount) return null;

  const apply = () => {
    if (mode === "tags") {
      onApply({ tags: Array.from(new Set(tags.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean))) });
    } else if (mode === "source_status") {
      onApply({ source_status: sourceStatus || null });
    } else {
      onApply({ confidence_level: confidence || null });
    }
  };

  return (
    <section className="sticky bottom-4 z-20 mt-3 rounded-lg border border-slate-300 bg-white p-3 shadow-lg" aria-label="Bulk actions">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-slate-900">{selectedCount} selected</span>
        <select className="rounded border border-slate-300 bg-white px-2 py-2 text-sm" value={mode} onChange={(event) => setMode(event.target.value as BulkMode)}>
          <option value="tags">Replace tags</option>
          <option value="source_status">Set source status</option>
          <option value="confidence_level">Set confidence</option>
        </select>
        {mode === "tags" ? (
          <input className="min-w-48 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Comma-separated tags" />
        ) : null}
        {mode === "source_status" ? (
          <select className={inputClass} value={sourceStatus} onChange={(event) => setSourceStatus(event.target.value as "" | SourceStatus)}>
            <option value="">Clear source status</option>
            {SOURCE_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
        ) : null}
        {mode === "confidence_level" ? (
          <select className={inputClass} value={confidence} onChange={(event) => setConfidence(event.target.value as "" | StrengthLabel)}>
            <option value="">Clear confidence</option>
            {STRENGTH_LABELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        ) : null}
        <button type="button" className={buttonClass} disabled={busy} onClick={apply}>{busy ? "Applying…" : "Apply"}</button>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClear}>Clear selection</button>
      </div>
      {mode === "tags" ? <p className="mt-2 text-xs text-slate-500">This replaces the selected rows’ tags. Separate tags with commas or semicolons.</p> : null}
    </section>
  );
}

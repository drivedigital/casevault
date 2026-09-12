"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { type Source } from "@/lib/types";
import { Badge } from "@/components/badge";
import { SourceReviewBadge, SourceStatusBadge } from "@/components/source-badge";
import {
  EMPTY_FILTERS,
  EvidenceFilters,
  hasActiveFilters,
  type EvidenceFilterValues,
} from "@/components/evidence-list-filters";
import { EvidenceUpload } from "@/components/evidence-list-upload";
import { EvidenceMatterBadge, EvidenceRowActions } from "@/components/evidence-list-row";
import { ListStateRow, describeError } from "@/components/evidence-list-states";

// -----------------------------------------------------------------------------
// Evidence list page — EU-L. Contract: docs/contracts/evidence_ui_closure.md
// v1.0 §EU-L. Row actions, upload and filters live in components/evidence-list-*.
//
// Loading, empty, filtered-empty and request-failure are four distinct states
// (§EU-L 1). A failed list request shows an actionable retry and, when earlier
// results are still cached, keeps them visible but explicitly labelled as
// saved-and-possibly-out-of-date — never as an empty list. The sources client
// stays a bare array with the shipped server filters; source_status / ocr /
// include-exclude remain client-side (§EU-L 4).
// -----------------------------------------------------------------------------

const COLUMN_COUNT = 9;

export default function EvidenceIndex() {
  const [q, setQ] = useState("");
  const [matterId, setMatterId] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [excludedOnly, setExcludedOnly] = useState(false);

  const filters: EvidenceFilterValues = {
    q,
    matterId,
    sourceType,
    sourceStatus,
    reviewStatus,
    ocrStatus,
    includedOnly,
    excludedOnly,
  };

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
    // Fail visibly and immediately; the UI owns the retry affordance.
    retry: false,
  });

  const setFilters = (next: EvidenceFilterValues) => {
    setQ(next.q);
    setMatterId(next.matterId);
    setSourceType(next.sourceType);
    setSourceStatus(next.sourceStatus);
    setReviewStatus(next.reviewStatus);
    setOcrStatus(next.ocrStatus);
    setIncludedOnly(next.includedOnly);
    setExcludedOnly(next.excludedOnly);
  };

  const fetched = sources.data ?? [];
  const items = fetched.filter(
    (s) =>
      (!sourceStatus || s.source_status === sourceStatus) &&
      (!ocrStatus || s.ocr_status === ocrStatus) &&
      (!includedOnly || s.included_flag) &&
      (!excludedOnly || s.excluded_flag),
  );

  const filtersActive = hasActiveFilters(filters);
  const showStaleData = sources.isError && fetched.length > 0;
  const staleAsOf = sources.errorUpdatedAt
    ? new Date(sources.errorUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Evidence</h1>
        <span className="text-xs text-slate-400">
          {sources.isError && !showStaleData
            ? "Unavailable"
            : `${items.length} results${showStaleData ? " (saved)" : ""}`}
        </span>
      </div>

      <EvidenceFilters value={filters} onChange={setFilters} />
      <EvidenceUpload />

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
            {sources.isPending ? (
              <ListStateRow kind="loading" colSpan={COLUMN_COUNT} />
            ) : sources.isError ? (
              <>
                <ListStateRow
                  kind="error"
                  colSpan={COLUMN_COUNT}
                  detail={describeError(sources.error)}
                  onRetry={() => sources.refetch()}
                  staleNote={
                    showStaleData
                      ? `Showing ${items.length} saved result${items.length === 1 ? "" : "s"}${
                          staleAsOf ? ` from ${staleAsOf}` : ""
                        }; they may be out of date.`
                      : undefined
                  }
                />
                {showStaleData &&
                  items.map((s) => <EvidenceRow key={s.id} source={s} stale />)}
              </>
            ) : items.length === 0 ? (
              filtersActive ? (
                <ListStateRow
                  kind="filtered-empty"
                  colSpan={COLUMN_COUNT}
                  onClearFilters={() => setFilters({ ...EMPTY_FILTERS })}
                />
              ) : (
                <ListStateRow kind="empty" colSpan={COLUMN_COUNT} />
              )
            ) : (
              items.map((s) => <EvidenceRow key={s.id} source={s} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One table row. `stale` dims the row and labels it as saved data that may
 *  be out of date (rendered only while the refresh attempt is failing). */
function EvidenceRow({ source: s, stale = false }: { source: Source; stale?: boolean }) {
  const name = s.title || s.original_filename || "Untitled";
  return (
    <tr
      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
        stale ? "opacity-60" : ""
      }`}
    >
      <td className="px-4 py-2">
        <Link href={`/evidence/${s.id}`} className="font-medium text-blue-700 hover:underline block">
          {name}
        </Link>
        <span className="text-xs text-slate-400">{s.original_filename}</span>
        {stale && (
          <div
            data-testid="stale-chip"
            className="mt-1 inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700"
          >
            Saved result — may be out of date
          </div>
        )}
        {s.duplicate_of && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
            Duplicate of {s.duplicate_of.title}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <EvidenceMatterBadge sourceId={s.id} source={s} />
      </td>
      <td className="px-4 py-2"><Badge label={s.source_type} color="blue" /></td>
      <td className="px-4 py-2"><SourceStatusBadge status={s.source_status} /></td>
      <td className="px-4 py-2"><SourceReviewBadge status={s.evidence_review_status} /></td>
      <td className="px-4 py-2 text-xs text-slate-600">{s.page_count ?? "—"}</td>
      <td className="px-4 py-2"><Badge label={s.ocr_status} color={s.ocr_status === "complete" ? "green" : s.ocr_status === "skipped" ? "slate" : "amber"} /></td>
      <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.updated_at).toLocaleString()}</td>
      <td className="px-4 py-2">
        <EvidenceRowActions source={s} />
      </td>
    </tr>
  );
}

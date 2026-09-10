"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  EVIDENCE_REVIEW_STATUSES,
  OCR_STATUSES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
} from "@/lib/types";
import { Field, inputClass, secondaryButtonClass } from "@/components/field";
import { Notice, RetryButton, describeError } from "./evidence-list-states";

// -----------------------------------------------------------------------------
// EU-L evidence filters (list page). Contract §EU-L (3)–(4).
//
// - The server-supported filters (q, matter_id, source_type,
//   evidence_review_status) and the client-side filters (source_status,
//   ocr_status, included/excluded) keep full parity with the shipped list.
// - A matter-filter load failure is announced and retryable — the select must
//   never silently look like an ordinary empty “All matters” list.
// - Filter values live in the page and are preserved through failures/retries.
// - Included/Excluded are exclusive: turning one on explicitly clears the
//   opposite flag.
// -----------------------------------------------------------------------------

export interface EvidenceFilterValues {
  q: string;
  matterId: string;
  sourceType: string;
  sourceStatus: string;
  reviewStatus: string;
  ocrStatus: string;
  includedOnly: boolean;
  excludedOnly: boolean;
}

export const EMPTY_FILTERS: EvidenceFilterValues = {
  q: "",
  matterId: "",
  sourceType: "",
  sourceStatus: "",
  reviewStatus: "",
  ocrStatus: "",
  includedOnly: false,
  excludedOnly: false,
};

export function hasActiveFilters(f: EvidenceFilterValues): boolean {
  return Boolean(
    f.q ||
      f.matterId ||
      f.sourceType ||
      f.sourceStatus ||
      f.reviewStatus ||
      f.ocrStatus ||
      f.includedOnly ||
      f.excludedOnly,
  );
}

export function EvidenceFilters({
  value,
  onChange,
}: {
  value: EvidenceFilterValues;
  onChange: (next: EvidenceFilterValues) => void;
}) {
  const matters = useQuery({
    queryKey: ["matters"],
    queryFn: () => api.listMatters(),
    // Surface filter failures immediately; the retry button refetches.
    retry: false,
  });
  const set = (patch: Partial<EvidenceFilterValues>) => onChange({ ...value, ...patch });

  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Search title / filename">
        <input
          className={inputClass}
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Keyword"
          aria-label="Search title / filename"
        />
      </Field>

      <Field label="Matter">
        {matters.isError ? (
          <div data-testid="matter-filter-error">
            <Notice
              tone="error"
              action={
                <RetryButton
                  label="Retry loading the matter filter options"
                  onRetry={() => matters.refetch()}
                  pending={matters.isFetching}
                  small
                />
              }
            >
              <span className="font-medium">Couldn’t load the matter list.</span>{" "}
              <span className="block sm:inline">
                Filtering by matter is unavailable right now
                {describeError(matters.error) ? ` — ${describeError(matters.error)}` : ""}. Other
                filters still work.
              </span>
            </Notice>
          </div>
        ) : (
          <select
            className={inputClass}
            value={value.matterId}
            onChange={(e) => set({ matterId: e.target.value })}
            aria-label="Filter by matter"
          >
            <option value="">All matters</option>
            {(matters.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Source type">
        <select
          className={inputClass}
          value={value.sourceType}
          onChange={(e) => set({ sourceType: e.target.value })}
          aria-label="Filter by source type"
        >
          <option value="">All</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Source status">
        <select
          className={inputClass}
          value={value.sourceStatus}
          onChange={(e) => set({ sourceStatus: e.target.value })}
          aria-label="Filter by source status"
        >
          <option value="">All</option>
          {SOURCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Review status">
        <select
          className={inputClass}
          value={value.reviewStatus}
          onChange={(e) => set({ reviewStatus: e.target.value })}
          aria-label="Filter by review status"
        >
          <option value="">All</option>
          {EVIDENCE_REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="OCR status">
        <select
          className={inputClass}
          value={value.ocrStatus}
          onChange={(e) => set({ ocrStatus: e.target.value })}
          aria-label="Filter by OCR status"
        >
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
            <input
              type="checkbox"
              checked={value.includedOnly}
              onChange={(e) =>
                // Exclusive pair: enabling one explicitly clears the other.
                set({
                  includedOnly: e.target.checked,
                  excludedOnly: e.target.checked ? false : value.excludedOnly,
                })
              }
              aria-label="Show included only"
            />
            Included
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={value.excludedOnly}
              onChange={(e) =>
                set({
                  excludedOnly: e.target.checked,
                  includedOnly: e.target.checked ? false : value.includedOnly,
                })
              }
              aria-label="Show excluded only"
            />
            Excluded
          </label>
        </div>
      </Field>

      {hasActiveFilters(value) && (
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className={`${secondaryButtonClass} text-xs`}
            aria-label="Clear all evidence filters"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

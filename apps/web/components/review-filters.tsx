"use client";

/**
 * WS-I (/ai-review) — Inbox filter pane (contract §5.2: "filters (type, matter,
 * review state, source, min confidence)").
 */
import { Field, inputClass, secondaryButtonClass } from "@/components/field";
import { Chip } from "@/components/review-labels";
import { PROPOSAL_TYPES, REVIEW_STATES, type ProposalType, type ReviewState } from "@/lib/types";
import type { Matter, Source } from "@/lib/types";

export interface InboxFilterState {
  proposalType: ProposalType | "";
  matterId: string;
  reviewState: ReviewState | "";
  sourceId: string;
  /** kept as a string so the input can be emptied; converted before the call */
  minConfidence: string;
}

export const EMPTY_INBOX_FILTERS: InboxFilterState = {
  proposalType: "",
  matterId: "",
  reviewState: "",
  sourceId: "",
  minConfidence: "",
};

/** Filters actually sent to GET /proposals (contract §4.2). */
export function proposalQueryFrom(filters: InboxFilterState) {
  const min = filters.minConfidence.trim();
  return {
    ...(filters.proposalType ? { proposal_type: filters.proposalType } : {}),
    ...(filters.matterId ? { matter_id: filters.matterId } : {}),
    ...(filters.reviewState ? { review_state: filters.reviewState } : {}),
    ...(filters.sourceId ? { source_id: filters.sourceId } : {}),
    ...(min && Number.isFinite(Number(min)) ? { min_confidence: Number(min) } : {}),
  };
}

export function InboxFilters({
  value,
  onChange,
  matters,
  sources,
}: {
  value: InboxFilterState;
  onChange: (next: InboxFilterState) => void;
  matters: Matter[];
  sources: Source[];
}) {
  const set = <K extends keyof InboxFilterState>(key: K, next: InboxFilterState[K]) =>
    onChange({ ...value, [key]: next });

  const active: string[] = [];
  if (value.proposalType) active.push(`type: ${value.proposalType}`);
  if (value.matterId) {
    active.push(`matter: ${matters.find((m) => m.id === value.matterId)?.name ?? value.matterId}`);
  }
  if (value.reviewState) active.push(`state: ${value.reviewState}`);
  if (value.sourceId) {
    active.push(`source: ${sources.find((s) => s.id === value.sourceId)?.title ?? value.sourceId}`);
  }
  if (value.minConfidence.trim()) active.push(`confidence ≥ ${value.minConfidence.trim()}`);

  return (
    <aside className="space-y-4 self-start rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-900">Filters</h2>
        {active.length > 0 ? (
          <button
            type="button"
            className="text-xs text-blue-700 hover:underline"
            onClick={() => onChange(EMPTY_INBOX_FILTERS)}
          >
            Clear
          </button>
        ) : null}
      </div>

      <Field label="Proposal type">
        <select
          className={inputClass}
          value={value.proposalType}
          onChange={(e) => set("proposalType", e.target.value as ProposalType | "")}
        >
          <option value="">All types</option>
          {PROPOSAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Matter">
        <select
          className={inputClass}
          value={value.matterId}
          onChange={(e) => set("matterId", e.target.value)}
        >
          <option value="">All matters</option>
          {matters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Review state">
        <select
          className={inputClass}
          value={value.reviewState}
          onChange={(e) => set("reviewState", e.target.value as ReviewState | "")}
        >
          <option value="">All review states</option>
          {REVIEW_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Source">
        <select
          className={inputClass}
          value={value.sourceId}
          onChange={(e) => set("sourceId", e.target.value)}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Min confidence" hint="0–1, e.g. 0.6">
        <input
          className={inputClass}
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={value.minConfidence}
          onChange={(e) => set("minConfidence", e.target.value)}
          placeholder="any"
        />
      </Field>

      {active.length > 0 ? (
        <div className="space-y-1 border-t border-slate-100 pt-3">
          <div className="text-xs font-medium text-slate-500">Active</div>
          <div className="flex flex-wrap gap-1">
            {active.map((item) => (
              <Chip key={item} value={item} />
            ))}
          </div>
          <button
            type="button"
            className={`${secondaryButtonClass} mt-2 w-full`}
            onClick={() => onChange(EMPTY_INBOX_FILTERS)}
          >
            Reset filters
          </button>
        </div>
      ) : null}
    </aside>
  );
}

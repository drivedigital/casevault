/**
 * WS-I (/ai-review) — shared labels, badges and small formatters.
 * Contract: docs/contracts/wave2_intake_core.md v1.0 §5.2.
 *
 * Review-state floor (contract §4.1). Only `accepted` is trusted; the trusted
 * set chronology and claims read is `GET /facts?review_state=accepted`. Every
 * other state — including `proposed` and `accepted_with_edits` — is marked as
 * NOT trusted here, so the UI can never imply a fact is approved before it is.
 */
import { Badge } from "@/components/badge";
import { ApiError } from "@/lib/api";
import type {
  FactType,
  ProposalType,
  ProposedStructuredJson,
  ReviewState,
  StrengthLabel,
  SupportType,
} from "@/lib/types";

export type BadgeTone = "green" | "blue" | "amber" | "red" | "slate" | "violet";

export interface ReviewStateCopy {
  label: string;
  color: BadgeTone;
  /** true only for `accepted` — the explicit-approval state (§4.1). */
  trusted: boolean;
  hint: string;
}

export const REVIEW_STATE_COPY: Record<ReviewState, ReviewStateCopy> = {
  proposed: {
    label: "Proposed",
    color: "amber",
    trusted: false,
    hint: "Not yet trusted. A proposal is only a suggestion until someone reviews and approves the fact it creates.",
  },
  accepted: {
    label: "Accepted",
    color: "green",
    trusted: true,
    hint: "Trusted: approved through POST /facts/{id}/approve. This is the set chronology and claims read.",
  },
  accepted_with_edits: {
    label: "Accepted with edits",
    color: "violet",
    trusted: false,
    hint: "Reviewed with edits, but not the approved set. Only POST /facts/{id}/approve produces `accepted`.",
  },
  rejected: {
    label: "Rejected",
    color: "red",
    trusted: false,
    hint: "Rejected in review. Not part of the trusted set.",
  },
  deferred: {
    label: "Deferred",
    color: "slate",
    trusted: false,
    hint: "Waiting for more information. Not part of the trusted set.",
  },
  uncertain: {
    label: "Uncertain",
    color: "blue",
    trusted: false,
    hint: "Flagged uncertain in review. Not part of the trusted set.",
  },
  disputed: {
    label: "Disputed",
    color: "red",
    trusted: false,
    hint: "Disputed. Not part of the trusted set.",
  },
  superseded: {
    label: "Superseded",
    color: "slate",
    trusted: false,
    hint: "Replaced by a newer fact. Kept for provenance; not part of the trusted set.",
  },
};

/** The review-state floor in one predicate: only `accepted` is trusted. */
export function isTrustedReviewState(state: ReviewState): boolean {
  return state === "accepted";
}

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  fact: "Fact",
  event: "Event",
  actor: "Actor / entity",
  duplicate_merge: "Duplicate / merge",
  date_normalization: "Date normalization",
  claim_mapping: "Claim mapping",
  contradiction: "Contradiction",
  verification_task: "Verification task",
  restriction: "Restriction",
};

export const FACT_TYPE_LABELS: Record<FactType, string> = {
  source_derived: "Source-derived",
  user_entered: "User-entered",
  testimony: "Testimony",
  procedural: "Procedural",
  damage: "Damage",
  other: "Other",
};

export const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  supports: "Supports",
  contradicts: "Contradicts",
  mentions: "Mentions",
  background: "Background",
};

export const STRENGTH_LABELS_COPY: Record<StrengthLabel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function proposalTypeLabel(type: ProposalType): string {
  return PROPOSAL_TYPE_LABELS[type] ?? type;
}

export function reviewStateLabel(state: ReviewState): string {
  return REVIEW_STATE_COPY[state]?.label ?? state;
}

export function ReviewStateBadge({ state }: { state: ReviewState }) {
  const copy = REVIEW_STATE_COPY[state];
  return (
    <span title={copy?.hint ?? undefined}>
      <Badge label={copy?.label ?? state} color={copy?.color ?? "slate"} />
    </span>
  );
}

/** The "is this trusted?" line that sits next to a review-state badge. */
export function TrustNote({ state, className = "" }: { state: ReviewState; className?: string }) {
  const trusted = isTrustedReviewState(state);
  return (
    <span
      className={`text-xs ${trusted ? "text-green-700" : "text-amber-700"} ${className}`.trim()}
    >
      {trusted ? "Trusted — explicitly approved" : "Not yet trusted"}
    </span>
  );
}

export function ProposalTypeBadge({
  type,
  system,
}: {
  type: ProposalType;
  system?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge label={proposalTypeLabel(type)} color={type === "fact" ? "blue" : "slate"} />
      {system === undefined ? null : (
        <span className="text-xs text-slate-400">{system ? "system" : "manual"}</span>
      )}
    </span>
  );
}

/** NUMERIC(5,4) — may arrive as a number or (defensively) a string. */
export function formatConfidence(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

export function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : typeof item === "number" ? String(item) : ""))
      .filter((item) => item.length > 0);
  }
  return typeof value === "string" && value.trim() ? [value] : [];
}

/** Actors identified by the generator, when `proposed_structured_json` has them. */
export function structuredActors(json: ProposedStructuredJson | null | undefined): string[] {
  if (!json || typeof json !== "object") return [];
  return [
    ...stringList(json.actors),
    ...stringList(json.actor_names),
    ...stringList(json.actor_ids),
  ];
}

/** Dates identified by the generator, when `proposed_structured_json` has them. */
export function structuredDates(json: ProposedStructuredJson | null | undefined): string[] {
  if (!json || typeof json !== "object") return [];
  return [
    ...stringList(json.dates),
    ...stringList(json.date_text),
    ...stringList(json.date_start),
    ...stringList(json.date_end),
  ];
}

/** Human-readable message for a failed API call (ApiError carries the detail). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

/** Small labelled chip used for linked actors/dates and active filters. */
export function Chip({
  label,
  value,
  title,
}: {
  label?: string;
  value: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
    >
      {label ? <span className="text-slate-400">{label}</span> : null}
      <span>{value}</span>
    </span>
  );
}

/** Toggle chip used by the multi-select review-state filters. */
export function ToggleChip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

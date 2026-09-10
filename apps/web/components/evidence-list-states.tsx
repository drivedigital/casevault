"use client";

import { secondaryButtonClass } from "@/components/field";

// -----------------------------------------------------------------------------
// EU-L shared list primitives — loading/empty/error states, alerts and retry.
// Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L (1)–(3).
//
// Failure states must never render like an empty list, and every failure gets
// an explicit, labelled retry. Error text comes from the API's curated
// `detail` string (ApiError.message); describeError() never renders anything
// else, so raw server traces can never reach the UI.
// -----------------------------------------------------------------------------

/** User-safe message for a thrown value (API `detail` or generic fallback). */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/** Small labelled retry control. `label` names WHAT is being retried so
 *  screen-reader users hear “Retry loading the evidence list”, not “Retry”. */
export function RetryButton({
  label,
  onRetry,
  pending = false,
  small = false,
}: {
  label: string;
  onRetry: () => void;
  pending?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={pending}
      aria-label={label}
      className={`${secondaryButtonClass} ${
        small ? "text-xs px-2 py-0.5" : "text-sm"
      } border-red-300 text-red-700 hover:bg-red-50 focus:border-red-500`}
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}

const TONES = {
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

/** Inline notice block. Pass tone="error" for failures (announced eagerly via
 *  role="alert"); tone="info" renders a neutral role="status" live region. */
export function Notice({
  tone,
  children,
  action,
  testId,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
}) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      data-testid={testId}
      className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${TONES[tone]}`}
    >
      <div className="min-w-0">{children}</div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export type ListStateKind =
  | "loading"
  | "empty"
  | "filtered-empty"
  | "error";

/** Full-width <tr> for the evidence table body states. The four states are
 *  deliberately distinct (contract §EU-L 1): a failed request never renders
 *  the “no evidence matches” empty state. */
export function ListStateRow({
  kind,
  colSpan,
  detail,
  onRetry,
  onClearFilters,
  staleNote,
}: {
  kind: ListStateKind;
  colSpan: number;
  detail?: string;
  onRetry?: () => void;
  onClearFilters?: () => void;
  staleNote?: string;
}) {
  return (
    <tr aria-busy={kind === "loading" || undefined}>
      <td colSpan={colSpan} className="px-4 py-6">
        {kind === "loading" && (
          <div role="status" className="text-sm text-slate-500">
            Loading evidence…
          </div>
        )}
        {kind === "empty" && (
          <div role="status" className="text-sm text-slate-500" data-testid="list-empty">
            No evidence yet. Upload a file above to add the first source.
          </div>
        )}
        {kind === "filtered-empty" && (
          <div className="flex flex-wrap items-center justify-between gap-2" data-testid="list-filtered-empty">
            <div role="status" className="text-sm text-slate-500">
              No evidence matches the current filters. The list itself loaded fine —
              try widening or clearing the filters.
            </div>
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className={`${secondaryButtonClass} text-xs px-2 py-0.5`}
                aria-label="Clear all evidence filters"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {kind === "error" && (
          <Notice
            tone="error"
            testId="list-error"
            action={
              onRetry && (
                <RetryButton
                  label="Retry loading the evidence list"
                  onRetry={onRetry}
                  pending={false}
                />
              )
            }
          >
            <span className="font-medium">Couldn’t load the evidence list.</span>{" "}
            {detail ? <span className="block sm:inline">Reason: {detail}.</span> : null}
            {staleNote ? (
              <span className="block text-red-700">{staleNote}</span>
            ) : (
              <span className="block">
                Nothing is being shown because the request failed — this is not an
                empty list.
              </span>
            )}
          </Notice>
        )}
      </td>
    </tr>
  );
}

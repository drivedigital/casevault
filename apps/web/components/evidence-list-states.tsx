"use client";

import { secondaryButtonClass } from "@/components/field";
import { ApiError } from "@/lib/api";
import { mapListError } from "@/lib/evidence-list-errors";

// -----------------------------------------------------------------------------
// EU-L shared list primitives — loading/empty/error states, alerts and retry.
// Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L (1)–(3), plus the
// 2026-09-11 integration amendment notes on honest uncertainty copy.
//
// Failure states must never render like an empty list, and every failure gets
// an explicit, labelled retry.
//
// ERROR-DISCLOSURE BOUNDARY (EU-ERR fix): an API error's `detail` is
// UNTRUSTED transport payload — a 500 (or anything between browser and
// server) can carry a traceback, SQL statement or internal path in it, which
// EU-V's L3.2–L3.4 injected-500 browser case observed rendered verbatim.
// describeError() therefore maps every thrown value through the deliberate
// allowlist boundary in lib/evidence-list-errors.ts: known curated validation
// outcomes keep actionable feedback; everything else gets a generic
// actionable message that never echoes response-body text. Callers keep
// attribution (file/row/operation), retry and the outcomeKnown() uncertainty
// logic, which is unchanged.
// -----------------------------------------------------------------------------

/** HTTP status if the error came from a real server response, else null.
 *  Read-only use of the shared ApiError class (no client changes). */
export function errorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** True when the server's answer PROVES the mutation outcome (a 4xx
 *  rejection). Network failures and 5xx leave the outcome unknown: the server
 *  may have committed the change before the connection/response failed, so
 *  the UI must not claim "not added"/"unchanged" (2026-09-11 review). */
export function outcomeKnown(error: unknown): boolean {
  const status = errorStatus(error);
  return status !== null && status < 500;
}

/** User-safe message for a thrown value. Untrusted error text (server
 *  `detail`, statusText, browser network errors, anything unexpected) is
 *  never echoed; see lib/evidence-list-errors.ts for the exact mapping. */
export function describeError(error: unknown): string {
  return mapListError(error).message;
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

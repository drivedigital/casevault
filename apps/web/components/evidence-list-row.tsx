"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Source } from "@/lib/types";
import { RetryButton, describeError, outcomeKnown } from "./evidence-list-states";

// -----------------------------------------------------------------------------
// EU-L per-row controls: include/exclude actions and the linked-matters badge.
// Contract §EU-L (2)–(5) + 2026-09-11 integration review.
//
// - Include/Exclude send BOTH flags: include explicitly clears excluded_flag
//   and vice versa (exclusive transition; §EU-L 2).
// - Each row owns its mutation: while it is pending both of that row's buttons
//   are disabled, so a slow request cannot be submitted twice (§EU-L 2).
// - A failed row mutation renders an attributable inline alert (which row,
//   which operation, why) plus actions — never rendered as success (§EU-L 2).
//   A 4xx rejection PROVES the row is unchanged; a network failure or 5xx
//   does not (the server may have committed before the response was lost), so
//   the copy reports honest uncertainty and offers "Refresh list first"
//   before retry (2026-09-11 review finding 3).
// - The matter badge distinguishes loading, confirmed-empty and FAILED: a
//   failed links query shows an actionable alert, never a dash that reads as
//   “no linked matters” (§EU-L 3).
// - Success refreshes only the source-list queries (§EU-L 5).
// -----------------------------------------------------------------------------

function rowName(source: Source): string {
  return source.title || source.original_filename || "Untitled source";
}

export function EvidenceRowActions({ source }: { source: Source }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (payload: { include: boolean }) =>
      api.updateSource(source.id, {
        // Both flags are always sent so the transition is exclusive even if
        // the row state changed since render.
        included_flag: payload.include,
        excluded_flag: !payload.include,
      }),
    onSuccess: () => {
      // Refresh the affected source-list queries only (§EU-L 5). The row
      // matter-badge and matter-filter caches are unaffected by flag changes.
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const pending = update.isPending;
  const failed = update.isError;
  const name = rowName(source);
  // Which operation was last attempted (in flight or failed). react-query
  // keeps `variables` after a failure, which is also what retry resubmits.
  const lastOperation: "include" | "exclude" | null =
    update.variables == null ? null : update.variables.include ? "include" : "exclude";
  // A 4xx answer proves the row is unchanged; response loss / 5xx does not.
  const outcomeKnownFlag = failed ? outcomeKnown(update.error) : true;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1" aria-busy={pending || undefined}>
        <button
          type="button"
          onClick={() => update.mutate({ include: true })}
          disabled={pending || source.included_flag}
          data-testid={`include-${source.id}`}
          className={`rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${
            source.included_flag ? "border-green-300 bg-green-50 text-green-800" : ""
          }`}
        >
          {pending && lastOperation === "include" ? "Including…" : source.included_flag ? "Included" : "Include"}
        </button>
        <button
          type="button"
          onClick={() => update.mutate({ include: false })}
          disabled={pending || source.excluded_flag}
          data-testid={`exclude-${source.id}`}
          className={`rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${
            source.excluded_flag ? "border-red-300 bg-red-50 text-red-800" : ""
          }`}
        >
          {pending && lastOperation === "exclude" ? "Excluding…" : source.excluded_flag ? "Excluded" : "Exclude"}
        </button>
      </div>
      {failed && (
        <div
          role="alert"
          data-testid={`row-error-${source.id}`}
          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800"
        >
          <span className="font-medium">
            Couldn’t {lastOperation} “{name}”.
          </span>{" "}
          {outcomeKnownFlag ? (
            <span>
              {describeError(update.error)} The row is unchanged.{" "}
              <RetryButton
                small
                label={`Retry ${lastOperation} for ${name}`}
                onRetry={() => update.mutate({ include: lastOperation === "include" })}
                pending={pending}
              />
            </span>
          ) : (
            <span>
              {describeError(update.error)} The connection failed before the server’s answer
              arrived, so it is not known whether the change was saved — the server may have
              applied it. Refresh the list first to check this row’s current state before
              retrying.{" "}
              <button
                type="button"
                data-testid={`row-refresh-${source.id}`}
                onClick={() => qc.invalidateQueries({ queryKey: ["sources"] })}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Refresh list first
              </button>{" "}
              <RetryButton
                small
                label={`Retry ${lastOperation} for ${name}`}
                onRetry={() => update.mutate({ include: lastOperation === "include" })}
                pending={pending}
              />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Per-row linked-matters badge. Failure is distinct from empty. */
export function EvidenceMatterBadge({
  sourceId,
  source,
}: {
  sourceId: string;
  source: Source;
}) {
  const links = useQuery({
    queryKey: ["source-matters", sourceId],
    queryFn: () => api.listSourceMatters(sourceId),
    enabled: !!sourceId,
    // Row badges fail loudly (and cheaply) instead of after react-query's
    // default retry storm — the badge offers an explicit retry.
    retry: false,
  });

  if (links.isPending) {
    return (
      <span className="text-xs text-slate-400" role="status" aria-label={`Loading linked matters for ${rowName(source)}`}>
        …
      </span>
    );
  }

  if (links.isError) {
    return (
      <span className="flex flex-col items-start gap-1" data-testid={`badge-error-${sourceId}`}>
        <span role="alert" className="text-xs font-medium text-red-700">
          Couldn’t load linked matters
        </span>
        <span className="text-xs text-red-600">{describeError(links.error)}</span>
        <RetryButton
          small
          label={`Retry loading linked matters for ${rowName(source)}`}
          onRetry={() => links.refetch()}
          pending={links.isFetching}
        />
      </span>
    );
  }

  const arr = links.data ?? [];
  if (arr.length === 0) {
    // Confirmed empty — only reachable after a successful query.
    return (
      <span className="text-xs text-slate-400" aria-label={`No linked matters for ${rowName(source)}`}>
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {arr.slice(0, 3).map((l) => (
        <Link
          key={l.id}
          href={`/matters/${l.matter_id}`}
          className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:underline"
        >
          {l.matter_name}
        </Link>
      ))}
      {arr.length > 3 && <span className="text-xs text-slate-400">+{arr.length - 3}</span>}
    </div>
  );
}

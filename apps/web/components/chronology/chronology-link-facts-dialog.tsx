"use client";

import { useDialogFocus } from "./use-dialog-focus";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Badge } from "@/components/badge";
import { buttonClass, secondaryButtonClass } from "@/components/field";
import { RELATIONSHIP_LABELS } from "@/components/chronology/chronology-format";
import {
  EVENT_RELATIONSHIP_TYPES,
  api,
  type ChronologyEvent,
  type EventRelationshipType,
} from "@/lib/api";

/** “Link facts” modal — offers ONLY the matter's trusted facts
 * (review_state=accepted, WS-CHRONO brief invariant §1 / contract
 * wave2_intake_core.md §4.1). Facts already linked to this event are shown
 * disabled so the dialog doubles as the support overview. */
export function ChronologyLinkFactsDialog({
  open,
  event,
  busy,
  error,
  onClose,
  onLink,
}: {
  open: boolean;
  event: ChronologyEvent | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** Called with each newly selected fact id + the chosen relationship. */
  onLink: (factIds: string[], relationship: EventRelationshipType) => void;
}) {
  // Plain array (not Set): tsconfig target forbids Set spread iteration (TS2802).
  const [selected, setSelected] = useState<string[]>([]);
  const [relationship, setRelationship] = useState<EventRelationshipType>("supports_event");

  const matterId = event?.matter_id ?? "";
  const facts = useInfiniteQuery({
    queryKey: ["facts", "chronology-linker", matterId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.listFacts({ matter_id: matterId, review_state: ["accepted"], limit: 50, offset: pageParam }),
    getNextPageParam: (page) => page.offset + page.items.length < page.total
      ? page.offset + page.limit : undefined,
    enabled: open && Boolean(matterId),
  });

  const linkedFactIds = useMemo(
    () => new Set((event?.fact_links ?? [])
      .filter((link) => link.relationship_type === relationship).map((link) => link.fact_id)),
    [event, relationship],
  );

  useEffect(() => {
    if (open) {
      setSelected([]);
      setRelationship("supports_event");
    }
  }, [open, event?.id]);

  const dialogRef = useDialogFocus(open && Boolean(event), onClose, busy);

  if (!open || !event) return null;

  const toggle = (factId: string, checked: boolean) => {
    setSelected((current) =>
      checked ? [...current, factId] : current.filter((id) => id !== factId),
    );
  };

  const items = facts.data?.pages.flatMap((page) => page.items) ?? [];
  // Partial success can refresh the event while the dialog stays open. Never
  // resubmit links that have already succeeded.
  const pendingIds = selected.filter((id) => !linkedFactIds.has(id));

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Link accepted facts to ${event.title}`}
      onClick={(click) => {
        if (click.target === click.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Link facts</h2>
            <p className="text-xs text-slate-500">
              {event.title} · only accepted (trusted) facts can be linked to the chronology
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-700"
            onClick={() => !busy && onClose()}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <fieldset className="mb-4 flex flex-wrap items-center gap-3">
            <legend className="mb-1 text-xs font-medium text-slate-600">Relationship for new links</legend>
            {EVENT_RELATIONSHIP_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="radio"
                  name="event-fact-relationship"
                  disabled={busy}
                  value={type}
                  checked={relationship === type}
                  onChange={() => setRelationship(type)}
                />
                {RELATIONSHIP_LABELS[type]}
              </label>
            ))}
          </fieldset>

          {facts.isError ? (
            <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not load accepted facts for this matter.
            </p>
          ) : facts.isLoading ? (
            <p className="py-6 text-sm text-slate-500">Loading accepted facts…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-slate-600">
              This matter has no accepted facts yet. Approve facts in the AI Review inbox first —
              the chronology only consumes the trusted set.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {items.map((fact) => {
                const alreadyLinked = linkedFactIds.has(fact.id);
                return (
                  <li key={fact.id}>
                    <label
                      className={`flex items-start gap-3 rounded border px-3 py-2 ${
                        alreadyLinked
                          ? "border-slate-100 bg-slate-50 text-slate-400"
                          : "border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={busy || alreadyLinked}
                        checked={alreadyLinked || selected.includes(fact.id)}
                        onChange={(change) => toggle(fact.id, change.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-800">
                          {fact.short_label ?? fact.statement_text}
                        </span>
                        {fact.short_label ? (
                          <span className="block truncate text-xs text-slate-500">{fact.statement_text}</span>
                        ) : null}
                      </span>
                      {alreadyLinked ? (
                        <Badge label="linked" color="slate" />
                      ) : (
                        <Badge label="accepted" color="green" />
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {facts.hasNextPage ? (
            <button type="button" className={`${secondaryButtonClass} mt-3`}
              disabled={busy || facts.isFetchingNextPage} onClick={() => facts.fetchNextPage()}>
              {facts.isFetchingNextPage ? "Loading…" : "Load more accepted facts"}
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">{pendingIds.length} selected</p>
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || pendingIds.length === 0}
              onClick={() => onLink(pendingIds, relationship)}
            >
              {busy ? "Linking…" : `Link ${pendingIds.length || ""} fact${pendingIds.length === 1 ? "" : "s"}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

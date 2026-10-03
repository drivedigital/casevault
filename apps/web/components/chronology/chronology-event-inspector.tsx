"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Badge } from "@/components/badge";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/field";
import {
  PRECISION_LABELS,
  RELATIONSHIP_COLORS,
  RELATIONSHIP_LABELS,
  confidenceColor,
  eventDateLabel,
  significanceColor,
} from "@/components/chronology/chronology-format";
import { getFactForChronology, type ChronologyEvent } from "@/lib/api";

/** Right-pane inspector for the selected event (UX Spec Screen 8):
 * description, support (linked facts with evidence backlinks), actors, and
 * edit/delete/link actions. */
export function ChronologyEventInspector({
  event,
  actors,
  editing,
  linkingFacts,
  busy,
  error,
  onEdit,
  onDelete,
  onOpenLinkFacts,
  onUnlinkFact,
  onAddActor,
  onUnlinkActor,
  onClose,
}: {
  event: ChronologyEvent;
  actors: { id: string; display_name: string }[];
  editing: boolean;
  linkingFacts: boolean;
  busy: boolean;
  error: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLinkFacts: () => void;
  onUnlinkFact: (linkId: string) => void;
  onAddActor: (actorId: string, role: string | null) => void;
  onUnlinkActor: (linkId: string) => void;
  onClose: () => void;
}) {
  const [actorId, setActorId] = useState("");
  const [actorRole, setActorRole] = useState("");

  // Evidence backlinks: each linked fact's source links (GET /facts/{id} →
  // FactOut.source_links with denormalized source_title). Fetched only for
  // the selected event, one small query per fact.
  const factDetails = useQueries({
    queries: event.fact_links.map((link) => ({
      queryKey: ["fact", "chronology-backlinks", link.fact_id],
      queryFn: () => getFactForChronology(link.fact_id),
      staleTime: 60_000,
    })),
  });

  const linkedActorIds = new Set(event.actor_links.map((link) => link.actor_id));

  return (
    <aside className="h-fit rounded-lg border border-slate-200 bg-white xl:sticky xl:top-6" aria-label="Event inspector">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{event.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {eventDateLabel(event)} · {PRECISION_LABELS[event.date_precision]}
          </p>
        </div>
        <button type="button" aria-label="Close inspector" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="space-y-5 px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          {event.significance_level ? (
            <Badge label={`significance: ${event.significance_level}`} color={significanceColor(event.significance_level)} />
          ) : null}
          {event.confidence_level ? (
            <Badge label={`confidence: ${event.confidence_level}`} color={confidenceColor(event.confidence_level)} />
          ) : null}
          <Badge
            label={event.review_state.replaceAll("_", " ")}
            color={event.review_state === "accepted" ? "green" : "slate"}
          />
        </div>

        {event.description ? (
          <p className="whitespace-pre-line text-sm text-slate-700">{event.description}</p>
        ) : (
          <p className="text-sm italic text-slate-400">No description.</p>
        )}
        {event.date_text_raw ? (
          <p className="text-xs text-slate-500">Raw date text: “{event.date_text_raw}”</p>
        ) : null}

        <section aria-label="Support">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Support ({event.fact_links.length})
            </h3>
            <button
              type="button"
              className="text-xs font-medium text-blue-700 hover:underline"
              disabled={busy || linkingFacts}
              onClick={onOpenLinkFacts}
            >
              Link facts
            </button>
          </div>
          {event.fact_links.length === 0 ? (
            <p className="text-sm text-slate-500">
              No accepted facts linked yet. The chronology only consumes facts in
              review_state=accepted.
            </p>
          ) : (
            <ul className="space-y-2">
              {event.fact_links.map((link, index) => {
                const detail = factDetails[index]?.data;
                return (
                  <li key={link.id} className="rounded border border-slate-200 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-800">
                        {link.fact_short_label ? (
                          <span className="font-medium">{link.fact_short_label}: </span>
                        ) : null}
                        {link.fact_statement ?? detail?.statement_text ?? "Loading fact…"}
                      </p>
                      <Badge
                        label={RELATIONSHIP_LABELS[link.relationship_type] ?? link.relationship_type}
                        color={RELATIONSHIP_COLORS[link.relationship_type] ?? "slate"}
                      />
                    </div>
                    {link.fact_review_state && link.fact_review_state !== "accepted" ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Fact review state changed to “{link.fact_review_state.replaceAll("_", " ")}” since linking.
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {factDetails[index]?.isLoading ? (
                        <span className="text-slate-400">Loading evidence…</span>
                      ) : factDetails[index]?.isError ? (
                        <span role="alert" className="text-red-700">Could not load evidence links.</span>
                      ) : (detail?.source_links.length ?? 0) === 0 ? (
                        <span className="text-slate-400">No evidence attached to this fact</span>
                      ) : (
                        detail?.source_links.map((sourceLink) => (
                          <Link
                            key={sourceLink.id}
                            href={`/evidence/${sourceLink.source_id}`}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-blue-800 hover:border-blue-300 hover:bg-blue-50"
                            title={`Open evidence: ${sourceLink.source_title ?? sourceLink.source_id}`}
                          >
                            <span aria-hidden>📎</span>
                            <span className="max-w-[12rem] truncate">
                              {sourceLink.source_title ?? "Evidence"}
                            </span>
                            <span className="text-slate-400">({sourceLink.support_type})</span>
                          </Link>
                        ))
                      )}
                      <button
                        type="button"
                        className="ml-auto font-medium text-red-700 hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={() => onUnlinkFact(link.id)}
                      >
                        Unlink
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Actors">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Actors ({event.actor_links.length})
          </h3>
          {event.actor_links.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {event.actor_links.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm">
                  <span className="text-slate-800">
                    <Link href={`/actors/${link.actor_id}`} className="font-medium text-blue-800 hover:underline">
                      {link.actor_name ?? "Unknown actor"}
                    </Link>
                    {link.role_in_event ? <span className="text-slate-500"> · {link.role_in_event}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onUnlinkActor(link.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-slate-500">No actors linked to this event.</p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-end gap-2">
            <Field label="Actor">
              <select className={inputClass} value={actorId} onChange={(change) => setActorId(change.target.value)}>
                <option value="">Select…</option>
                {actors
                  .filter((actor) => !linkedActorIds.has(actor.id))
                  .map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.display_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Role">
              <input
                className={inputClass}
                placeholder="e.g. witness"
                maxLength={64}
                value={actorRole}
                onChange={(change) => setActorRole(change.target.value)}
              />
            </Field>
            <button
              type="button"
              className={`${secondaryButtonClass} mb-0.5`}
              disabled={busy || !actorId}
              onClick={() => {
                onAddActor(actorId, actorRole.trim() || null);
                setActorId("");
                setActorRole("");
              }}
            >
              Add
            </button>
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button type="button" className="mr-auto text-sm font-medium text-red-700 hover:underline disabled:opacity-50" disabled={busy} onClick={onDelete}>
          Delete event
        </button>
        <button type="button" className={buttonClass} disabled={busy || editing} onClick={onEdit}>
          Edit
        </button>
      </div>
    </aside>
  );
}

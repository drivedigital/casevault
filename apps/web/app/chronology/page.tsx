"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  createEvent,
  deleteEvent,
  deleteEventActorLink,
  deleteEventFactLink,
  getMatterChronology,
  linkEventActor,
  linkEventFact,
  updateEvent,
  type ChronologyEvent,
  type EventCreateInput,
  type EventRelationshipType,
  type EventUpdateInput,
} from "@/lib/api";
import { matchesQuery } from "@/components/chronology/chronology-format";
import { buttonClass } from "@/components/field";
import { ChronologyEventDialog } from "@/components/chronology/chronology-event-dialog";
import { ChronologyEventInspector } from "@/components/chronology/chronology-event-inspector";
import {
  EMPTY_CHRONOLOGY_FILTERS,
  ChronologyFilters,
  type ChronologyFilterValues,
  type ChronologyView,
} from "@/components/chronology/chronology-filters";
import { ChronologyLinkFactsDialog } from "@/components/chronology/chronology-link-facts-dialog";
import { ChronologyTable } from "@/components/chronology/chronology-table";
import { ChronologyTimeline } from "@/components/chronology/chronology-timeline";

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface DialogState {
  open: boolean;
  event: ChronologyEvent | null;
}

export default function ChronologyPage() {
  const queryClient = useQueryClient();
  const [matterId, setMatterId] = useState("");
  const [filters, setFilters] = useState<ChronologyFilterValues>(EMPTY_CHRONOLOGY_FILTERS);
  const [view, setView] = useState<ChronologyView>("timeline");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ open: false, event: null });
  const [linkFactsOpen, setLinkFactsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  const actors = useQuery({ queryKey: ["actors", "chronology"], queryFn: () => api.listActors() });
  const feed = useQuery({
    queryKey: ["chronology", matterId],
    queryFn: () => getMatterChronology(matterId),
    enabled: Boolean(matterId),
  });

  // Default to the first matter once the list loads (chronology is matter-scoped).
  useEffect(() => {
    if (!matterId && matters.data && matters.data.length > 0) {
      setMatterId(matters.data[0].id);
    }
  }, [matters.data, matterId]);

  const events = useMemo(() => feed.data?.events ?? [], [feed.data]);
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          matchesQuery(event, filters.q) &&
          (!filters.significance || event.significance_level === filters.significance),
      ),
    [events, filters],
  );
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["chronology", matterId] });
  };

  const notify = (message: string) => {
    setActionError(null);
    setNotice(message);
  };

  const saveEvent = useMutation({
    mutationFn: async ({ create, update, eventId }: { create: EventCreateInput; update: EventUpdateInput | null; eventId: string | null }) => {
      if (update && eventId) return updateEvent(eventId, update);
      return createEvent(create);
    },
    onSuccess: async (saved) => {
      if (!matterId) setMatterId(saved.matter_id);
      setSelectedEventId(saved.id);
      setDialog({ open: false, event: null });
      notify(dialog.event ? "Event saved." : "Event created.");
      await invalidate();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not save this event.")),
  });

  const removeEvent = useMutation({
    mutationFn: (eventId: string) => deleteEvent(eventId),
    onSuccess: async () => {
      setSelectedEventId(null);
      setDialog({ open: false, event: null });
      notify("Event deleted.");
      await invalidate();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not delete this event.")),
  });

  const linkFacts = useMutation({
    mutationFn: async ({ eventId, factIds, relationship }: { eventId: string; factIds: string[]; relationship: EventRelationshipType }) => {
      // Sequential: the API enforces accepted-only + uniqueness per link.
      for (const factId of factIds) {
        await linkEventFact(eventId, { fact_id: factId, relationship_type: relationship });
      }
      return factIds.length;
    },
    onSuccess: async (count) => {
      setLinkFactsOpen(false);
      notify(`Linked ${count} fact${count === 1 ? "" : "s"}.`);
      await queryClient.invalidateQueries({ queryKey: ["facts"] });
      await invalidate();
    },
    onError: async (error) => {
      setActionError(apiMessage(error, "Could not link all facts. Saved links are preserved; retry the remaining facts."));
      await invalidate();
    },
  });

  const unlinkFact = useMutation({
    mutationFn: (linkId: string) => deleteEventFactLink(linkId),
    onSuccess: async () => {
      notify("Fact unlinked.");
      await invalidate();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not unlink this fact.")),
  });

  const addActor = useMutation({
    mutationFn: ({ eventId, actorId, role }: { eventId: string; actorId: string; role: string | null }) =>
      linkEventActor(eventId, { actor_id: actorId, role_in_event: role }),
    onSuccess: async () => {
      notify("Actor linked.");
      await invalidate();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not link this actor.")),
  });

  const removeActor = useMutation({
    mutationFn: (linkId: string) => deleteEventActorLink(linkId),
    onSuccess: async () => {
      notify("Actor removed.");
      await invalidate();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not remove this actor.")),
  });

  const busy =
    saveEvent.isPending || removeEvent.isPending || linkFacts.isPending ||
    unlinkFact.isPending || addActor.isPending || removeActor.isPending;

  const noMatters = matters.data !== undefined && matters.data.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Chronology</h1>
          <p className="mt-1 text-sm text-slate-500">
            A live chronology built only from reviewed facts — events link the trusted
            (accepted) set, with evidence backlinks through each fact.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={!matterId}
          onClick={() => {
            setActionError(null);
            saveEvent.reset();
            setDialog({ open: true, event: null });
          }}
        >
          + New event
        </button>
      </div>

      {notice ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          <span>{notice}</span>
          <button type="button" className="font-medium hover:underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {matters.isError ? <p role="alert" className="mb-4 text-sm text-red-700">Could not load matters. Please refresh to retry.</p> : null}
      {actors.isError ? <p role="alert" className="mb-4 text-sm text-red-700">Could not load actors.</p> : null}
      {noMatters ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-600">
          <p>Create a matter first — every chronology belongs to one.</p>
          <a href="/matters/new" className="mt-2 inline-block font-medium text-blue-700 hover:underline">
            Go to Matters
          </a>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
          <ChronologyFilters
            filters={filters}
            matters={matters.data ?? []}
            matterId={matterId}
            events={visibleEvents}
            view={view}
            unlinkedAcceptedFacts={feed.data?.unlinked_accepted_fact_count ?? 0}
            onMatterChange={(next) => {
              setMatterId(next);
              setSelectedEventId(null);
              setActionError(null);
            }}
            onViewChange={setView}
            onChange={setFilters}
            onClear={() => setFilters(EMPTY_CHRONOLOGY_FILTERS)}
            onNewEvent={() => {
              setActionError(null);
              saveEvent.reset();
              setDialog({ open: true, event: null });
            }}
          />

          <div className={`grid min-w-0 gap-5 ${selectedEvent ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
            <section className="min-w-0">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                {feed.isError ? (
                  <p role="alert" className="px-2 py-8 text-sm text-red-700">
                    {apiMessage(feed.error, "Could not load the chronology.")}
                  </p>
                ) : !matterId ? (
                  <p className="px-2 py-8 text-sm text-slate-500">Select a matter to view its chronology.</p>
                ) : feed.isLoading ? (
                  <p className="px-2 py-8 text-sm text-slate-500">Loading chronology…</p>
                ) : events.length === 0 ? (
                  <div className="px-2 py-10 text-sm text-slate-600">
                    <p className="font-medium text-slate-800">No chronology events yet</p>
                    <p className="mt-1">
                      Create the first event, or attach accepted facts to events as they are
                      approved in the AI Review inbox.
                    </p>
                    <button
                      type="button"
                      className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                      onClick={() => setDialog({ open: true, event: null })}
                    >
                      + New event
                    </button>
                  </div>
                ) : visibleEvents.length === 0 ? (
                  <div className="px-2 py-10 text-sm text-slate-600">
                    <p>No events match the current filters.</p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-medium text-blue-700 hover:underline"
                      onClick={() => setFilters(EMPTY_CHRONOLOGY_FILTERS)}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : view === "timeline" ? (
                  <ChronologyTimeline
                    events={visibleEvents}
                    selectedEventId={selectedEventId}
                    onSelect={(event) => {
                      setActionError(null);
                      setSelectedEventId(event.id);
                    }}
                  />
                ) : (
                  <ChronologyTable
                    events={visibleEvents}
                    selectedEventId={selectedEventId}
                    onSelect={(event) => {
                      setActionError(null);
                      setSelectedEventId(event.id);
                    }}
                  />
                )}
              </div>
            </section>

            {selectedEvent ? (
              <ChronologyEventInspector
                key={selectedEvent.id}
                event={selectedEvent}
                actors={actors.data ?? []}
                editing={dialog.open && dialog.event?.id === selectedEvent.id}
                linkingFacts={linkFactsOpen}
                busy={busy}
                error={null}
                onEdit={() => {
                  setActionError(null);
                  saveEvent.reset();
                  setDialog({ open: true, event: selectedEvent });
                }}
                onDelete={() => {
                  if (window.confirm(`Delete “${selectedEvent.title}”? Linked fact and actor relationships are removed; the facts themselves are untouched.`)) {
                    removeEvent.mutate(selectedEvent.id);
                  }
                }}
                onOpenLinkFacts={() => {
                  setActionError(null);
                  linkFacts.reset();
                  setLinkFactsOpen(true);
                }}
                onUnlinkFact={(linkId) => unlinkFact.mutate(linkId)}
                onAddActor={(actorId, role) =>
                  addActor.mutate({ eventId: selectedEvent.id, actorId, role })
                }
                onUnlinkActor={(linkId) => removeActor.mutate(linkId)}
                onClose={() => setSelectedEventId(null)}
              />
            ) : null}
          </div>
        </div>
      )}

      <ChronologyEventDialog
        open={dialog.open}
        event={dialog.event}
        matters={matters.data ?? []}
        defaultMatterId={matterId}
        saving={saveEvent.isPending}
        error={saveEvent.isError ? apiMessage(saveEvent.error, "Could not save this event.") : null}
        onClose={() => {
          if (!saveEvent.isPending) {
            setActionError(null);
            saveEvent.reset();
            setDialog({ open: false, event: null });
          }
        }}
        onSubmit={(create: EventCreateInput, update: EventUpdateInput | null) =>
          saveEvent.mutate({ create, update, eventId: dialog.event?.id ?? null })
        }
      />
      <ChronologyLinkFactsDialog
        open={linkFactsOpen && Boolean(selectedEvent)}
        event={selectedEvent}
        busy={linkFacts.isPending}
        error={linkFacts.isError ? apiMessage(linkFacts.error, "Could not link facts.") : actionError}
        onClose={() => {
          if (!linkFacts.isPending) setLinkFactsOpen(false);
        }}
        onLink={(factIds, relationship) =>
          selectedEvent && linkFacts.mutate({ eventId: selectedEvent.id, factIds, relationship })
        }
      />
    </div>
  );
}
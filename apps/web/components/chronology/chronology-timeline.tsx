"use client";

import { Badge } from "@/components/badge";
import {
  clusterByDate,
  confidenceColor,
  eventDateLabel,
  significanceColor,
} from "@/components/chronology/chronology-format";
import type { ChronologyEvent } from "@/lib/api";

/** Timeline view: events clustered under date headers (undated last).
 * Clicking a card selects it in the inspector. */
export function ChronologyTimeline({
  events,
  selectedEventId,
  onSelect,
}: {
  events: ChronologyEvent[];
  selectedEventId: string | null;
  onSelect: (event: ChronologyEvent) => void;
}) {
  const clusters = clusterByDate(events);

  return (
    <ol className="relative space-y-6 border-l border-slate-300 pl-6">
      {clusters.map((cluster) => (
        <li key={cluster.key} className="relative">
          <span
            aria-hidden
            className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white ${
              cluster.key === "undated" ? "bg-slate-300" : "bg-slate-900"
            }`}
          />
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {cluster.label}
            <span className="ml-2 font-normal normal-case text-slate-400">
              {cluster.events.length} event{cluster.events.length === 1 ? "" : "s"}
            </span>
          </h3>
          <div className="space-y-2">
            {cluster.events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelect(event)}
                aria-current={selectedEventId === event.id}
                className={`block w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  selectedEventId === event.id
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-400"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{event.title}</span>
                  {event.significance_level ? (
                    <Badge label={event.significance_level} color={significanceColor(event.significance_level)} />
                  ) : null}
                  {event.date_precision === "approximate" ? <Badge label="approximate" color="amber" /> : null}
                  {event.date_precision === "unknown" && (event.date_start || event.date_end) ? (
                    <Badge label="date uncertain" color="slate" />
                  ) : null}
                </div>
                {event.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{event.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{eventDateLabel(event)}</span>
                  {event.actor_links.length > 0 ? (
                    <span>
                      {event.actor_links
                        .map((link) => link.actor_name ?? "Unknown actor")
                        .join(", ")}
                    </span>
                  ) : null}
                  <span>
                    {event.fact_links.length} linked fact{event.fact_links.length === 1 ? "" : "s"}
                  </span>
                  {event.confidence_level ? (
                    <Badge label={`confidence: ${event.confidence_level}`} color={confidenceColor(event.confidence_level)} />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

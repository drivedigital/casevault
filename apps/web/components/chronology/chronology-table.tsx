"use client";

import { Badge } from "@/components/badge";
import {
  confidenceColor,
  eventDateLabel,
  significanceColor,
} from "@/components/chronology/chronology-format";
import type { ChronologyEvent } from "@/lib/api";

/** Table view (UX Spec Screen 8 default columns; "linked claims" arrives with
 * WS-CLAIMS). Rows are already in timeline order from the API. */
export function ChronologyTable({
  events,
  selectedEventId,
  onSelect,
}: {
  events: ChronologyEvent[];
  selectedEventId: string | null;
  onSelect: (event: ChronologyEvent) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Actors</th>
            <th className="px-4 py-3">Significance</th>
            <th className="px-4 py-3">Support</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Review state</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {events.map((event) => (
            <tr
              key={event.id}
              onClick={() => onSelect(event)}
              aria-current={selectedEventId === event.id}
              className={`cursor-pointer ${
                selectedEventId === event.id ? "bg-slate-50" : "hover:bg-slate-50"
              }`}
            >
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{eventDateLabel(event)}</td>
              <td className="px-4 py-3">
                <button type="button" className="text-left font-medium text-slate-900 hover:underline" onClick={(click) => { click.stopPropagation(); onSelect(event); }}>{event.title}</button>
                {event.description ? (
                  <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500">{event.description}</div>
                ) : null}
              </td>
              <td className="max-w-[14rem] px-4 py-3 text-slate-600">
                {event.actor_links.length > 0
                  ? event.actor_links.map((link) => link.actor_name ?? "Unknown actor").join(", ")
                  : "—"}
              </td>
              <td className="px-4 py-3">
                {event.significance_level ? (
                  <Badge label={event.significance_level} color={significanceColor(event.significance_level)} />
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                {event.fact_links.length} fact{event.fact_links.length === 1 ? "" : "s"}
              </td>
              <td className="px-4 py-3">
                {event.confidence_level ? (
                  <Badge label={event.confidence_level} color={confidenceColor(event.confidence_level)} />
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge
                  label={event.review_state.replaceAll("_", " ")}
                  color={event.review_state === "accepted" ? "green" : "slate"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

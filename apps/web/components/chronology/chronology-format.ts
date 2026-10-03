// WS-CHRONO shared display helpers (pure module — no React, no "use client").
// Date strings from the API are ISO `YYYY-MM-DD`; they are parsed manually to
// avoid timezone shifting that `new Date("YYYY-MM-DD")` would introduce.

import type { ChronologyEvent, DatePrecision, EventRelationshipType } from "@/lib/api";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** `2025-06-03` → `Jun 3, 2025`. */
export function formatDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** `2025-06-03` → `Jun 3` (for tight timeline gutters). */
export function formatDateShort(iso: string): string {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Human label for an event's date window, honoring date_precision. */
export function eventDateLabel(event: ChronologyEvent): string {
  const { date_start: start, date_end: end, date_precision: precision, date_text_raw: raw } = event;
  if (start && end && start !== end) {
    const [sy] = parts(start);
    const [ey, em, ed] = parts(end);
    const endLabel = sy === ey ? `${MONTHS[em - 1]} ${ed}` : formatDate(end);
    const prefix = precision === "approximate" ? "circa " : "";
    return `${prefix}${formatDate(start)} – ${endLabel}`;
  }
  if (start) {
    return precision === "approximate" ? `circa ${formatDate(start)}` : formatDate(start);
  }
  if (end) {
    return precision === "approximate" ? `circa ${formatDate(end)}` : formatDate(end);
  }
  return raw?.trim() ? raw.trim() : "Undated";
}

export const PRECISION_LABELS: Record<DatePrecision, string> = {
  exact: "Exact date",
  range: "Date range",
  approximate: "Approximate",
  unknown: "Unknown",
};

export const RELATIONSHIP_LABELS: Record<EventRelationshipType, string> = {
  supports_event: "Supports",
  contradicts_event: "Contradicts",
  context_only: "Context",
};

export const RELATIONSHIP_COLORS: Record<EventRelationshipType, "green" | "red" | "slate"> = {
  supports_event: "green",
  contradicts_event: "red",
  context_only: "slate",
};

export function significanceColor(value: string | null): "red" | "amber" | "slate" | "violet" {
  if (value === "high") return "red";
  if (value === "medium") return "amber";
  if (value === "low") return "slate";
  return "violet";
}

export function confidenceColor(value: string | null): "green" | "blue" | "amber" | "slate" {
  if (value === "high") return "green";
  if (value === "medium") return "blue";
  if (value === "low") return "amber";
  return "slate";
}

export interface DateCluster {
  /** ISO date, or "undated" for the trailing no-date bucket. */
  key: string;
  label: string;
  events: ChronologyEvent[];
}

/** Date-clustering for the timeline view: bucket by date_start (falling back
 * to date_end), chronological, with a single "Undated" bucket last. The API
 * already returns events in timeline order (dated first, undated last). */
export function clusterByDate(events: ChronologyEvent[]): DateCluster[] {
  const clusters: DateCluster[] = [];
  const byKey = new Map<string, DateCluster>();
  for (const event of events) {
    const key = event.date_start ?? event.date_end ?? "undated";
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = {
        key,
        label: key === "undated" ? "Undated" : formatDate(key),
        events: [],
      };
      byKey.set(key, cluster);
      clusters.push(cluster);
    }
    cluster.events.push(event);
  }
  return clusters;
}

/** Case-insensitive substring filter over title/description/raw date text. */
export function matchesQuery(event: ChronologyEvent, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [event.title, event.description ?? "", event.date_text_raw ?? ""]
    .some((haystack) => haystack.toLowerCase().includes(needle));
}

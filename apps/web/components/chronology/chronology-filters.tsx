"use client";

import { Field, inputClass, secondaryButtonClass } from "@/components/field";
import { SIGNIFICANCE_LEVELS, type ChronologyEvent } from "@/lib/api";
import type { Matter } from "@/lib/types";

export type ChronologyView = "timeline" | "table";

export interface ChronologyFilterValues {
  q: string;
  significance: string;
}

export const EMPTY_CHRONOLOGY_FILTERS: ChronologyFilterValues = { q: "", significance: "" };

/** Left-rail filters for the chronology workspace (UX Spec Screen 8). */
export function ChronologyFilters({
  filters,
  matters,
  matterId,
  events,
  view,
  unlinkedAcceptedFacts,
  onMatterChange,
  onViewChange,
  onChange,
  onClear,
  onNewEvent,
}: {
  filters: ChronologyFilterValues;
  matters: Matter[];
  matterId: string;
  events: ChronologyEvent[];
  view: ChronologyView;
  unlinkedAcceptedFacts: number;
  onMatterChange: (matterId: string) => void;
  onViewChange: (view: ChronologyView) => void;
  onChange: (filters: ChronologyFilterValues) => void;
  onClear: () => void;
  onNewEvent: () => void;
}) {
  const update = <K extends keyof ChronologyFilterValues>(key: K, value: ChronologyFilterValues[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 xl:sticky xl:top-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Chronology</h2>
        <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={onClear}>
          Clear all
        </button>
      </div>
      <div className="space-y-3">
        <Field label="Matter">
          <select className={inputClass} value={matterId} onChange={(event) => onMatterChange(event.target.value)}>
            <option value="">Select a matter…</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search events">
          <input
            className={inputClass}
            placeholder="Title, description, raw date"
            value={filters.q}
            onChange={(event) => update("q", event.target.value)}
          />
        </Field>
        <Field label="Significance">
          <select
            className={inputClass}
            value={filters.significance}
            onChange={(event) => update("significance", event.target.value)}
          >
            <option value="">All levels</option>
            {SIGNIFICANCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="View" hint="One dataset, multiple visualizations.">
          <div className="flex gap-2">
            {(["timeline", "table"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onViewChange(option)}
                aria-pressed={view === option}
                className={`flex-1 rounded border px-3 py-2 text-sm font-medium capitalize ${
                  view === option
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        disabled={!matterId}
        onClick={onNewEvent}
      >
        + New event
      </button>
      {unlinkedAcceptedFacts > 0 ? (
        <p className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {unlinkedAcceptedFacts} accepted fact{unlinkedAcceptedFacts === 1 ? "" : "s"} not yet attached to an
          event — select an event and use “Link facts”, or create one from them.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">
        {events.length} event{events.length === 1 ? "" : "s"} shown
      </p>
      <button type="button" className={`${secondaryButtonClass} mt-3 w-full`} onClick={onClear}>
        Reset filters
      </button>
    </aside>
  );
}

"use client";

import { Field, inputClass, secondaryButtonClass } from "@/components/field";
import { SOURCE_STATUSES, STRENGTH_LABELS, type Matter, type SourceStatus, type StrengthLabel } from "@/lib/types";

export interface LedgerFilterValues {
  matterId: string;
  sourceStatus: "" | SourceStatus;
  confidenceLevel: "" | StrengthLabel;
  tag: string;
  hasVerificationTask: "" | "true" | "false";
  q: string;
}

export const EMPTY_LEDGER_FILTERS: LedgerFilterValues = {
  matterId: "",
  sourceStatus: "",
  confidenceLevel: "",
  tag: "",
  hasVerificationTask: "",
  q: "",
};

export function LedgerFilters({
  filters,
  matters,
  onChange,
  onClear,
}: {
  filters: LedgerFilterValues;
  matters: Matter[];
  onChange: (filters: LedgerFilterValues) => void;
  onClear: () => void;
}) {
  const update = <K extends keyof LedgerFilterValues>(key: K, value: LedgerFilterValues[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <aside className="h-fit rounded-lg border border-slate-200 bg-white p-4 xl:sticky xl:top-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={onClear}>
          Clear all
        </button>
      </div>
      <div className="space-y-3">
        <Field label="Search">
          <input
            className={inputClass}
            placeholder="ID, name, or statement"
            value={filters.q}
            onChange={(event) => update("q", event.target.value)}
          />
        </Field>
        <Field label="Matter">
          <select
            className={inputClass}
            value={filters.matterId}
            onChange={(event) => update("matterId", event.target.value)}
          >
            <option value="">All matters</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source status">
          <select
            className={inputClass}
            value={filters.sourceStatus}
            onChange={(event) => update("sourceStatus", event.target.value as "" | SourceStatus)}
          >
            <option value="">All source statuses</option>
            {SOURCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Confidence">
          <select
            className={inputClass}
            value={filters.confidenceLevel}
            onChange={(event) => update("confidenceLevel", event.target.value as "" | StrengthLabel)}
          >
            <option value="">All confidence levels</option>
            {STRENGTH_LABELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tag">
          <input
            className={inputClass}
            placeholder="e.g. damages"
            value={filters.tag}
            onChange={(event) => update("tag", event.target.value)}
          />
        </Field>
        <Field label="Verification task">
          <select
            className={inputClass}
            value={filters.hasVerificationTask}
            onChange={(event) => update("hasVerificationTask", event.target.value as "" | "true" | "false")}
          >
            <option value="">Any verification state</option>
            <option value="true">Has a task</option>
            <option value="false">No task</option>
          </select>
        </Field>
      </div>
      <button type="button" className={`${secondaryButtonClass} mt-4 w-full`} onClick={onClear}>
        Reset filters
      </button>
    </aside>
  );
}

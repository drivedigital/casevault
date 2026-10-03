"use client";

import { useDialogFocus } from "./use-dialog-focus";

import { useEffect, useState } from "react";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/field";
import {
  DATE_PRECISIONS,
  PRECISION_HINTS,
  type ChronologyEvent,
  type DatePrecision,
  type EventCreateInput,
  type EventUpdateInput,
} from "@/lib/api";
import type { Matter, StrengthLabel } from "@/lib/types";
import { PRECISION_LABELS } from "@/components/chronology/chronology-format";

const SIGNIFICANCE_OPTIONS = ["high", "medium", "low"];
const CONFIDENCE_OPTIONS: StrengthLabel[] = ["high", "medium", "low"];

interface EventFormValues {
  matterId: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  datePrecision: DatePrecision;
  dateTextRaw: string;
  significanceLevel: string;
  confidenceLevel: "" | StrengthLabel;
}

function formForEvent(event: ChronologyEvent | null, defaultMatterId: string): EventFormValues {
  if (!event) {
    return {
      matterId: defaultMatterId,
      title: "",
      description: "",
      dateStart: "",
      dateEnd: "",
      datePrecision: "exact",
      dateTextRaw: "",
      significanceLevel: "",
      confidenceLevel: "",
    };
  }
  return {
    matterId: event.matter_id,
    title: event.title,
    description: event.description ?? "",
    dateStart: event.date_start ?? "",
    dateEnd: event.date_end ?? "",
    datePrecision: event.date_precision,
    dateTextRaw: event.date_text_raw ?? "",
    significanceLevel: event.significance_level ?? "",
    confidenceLevel: event.confidence_level ?? "",
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export function toEventPayload(form: EventFormValues): EventCreateInput {
  return {
    matter_id: form.matterId,
    title: form.title.trim(),
    description: nullable(form.description),
    date_start: nullable(form.dateStart),
    date_end: nullable(form.dateEnd),
    date_precision: form.datePrecision,
    date_text_raw: nullable(form.dateTextRaw),
    significance_level: nullable(form.significanceLevel),
    confidence_level: form.confidenceLevel || null,
  };
}

export function toEventUpdatePayload(form: EventFormValues): EventUpdateInput {
  const { matter_id: _matterId, ...rest } = toEventPayload(form);
  return rest;
}

/** Create/edit event modal (WS-CHRONO brief: "event creation modals … with
 * date precision support"). */
export function ChronologyEventDialog({
  open,
  event,
  matters,
  defaultMatterId,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  event: ChronologyEvent | null;
  matters: Matter[];
  defaultMatterId: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (create: EventCreateInput, update: EventUpdateInput | null) => void;
}) {
  const [form, setForm] = useState<EventFormValues>(() => formForEvent(event, defaultMatterId));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(formForEvent(event, defaultMatterId));
      setLocalError(null);
    }
  }, [open, event, defaultMatterId]);

  const dialogRef = useDialogFocus(open, onClose, saving);

  if (!open) return null;

  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    if (!form.matterId) return setLocalError("Choose a matter for this event.");
    if (!form.title.trim()) return setLocalError("A title is required.");
    if (form.dateStart && form.dateEnd && form.dateEnd < form.dateStart) {
      return setLocalError("The end date cannot be earlier than the start date.");
    }
    if (form.datePrecision === "range" && !(form.dateStart && form.dateEnd)) {
      return setLocalError("A date range needs both a start and an end date.");
    }
    setLocalError(null);
    onSubmit(toEventPayload(form), event ? toEventUpdatePayload(form) : null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={event ? "Edit chronology event" : "New chronology event"}
      onClick={(click) => {
        if (click.target === click.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {event ? "Edit event" : "New chronology event"}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-700"
            onClick={() => !saving && onClose()}
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Matter">
              <select
                className={inputClass}
                value={form.matterId}
                disabled={Boolean(event)}
                onChange={(change) => update("matterId", change.target.value)}
              >
                <option value="">Select a matter…</option>
                {matters.map((matter) => (
                  <option key={matter.id} value={matter.id}>
                    {matter.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Significance">
              <select
                className={inputClass}
                value={form.significanceLevel}
                onChange={(change) => update("significanceLevel", change.target.value)}
              >
                <option value="">Not set</option>
                {SIGNIFICANCE_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Title">
            <input
              className={inputClass}
              placeholder="e.g. Complaint filed"
              value={form.title}
              maxLength={255}
              onChange={(change) => update("title", change.target.value)}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={`${inputClass} min-h-24`}
              placeholder="What happened, in one or two sentences."
              value={form.description}
              onChange={(change) => update("description", change.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date start">
              <input
                type="date"
                className={inputClass}
                value={form.dateStart}
                onChange={(change) => {
                  const dateStart = change.target.value;
                  setForm((current) => ({
                    ...current,
                    dateStart,
                    // Entering a second date on an "exact" event means a range.
                    datePrecision:
                      dateStart && current.dateEnd && current.datePrecision === "exact"
                        ? "range"
                        : current.datePrecision,
                  }));
                }}
              />
            </Field>
            <Field label="Date end">
              <input
                type="date"
                className={inputClass}
                value={form.dateEnd}
                onChange={(change) => {
                  const dateEnd = change.target.value;
                  setForm((current) => ({
                    ...current,
                    dateEnd,
                    datePrecision:
                      dateEnd && current.dateStart && current.datePrecision === "exact"
                        ? "range"
                        : !dateEnd && current.datePrecision === "range"
                          ? "approximate"
                          : current.datePrecision,
                  }));
                }}
              />
            </Field>
            <Field label="Date precision">
              <select
                className={inputClass}
                value={form.datePrecision}
                onChange={(change) => update("datePrecision", change.target.value as DatePrecision)}
              >
                {DATE_PRECISIONS.map((precision) => (
                  <option key={precision} value={precision}>
                    {PRECISION_LABELS[precision]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="-mt-2 text-xs text-slate-400">{PRECISION_HINTS[form.datePrecision]}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Raw date text" hint="As written in the source, e.g. “on or about June 3”.">
              <input
                className={inputClass}
                value={form.dateTextRaw}
                onChange={(change) => update("dateTextRaw", change.target.value)}
              />
            </Field>
            <Field label="Confidence">
              <select
                className={inputClass}
                value={form.confidenceLevel}
                onChange={(change) => update("confidenceLevel", change.target.value as "" | StrengthLabel)}
              >
                <option value="">Not set</option>
                {CONFIDENCE_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {localError || error ? (
            <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError ?? error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" className={secondaryButtonClass} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={buttonClass} disabled={saving} onClick={submit}>
            {saving ? "Saving…" : event ? "Save event" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}

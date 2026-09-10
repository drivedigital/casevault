"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/badge";
import { buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/field";
import {
  SOURCE_STATUSES,
  STRENGTH_LABELS,
  type LedgerEntry,
  type LedgerEntryInput,
  type Matter,
  type Source,
  type SourceStatus,
  type StrengthLabel,
} from "@/lib/types";

interface LedgerFormValues {
  matterId: string;
  externalLedgerId: string;
  dateStart: string;
  dateEnd: string;
  dateTextRaw: string;
  factShortName: string;
  factStatement: string;
  claimUseText: string;
  reliefUseText: string;
  sourcePathText: string;
  sourceLocatorText: string;
  sourceStatus: "" | SourceStatus;
  authenticationOrWitness: string;
  confidenceLevel: "" | StrengthLabel;
  verificationTaskText: string;
  restrictionsOrNotes: string;
  tags: string;
  linkedSourceId: string;
}

const EMPTY_FORM: LedgerFormValues = {
  matterId: "",
  externalLedgerId: "",
  dateStart: "",
  dateEnd: "",
  dateTextRaw: "",
  factShortName: "",
  factStatement: "",
  claimUseText: "",
  reliefUseText: "",
  sourcePathText: "",
  sourceLocatorText: "",
  sourceStatus: "",
  authenticationOrWitness: "",
  confidenceLevel: "",
  verificationTaskText: "",
  restrictionsOrNotes: "",
  tags: "",
  linkedSourceId: "",
};

function formForEntry(entry: LedgerEntry | null): LedgerFormValues {
  if (!entry) return EMPTY_FORM;
  return {
    matterId: entry.matter_id ?? "",
    externalLedgerId: entry.external_ledger_id ?? "",
    dateStart: entry.date_start ?? "",
    dateEnd: entry.date_end ?? "",
    dateTextRaw: entry.date_text_raw ?? "",
    factShortName: entry.fact_short_name,
    factStatement: entry.fact_statement,
    claimUseText: entry.claim_use_text ?? "",
    reliefUseText: entry.relief_use_text ?? "",
    sourcePathText: entry.source_path_text ?? "",
    sourceLocatorText: entry.source_locator_text ?? "",
    sourceStatus: entry.source_status ?? "",
    authenticationOrWitness: entry.authentication_or_witness ?? "",
    confidenceLevel: entry.confidence_level ?? "",
    verificationTaskText: entry.verification_task_text ?? "",
    restrictionsOrNotes: entry.restrictions_or_notes ?? "",
    tags: entry.tags.join(", "),
    linkedSourceId: entry.linked_source_id ?? "",
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toPayload(form: LedgerFormValues): LedgerEntryInput {
  return {
    matter_id: form.matterId || null,
    external_ledger_id: nullable(form.externalLedgerId),
    date_start: form.dateStart || null,
    date_end: form.dateEnd || null,
    date_text_raw: nullable(form.dateTextRaw),
    fact_short_name: form.factShortName.trim(),
    fact_statement: form.factStatement.trim(),
    claim_use_text: nullable(form.claimUseText),
    relief_use_text: nullable(form.reliefUseText),
    source_path_text: nullable(form.sourcePathText),
    source_locator_text: nullable(form.sourceLocatorText),
    source_status: form.sourceStatus || null,
    authentication_or_witness: nullable(form.authenticationOrWitness),
    confidence_level: form.confidenceLevel || null,
    verification_task_text: nullable(form.verificationTaskText),
    restrictions_or_notes: nullable(form.restrictionsOrNotes),
    tags: Array.from(new Set(form.tags.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean))),
  };
}

export function LedgerDrawer({
  open,
  entry,
  matters,
  sources,
  saving,
  deleting,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  entry: LedgerEntry | null;
  matters: Matter[];
  sources: Source[];
  saving: boolean;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: LedgerEntryInput, linkedSourceId: string) => void;
  onDelete: (entry: LedgerEntry) => void;
}) {
  const [form, setForm] = useState<LedgerFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(formForEntry(entry));
  }, [entry, open]);

  if (!open) return null;

  const update = <K extends keyof LedgerFormValues>(key: K, value: LedgerFormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const linkedSource = sources.find((source) => source.id === form.linkedSourceId) ?? entry?.linked_source;

  return (
    <div className="fixed inset-0 z-30 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ledger-drawer-title">
      <button type="button" className="absolute inset-0 bg-slate-900/20" aria-label="Close ledger row editor" onClick={onClose} />
      <section className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Source ledger</p>
            <h2 id="ledger-drawer-title" className="mt-1 text-lg font-semibold text-slate-900">
              {entry ? "Edit ledger row" : "New ledger row"}
            </h2>
          </div>
          <button type="button" className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form
          className="flex-1 space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(toPayload(form), form.linkedSourceId);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Matter">
              <select className={inputClass} value={form.matterId} onChange={(event) => update("matterId", event.target.value)}>
                <option value="">No matter</option>
                {matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.name}</option>)}
              </select>
            </Field>
            <Field label="Source / fact ID">
              <input className={inputClass} value={form.externalLedgerId} onChange={(event) => update("externalLedgerId", event.target.value)} placeholder="e.g. F-014" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date start">
              <input type="date" className={inputClass} value={form.dateStart} onChange={(event) => update("dateStart", event.target.value)} />
            </Field>
            <Field label="Date end">
              <input type="date" className={inputClass} value={form.dateEnd} onChange={(event) => update("dateEnd", event.target.value)} />
            </Field>
            <Field label="Raw date text" hint="Use when a date is uncertain or prose.">
              <input className={inputClass} value={form.dateTextRaw} onChange={(event) => update("dateTextRaw", event.target.value)} placeholder="Early May 2024" />
            </Field>
          </div>

          <Field label="Short fact / event name">
            <input required className={inputClass} value={form.factShortName} onChange={(event) => update("factShortName", event.target.value)} />
          </Field>
          <Field label="Factual statement">
            <textarea required rows={4} className={inputClass} value={form.factStatement} onChange={(event) => update("factStatement", event.target.value)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Claim use">
              <textarea rows={2} className={inputClass} value={form.claimUseText} onChange={(event) => update("claimUseText", event.target.value)} />
            </Field>
            <Field label="Relief use">
              <textarea rows={2} className={inputClass} value={form.reliefUseText} onChange={(event) => update("reliefUseText", event.target.value)} />
            </Field>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Linked source</h3>
                <p className="text-xs text-slate-600">Link this ledger row to a source record.</p>
              </div>
              {linkedSource ? <Badge label={linkedSource.title} color="blue" /> : null}
            </div>
            <select className={inputClass} value={form.linkedSourceId} onChange={(event) => update("linkedSourceId", event.target.value)}>
              <option value="">No linked source</option>
              {entry?.linked_source && !sources.some((source) => source.id === entry.linked_source?.id) ? (
                <option value={entry.linked_source.id}>{entry.linked_source.title}</option>
              ) : null}
              {sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
            </select>
            <p className="mt-2 text-xs text-blue-800">The selected source link is saved with this row.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source path">
              <input className={inputClass} value={form.sourcePathText} onChange={(event) => update("sourcePathText", event.target.value)} placeholder="Document or folder reference" />
            </Field>
            <Field label="Source locator">
              <input className={inputClass} value={form.sourceLocatorText} onChange={(event) => update("sourceLocatorText", event.target.value)} placeholder="p. 4, ¶ 2" />
            </Field>
            <Field label="Source status">
              <select className={inputClass} value={form.sourceStatus} onChange={(event) => update("sourceStatus", event.target.value as "" | SourceStatus)}>
                <option value="">Not set</option>
                {SOURCE_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Confidence">
              <select className={inputClass} value={form.confidenceLevel} onChange={(event) => update("confidenceLevel", event.target.value as "" | StrengthLabel)}>
                <option value="">Not set</option>
                {STRENGTH_LABELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Authentication or witness">
            <textarea rows={2} className={inputClass} value={form.authenticationOrWitness} onChange={(event) => update("authenticationOrWitness", event.target.value)} />
          </Field>
          <Field label="Verification task">
            <textarea rows={2} className={inputClass} value={form.verificationTaskText} onChange={(event) => update("verificationTaskText", event.target.value)} placeholder="What still needs checking?" />
          </Field>
          <Field label="Restrictions or notes">
            <textarea rows={2} className={inputClass} value={form.restrictionsOrNotes} onChange={(event) => update("restrictionsOrNotes", event.target.value)} />
          </Field>
          <Field label="Tags" hint="Separate tags with commas or semicolons.">
            <input className={inputClass} value={form.tags} onChange={(event) => update("tags", event.target.value)} placeholder="damages, follow-up" />
          </Field>

          {error ? <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            {entry ? (
              <button
                type="button"
                className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                disabled={saving || deleting}
                onClick={() => onDelete(entry)}
              >
                {deleting ? "Deleting…" : "Delete row"}
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving || deleting}>Cancel</button>
              <button type="submit" className={buttonClass} disabled={saving || deleting || !form.factShortName.trim() || !form.factStatement.trim()}>
                {saving ? "Saving…" : entry ? "Save changes" : "Create row"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.1 + §EU-D.5). New file inside the EU-D write set.
//
// Status tab: title/status drafts, save, include/exclude and OCR reprocess.
// - Drafts arrive pre-initialized from server data (or with the user's dirty
//   edits preserved across refetches); Save is gated until the values are
//   initialized + valid, and disabled while a save is in flight (no silent
//   duplicate requests). Save failures keep the input and offer retry.
// - OCR feedback is honest about the 202 contract: accepted ≠ completed.
//   queued:false shows the reason and never claims success or polls.
//   queued:true watches the persisted source status (2s interval, 120s
//   budget) and reports complete / skipped / failed distinctly; a timeout is
//   reported as still-unconfirmed with a manual refresh, never as failure.

"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { Field, inputClass, buttonClass, secondaryButtonClass } from "@/components/field";
import { ErrorNote, WarningNote } from "@/components/evidence-detail-error";
import type { SourceDraftBag } from "@/lib/evidence-detail-drafts";
import type { OcrWatch } from "@/lib/evidence-detail-ocr-poll";
import { OCR_POLL_BUDGET_MS } from "@/lib/evidence-detail-ocr-poll";
import { describeError } from "@/lib/evidence-detail-errors";
import { SOURCE_STATUSES, type Source, type SourceStatus } from "@/lib/types";

export type SourceUpdatePayload = Partial<
  Pick<
    Source,
    | "title"
    | "source_status"
    | "evidence_review_status"
    | "included_flag"
    | "excluded_flag"
    | "exclusion_reason"
    | "authentication_notes"
    | "restrictions_notes"
  >
>;

export interface ReprocessResult {
  queued: boolean;
  job_id: string | null;
  reason: string | null;
}

function InfoNote({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      role="status"
      data-testid="info-note"
      className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
    >
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-0.5 text-xs">{children}</div> : null}
    </div>
  );
}

function SuccessNote({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      role="status"
      data-testid="success-note"
      className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
    >
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-0.5 text-xs">{children}</div> : null}
    </div>
  );
}

export interface EvidenceStatusPanelProps {
  source: Source;
  drafts: SourceDraftBag;
  update: UseMutationResult<Source, Error, SourceUpdatePayload>;
  /** Timestamp of the last successful form save, or null. */
  savedAt: number | null;
  onSave: () => void;
  reprocess: UseMutationResult<ReprocessResult, Error, void>;
  onReprocess: () => void;
  ocrWatch: OcrWatch;
  ocrWatchError: string | null;
  onManualRefresh: () => void;
}

export function EvidenceStatusPanel({
  source,
  drafts,
  update,
  savedAt,
  onSave,
  reprocess,
  onReprocess,
  ocrWatch,
  ocrWatchError,
  onManualRefresh,
}: EvidenceStatusPanelProps) {
  // Attribute a failed update to the operation that failed: the failing
  // call's payload says whether it was the form save or a flag toggle.
  const failingPayload = update.isError ? update.variables : undefined;
  const formSaveFailed =
    update.isError &&
    (failingPayload?.title !== undefined || failingPayload?.source_status !== undefined);
  const flagUpdateFailed =
    update.isError && !formSaveFailed;

  const canSave = drafts.initialized && drafts.valid && !update.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-800">Update fields</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title">
            <input
              className={inputClass}
              value={drafts.title}
              onChange={(e) => drafts.onTitleChange(e.target.value)}
              data-testid="draft-title"
            />
          </Field>
          <Field
            label="Source status"
            hint={
              drafts.valid ? undefined : "A title and a known status are required before saving."
            }
          >
            <select
              className={inputClass}
              value={drafts.status}
              onChange={(e) => drafts.onStatusChange(e.target.value)}
              data-testid="draft-status"
            >
              {!SOURCE_STATUSES.includes(drafts.status as SourceStatus) ? (
                <option value={drafts.status}>{drafts.status || "—"}</option>
              ) : null}
              {SOURCE_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className={`${buttonClass} text-xs`}
            data-testid="save-source"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={drafts.resetFromServer}
            disabled={update.isPending}
            className={`${secondaryButtonClass} text-xs`}
            title="Discard unsaved edits and re-read the current server values"
          >
            Reset to server values
          </button>
          {drafts.dirty ? (
            <span className="text-xs font-medium text-amber-700" data-testid="dirty-indicator">
              Unsaved edits
            </span>
          ) : null}
          {!drafts.valid && drafts.initialized ? (
            <span className="text-xs text-red-600" data-testid="invalid-draft">
              Cannot save: title must not be empty and the status must be one of the known values.
            </span>
          ) : null}
        </div>
        {formSaveFailed && update.error ? (
          <div className="mt-2">
            <ErrorNote
              title="Save failed"
              message={`${describeError(update.error)} Your edits are preserved — adjust and save again.`}
            />
          </div>
        ) : null}
        {!update.isError && !update.isPending && savedAt ? (
          <p className="mt-2 text-xs text-green-700" data-testid="save-ok">
            Saved ✓ ({new Date(savedAt).toLocaleTimeString()})
          </p>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <h3 className="mb-2 text-sm font-medium text-slate-800">Include / exclude</h3>
        <div className="flex flex-wrap gap-2">
          {source.included_flag ? (
            <button
              type="button"
              onClick={() => update.mutate({ included_flag: false })}
              disabled={update.isPending}
              className={`${secondaryButtonClass} text-xs`}
            >
              Un-include
            </button>
          ) : (
            <button
              type="button"
              onClick={() => update.mutate({ included_flag: true, excluded_flag: false })}
              disabled={update.isPending}
              className={`${buttonClass} bg-green-600 text-xs hover:bg-green-700`}
            >
              Include
            </button>
          )}
          {source.excluded_flag ? (
            <button
              type="button"
              onClick={() => update.mutate({ excluded_flag: false })}
              disabled={update.isPending}
              className={`${secondaryButtonClass} text-xs`}
            >
              Un-exclude
            </button>
          ) : (
            <button
              type="button"
              onClick={() => update.mutate({ excluded_flag: true, included_flag: false })}
              disabled={update.isPending}
              className={`${buttonClass} bg-red-600 text-xs hover:bg-red-700`}
            >
              Exclude
            </button>
          )}
        </div>
        {flagUpdateFailed && update.error ? (
          <div className="mt-2">
            <ErrorNote
              title="Include/exclude update failed"
              message={`${describeError(update.error)} The button still reflects the last saved state — try again.`}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 pt-3">
        <h3 className="mb-2 text-sm font-medium text-slate-800">OCR</h3>
        <p className="mb-2 text-xs text-slate-500">
          Current server state — processing:{" "}
          <span className="font-medium text-slate-700">{source.processing_status}</span>, OCR:{" "}
          <span className="font-medium text-slate-700">{source.ocr_status}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReprocess}
            disabled={reprocess.isPending}
            className={`${secondaryButtonClass} text-xs`}
            data-testid="reprocess-ocr"
          >
            {reprocess.isPending ? "Queueing…" : "Reprocess OCR"}
          </button>
          <button
            type="button"
            onClick={onManualRefresh}
            className={`${secondaryButtonClass} text-xs`}
          >
            Refresh source &amp; pages
          </button>
        </div>

        <div className="mt-2 space-y-2">
          {reprocess.isError && reprocess.error ? (
            <ErrorNote
              title="Reprocess request failed"
              message={`${describeError(reprocess.error)} Nothing was queued — try again.`}
              onRetry={onReprocess}
              pending={reprocess.isPending}
            />
          ) : null}

          {reprocess.data && !reprocess.data.queued ? (
            <WarningNote title="OCR was NOT queued">
              <span data-testid="ocr-not-queued">
                Reason: {reprocess.data.reason ?? "unknown"}. No worker job was created, so the
                OCR status will not change on its own (the server still records the stage as
                “queued”). Start a worker (make worker, or make process-jobs without Redis) and
                request again, or refresh manually.
              </span>
            </WarningNote>
          ) : null}

          {reprocess.data && reprocess.data.queued ? (
            <InfoNote title="OCR request accepted — not completed yet">
              <span data-testid="ocr-accepted">
                The server answered 202 and queued job{" "}
                {reprocess.data.job_id ?? "(no id returned)"}. 202 means accepted, not that
                extraction finished — watching the source status every 2s (for at most{" "}
                {Math.round(OCR_POLL_BUDGET_MS / 1000)}s).
              </span>
            </InfoNote>
          ) : null}

          {ocrWatch.phase === "watching" ? (
            <InfoNote title="Watching for OCR results…">
              <span data-testid="ocr-watching">
                Checking the source status every 2s (budget{" "}
                {Math.round(OCR_POLL_BUDGET_MS / 1000)}s). This page also refreshes the source
                and pages when a terminal status (complete / skipped / failed) is reached.
              </span>
            </InfoNote>
          ) : null}

          {ocrWatchError && ocrWatch.phase === "watching" ? (
            <WarningNote title="Status check problem">
              <span data-testid="ocr-watch-error">
                {ocrWatchError} Still watching while the budget lasts — network problems are
                reported, not hidden.
              </span>
            </WarningNote>
          ) : null}

          {ocrWatch.phase === "done" && ocrWatch.outcome === "complete" ? (
            <SuccessNote title="OCR complete">
              <span data-testid="ocr-done">
                Extraction finished successfully — the source and its pages were refreshed.
              </span>
            </SuccessNote>
          ) : null}
          {ocrWatch.phase === "done" && ocrWatch.outcome === "skipped" ? (
            <WarningNote title="OCR skipped — no extraction performed">
              <span data-testid="ocr-done">
                The worker skipped OCR for this file type (no OCR engine is wired in this build:
                PDF/image/spreadsheet types are stub-skipped). This is a valid terminal state,
                not a success and not an error.
              </span>
            </WarningNote>
          ) : null}
          {ocrWatch.phase === "done" && ocrWatch.outcome === "failed" ? (
            <ErrorNote
              title="OCR failed"
              message="The worker reported failure (processing_status=failed). Check the worker logs; the source and pages were refreshed."
            />
          ) : null}

          {ocrWatch.phase === "timeout" ? (
            <WarningNote title="Still processing — automatic checks stopped">
              <span data-testid="ocr-timeout">
                No terminal status after {Math.round(OCR_POLL_BUDGET_MS / 1000)}s, so this page
                stopped polling. That does <span className="font-medium">not</span> mean the
                job failed — it may still be running. Use the Refresh button to check manually.
              </span>
            </WarningNote>
          ) : null}
        </div>
      </div>
    </div>
  );
}

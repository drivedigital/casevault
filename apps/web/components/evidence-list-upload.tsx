"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Notice, RetryButton, describeError, outcomeKnown } from "./evidence-list-states";

// -----------------------------------------------------------------------------
// EU-L evidence upload (list page). Contract §EU-L (2)–(3) + 2026-09-11
// integration review: pending protection must cover EVERY entry path (button,
// drop zone, direct picker selection, same-tick rapid events) — not only the
// disabled button — and must release reliably on completion AND failure.
//
// Implementation: a synchronous in-flight ref guards handleFile/openPicker.
// react-query's isPending alone flips state after a render tick, so two events
// in the same tick could both observe "idle" — the ref closes that window.
// onSettled fires on success AND error, so the lock cannot get stuck.
//
// Failure copy distinguishes PROVEN outcomes (4xx server rejection: "the file
// was not added") from RESPONSE-LOSS outcomes (network failure / 5xx: the
// server may have committed before the connection dropped — "not known
// whether"), with a safe refresh/reconciliation action offered before retry.
// -----------------------------------------------------------------------------

// Mirrors the server guard (app config max_upload_bytes = 100 MB).
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type BlockedAttempt =
  | { kind: "file"; name: string }
  | { kind: "picker" }
  | null;

export function EvidenceUpload() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  const [tooLargeName, setTooLargeName] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedAttempt>(null);

  const refreshLists = useCallback(() => {
    // Safe reconciliation: re-read the list so the user can see whether an
    // outcome-unknown upload actually landed before deciding to retry.
    qc.invalidateQueries({ queryKey: ["sources"] });
  }, [qc]);

  const upload = useMutation({
    mutationFn: (file: File) =>
      api.uploadSource(file, { title: file.name.replace(/\.[^.]+$/, "") }),
    onSuccess: (_source, file) => {
      // Refresh ONLY the affected source-list queries (§EU-L 5).
      qc.invalidateQueries({ queryKey: ["sources"] });
      setTooLargeName(null);
      setUploadedName(file.name);
    },
    onSettled: () => {
      // Reliable release: runs on success AND failure, before any retry can
      // be attempted by a user reacting to the outcome.
      inFlightRef.current = false;
      setBlocked(null);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      setUploadedName(null);
      // Same-tick-safe single-flight guard across ALL entry paths.
      if (inFlightRef.current || upload.isPending) {
        setBlocked({ kind: "file", name: file.name });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        // Client-side guard: retrying cannot succeed, so no retry is offered —
        // the message says what to do instead. Filters elsewhere are untouched.
        setTooLargeName(file.name);
        upload.reset();
        return;
      }
      setTooLargeName(null);
      setBlocked(null);
      inFlightRef.current = true;
      upload.mutate(file);
    },
    [upload],
  );

  const openPicker = useCallback(() => {
    // Zone/button activation is also guarded: no second picker-driven
    // submission can start while one is in flight.
    if (inFlightRef.current || upload.isPending) {
      setBlocked({ kind: "picker" });
      return;
    }
    setBlocked(null);
    inputRef.current?.click();
  }, [upload.isPending]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  // Last attempted file (in flight or failed) — react-query keeps `variables`
  // after a failure, which is what the retry button resubmits.
  const attemptedFile = upload.variables ?? null;
  const uploadOutcomeKnown = upload.isError ? outcomeKnown(upload.error) : true;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={openPicker}
        aria-busy={upload.isPending || undefined}
        data-testid="upload-zone"
        className={`mb-2 cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        {/* Hidden from view and tab order; the button below is the keyboard
            and screen-reader affordance and opens the same picker. */}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onInput}
        />
        <p className="text-sm font-medium text-slate-700">
          Drag &amp; drop a file here, or choose a file to upload
        </p>
        <p className="mb-3 text-xs text-slate-400">
          PDF, image, text, email, spreadsheet — max 100 MB (server limit)
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // the surrounding zone opens the picker too
            openPicker();
          }}
          disabled={upload.isPending}
          aria-busy={upload.isPending}
          data-testid="upload-button"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {upload.isPending ? "Uploading…" : "Choose a file to upload"}
        </button>
        {upload.isPending && attemptedFile && (
          <p role="status" className="mt-2 text-sm text-blue-600" data-testid="upload-pending">
            Uploading “{attemptedFile.name}”…
          </p>
        )}
      </div>

      {/* A second attempt during an in-flight upload is visibly refused, not
          silently queued or duplicated (2026-09-11 review finding 1). */}
      {blocked && (
        <div className="mb-2" data-testid="upload-blocked">
          <Notice tone="info">
            <span className="font-medium">An upload is already in progress.</span>{" "}
            {blocked.kind === "file" ? (
              <span className="block sm:inline">
                “{blocked.name}” was not submitted — wait for the current upload to finish, then
                choose or drop it again.
              </span>
            ) : (
              <span className="block sm:inline">
                Wait for the current upload to finish before choosing another file.
              </span>
            )}
          </Notice>
        </div>
      )}

      {/* Failure is announced and attributable to the attempted file. When the
          outcome is provably known (4xx) the copy says so; on response loss it
          honestly reports uncertainty and offers refresh-before-retry. */}
      {upload.isError && attemptedFile && (
        <div className="mb-2" data-testid="upload-error">
          <Notice
            tone="error"
            action={
              <>
                <button
                  type="button"
                  onClick={refreshLists}
                  data-testid="upload-refresh"
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Refresh list first
                </button>
                <RetryButton
                  label={`Retry upload of ${attemptedFile.name}`}
                  onRetry={() => upload.mutate(attemptedFile)}
                  pending={upload.isPending}
                />
              </>
            }
          >
            <span className="font-medium">
              Upload failed for “{attemptedFile.name}”.
            </span>{" "}
            {uploadOutcomeKnown ? (
              <span className="block sm:inline">
                Reason: {describeError(upload.error)}. The server rejected the upload — the file
                was not added to the evidence list.
              </span>
            ) : (
              <span className="block sm:inline">
                Reason: {describeError(upload.error)}. The connection failed before the server’s
                answer arrived, so it is not known whether the file was added — the server may have
                accepted it before the failure. Refresh the list first to check before retrying:
                retrying an upload that did go through will create a duplicate copy.
              </span>
            )}
          </Notice>
        </div>
      )}

      {tooLargeName && (
        <div className="mb-2" data-testid="upload-too-large">
          <Notice tone="error">
            <span className="font-medium">“{tooLargeName}” is too large.</span>{" "}
            <span className="block sm:inline">
              The limit is 100 MB — choose a smaller file. Nothing was uploaded.
            </span>
          </Notice>
        </div>
      )}

      {uploadedName && !upload.isPending && (
        <p role="status" className="mb-2 text-sm text-green-700" data-testid="upload-success">
          Uploaded “{uploadedName}” — it now appears in the list below.
        </p>
      )}
    </div>
  );
}

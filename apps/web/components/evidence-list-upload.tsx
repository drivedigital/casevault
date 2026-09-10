"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Notice, RetryButton, describeError } from "./evidence-list-states";

// -----------------------------------------------------------------------------
// EU-L evidence upload (list page). Contract §EU-L (2)–(3).
//
// - Keyboard-operable: a real <button> opens the file picker (Tab + Enter /
//   Space), so upload never requires pointer or drag. Drag & drop still works.
// - Failures are visible and attributable to the attempted file, with a retry
//   that resubmits the SAME file. A failed upload is never treated as success.
// - Pending state disables the picker so a slow upload cannot be duplicated.
// - On success only the source-list caches are refreshed — matters, row
//   matter badges, ledger and intake queries are untouched (§EU-L 5).
// -----------------------------------------------------------------------------

// Mirrors the server guard (app config max_upload_bytes = 100 MB).
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function EvidenceUpload() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tooLargeName, setTooLargeName] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) =>
      api.uploadSource(file, { title: file.name.replace(/\.[^.]+$/, "") }),
    onSuccess: (_source, file) => {
      // Refresh ONLY the affected source-list queries (§EU-L 5).
      qc.invalidateQueries({ queryKey: ["sources"] });
      setTooLargeName(null);
      setUploadedName(file.name);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      setUploadedName(null);
      if (file.size > MAX_UPLOAD_BYTES) {
        // Client-side guard: retrying cannot succeed, so no retry is offered —
        // the message says what to do instead. Filters elsewhere are untouched.
        setTooLargeName(file.name);
        upload.reset();
        return;
      }
      setTooLargeName(null);
      upload.mutate(file);
    },
    [upload],
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

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

      {/* Failure is announced and attributable to the attempted file; retry
          resubmits the same file. Filter values live above and are untouched. */}
      {upload.isError && attemptedFile && (
        <div className="mb-2" data-testid="upload-error">
          <Notice
            tone="error"
            action={
              <RetryButton
                label={`Retry upload of ${attemptedFile.name}`}
                onRetry={() => upload.mutate(attemptedFile)}
                pending={upload.isPending}
              />
            }
          >
            <span className="font-medium">
              Upload failed for “{attemptedFile.name}”.
            </span>{" "}
            <span className="block sm:inline">
              Reason: {describeError(upload.error)}. The file was not added to the
              evidence list.
            </span>
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

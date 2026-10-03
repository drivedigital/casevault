// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.2 + §EU-D.3). New file inside the EU-D write set.
//
// Viewer for the evidence detail page. Contract rules implemented here:
// - The PDF preview NEVER points at the attachment endpoint: the old
//   <iframe src="/api/v1/sources/{id}/file"> triggered a download on page
//   load. The preview is opt-in (no eager buffering of large files) and goes
//   through a controlled fetch to a Blob object URL that is revoked on
//   source change / unmount / reload / dismiss.
// - Images render through a plain <img> (embedded images ignore
//   Content-Disposition, so no download can be triggered) with a labeled
//   error state and a download fallback.
// - Text-ish types show the extracted text of page 1 when pages exist; a
//   failed pages query is shown as an error with retry, never as a false
//   "no text" empty state.
// - A download fallback is available in every degraded state, and no
//   untrusted content is ever rendered via raw DOM insertion.

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorNote, WarningNote } from "@/components/evidence-detail-error";
import { DownloadOriginalButton } from "@/components/evidence-detail-download-button";
import { useFilePreview } from "@/lib/evidence-detail-files";
import type { Source } from "@/lib/types";

/** Browsers without a built-in PDF viewer (navigator.pdfViewerEnabled ===
 *  false, e.g. some embedded/headless builds) cannot render the blob and
 *  would silently download it instead — the labeled fallback below is shown
 *  for them (contract §EU-D.3 "native renderer support varies"). */
function usePdfViewerEnabled(sourceId: string) {
  // Resolved in an effect (not during render) so SSR prerendering and the
  // first client frame agree, then re-checked per source.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    setEnabled(typeof navigator !== "undefined" ? navigator.pdfViewerEnabled === true : false);
  }, [sourceId]);
  return enabled;
}

export interface EvidenceViewerProps {
  source: Source;
  /** OCR/extracted text of page 1, or null when no pages exist yet. */
  firstPageText: string | null;
  /** True once the pages query has succeeded at least once. */
  pagesLoaded: boolean;
  /** Error message from the pages query, or null. */
  pagesError: string | null;
  /** True while the pages query is fetching. */
  pagesPending: boolean;
  onRetryPages: () => void;
}

export function EvidenceViewer({
  source,
  firstPageText,
  pagesLoaded,
  pagesError,
  pagesPending,
  onRetryPages,
}: EvidenceViewerProps) {
  const { state: preview, load, dismiss } = useFilePreview(source.id);
  const pdfViewerEnabled = usePdfViewerEnabled(source.id);
  const [imageFailed, setImageFailed] = useState(false);

  // Reset the image error marker when navigating to another source.
  useEffect(() => setImageFailed(false), [source.id]);

  const isPdf = source.source_type === "pdf" || (source.mime_type?.includes("pdf") ?? false);
  const isImage =
    source.source_type === "image" || (source.mime_type?.startsWith("image/") ?? false);
  const isText =
    source.source_type === "text" ||
    source.source_type === "markdown" ||
    source.source_type === "email" ||
    source.source_type === "note" ||
    (source.mime_type?.startsWith("text/") ?? false);

  // Autoload PDF preview immediately on mount when supported
  useEffect(() => {
    if (isPdf && pdfViewerEnabled !== false && preview.phase === "idle") {
      void load();
    }
  }, [isPdf, pdfViewerEnabled, preview.phase, load]);

  // A failed pages refresh with data from an earlier success keeps the stale
  // text but labels it (never a silent false-healthy view).
  const pagesStale =
    pagesError !== null && pagesLoaded ? (
      <WarningNote title="Pages refresh failed — showing the last loaded text.">
        <span>
          {pagesError}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={onRetryPages}
            disabled={pagesPending}
          >
            {pagesPending ? "Retrying…" : "Retry"}
          </button>
        </span>
      </WarningNote>
    ) : null;

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Viewer</h2>
      </div>

      {isPdf ? (
        <div data-testid="viewer-pdf">
          <p className="mb-2 text-xs text-slate-500">
            Document preview autoloaded.
            {source.file_size_bytes
              ? ` File size: ${source.file_size_bytes.toLocaleString()} bytes.`
              : ""}
          </p>
          {pdfViewerEnabled === false ? (
            <div className="space-y-2" data-testid="preview-unsupported">
              <WarningNote title="Inline PDF preview is not available in this browser.">
                <span>
                  This browser reports no built-in PDF viewer
                  (navigator.pdfViewerEnabled is false), so a preview would
                  turn into an unwanted download. Download the original to
                  view the document.
                </span>
              </WarningNote>
              <DownloadOriginalButton source={source} />
            </div>
          ) : pdfViewerEnabled === null ? null : (
            <>
              {preview.phase === "idle" ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Preview not loaded.{" "}
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="font-medium text-blue-700 underline"
                    data-testid="load-preview"
                  >
                    Load preview
                  </button>{" "}
                  or use Download original above.
                </div>
              ) : preview.phase === "loading" ? (
                <div
                  role="status"
                  data-testid="preview-loading"
                  className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500"
                >
                  Loading preview…{" "}
                  <button
                    type="button"
                    onClick={dismiss}
                    className="font-medium text-blue-700 underline"
                    data-testid="cancel-preview"
                  >
                    Cancel
                  </button>
                </div>
              ) : preview.phase === "error" ? (
                <div className="space-y-2">
                  <ErrorNote
                    title="Preview failed"
                    message={preview.message}
                    onRetry={() => void load()}
                    pending={false}
                  />
                  <p className="text-xs text-slate-500">
                    The preview could not be loaded — the original file is still
                    available:
                  </p>
                  <DownloadOriginalButton source={source} />
                </div>
              ) : (
                <div data-testid="preview-ready">
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={dismiss}
                      className="text-xs text-slate-500 underline hover:text-slate-700"
                    >
                      Close preview
                    </button>
                  </div>
                  <iframe
                    src={preview.objectUrl}
                    title={`PDF preview — ${source.title}`}
                    className="h-[560px] w-full rounded border"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Rendered by your browser&apos;s built-in PDF viewer — support
                    varies by browser. If nothing displays, use{" "}
                    <span className="font-medium">Download original</span>.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      ) : isImage ? (
        <div data-testid="viewer-image">
          {pagesStale}
          {imageFailed ? (
            <div className="space-y-2">
              <ErrorNote
                title="Image preview failed"
                message="The image could not be loaded from the file endpoint (the stored file may be missing, or the API is unreachable)."
              />
              <DownloadOriginalButton source={source} />
            </div>
          ) : (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain
                  <img> on purpose: the byte-exact attachment endpoint must be
                  hit directly; next/image would re-encode through the
                  optimizer and add a provider dependency. */}
              <img
                key={source.id}
                src={api.sourceFileUrl(source.id)}
                alt={source.original_filename ?? source.title}
                loading="lazy"
                onError={() => setImageFailed(true)}
                className="max-h-[560px] rounded border object-contain"
                data-testid="viewer-image-img"
              />
            </div>
          )}
        </div>
      ) : isText || firstPageText !== null ? (
        <div data-testid="viewer-text" className="space-y-2">
          {pagesStale}
          <div className="max-h-[560px] overflow-auto rounded border bg-slate-50 p-3">
            {firstPageText ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {firstPageText}
              </pre>
            ) : pagesError !== null && !pagesLoaded ? (
              <ErrorNote
                title="Couldn't load extracted text"
                message={pagesError}
                onRetry={onRetryPages}
                pending={pagesPending}
              />
            ) : (
              <p className="text-sm text-slate-400">
                {pagesPending
                  ? "Loading pages…"
                  : "No extracted text yet. Depending on the file type, the ingest worker writes it (text-like files) or OCR is required (PDF/image). Use Reprocess OCR on the Status tab, or download the original."}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div data-testid="viewer-none" className="space-y-2">
          <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
            No inline viewer for this file type.
          </div>
          <DownloadOriginalButton source={source} />
        </div>
      )}
    </div>
  );
}

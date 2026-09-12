// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.2 "Download original" and §EU-D.3 "PDF preview"). New file inside
// the EU-D write set; the shipped sources API and shared hubs are untouched.
//
// The shipped GET /sources/{id}/file endpoint answers with
// `Content-Disposition: attachment`, so pointing an <iframe> at it (the old
// viewer) makes the browser download the file on page load. Every preview or
// download from the detail page therefore goes through a controlled fetch()
// that can surface errors, and PDF previews are opt-in to avoid eagerly
// buffering large files.
//
// Lifecycle rules (integrator review 2026-09-11):
// - The request timeout spans the COMPLETE body, not just response headers:
//   a response whose headers arrive but whose body stalls is aborted at the
//   bound with actionable feedback (the timer stays armed across
//   resp.blob()/resp.json()).
// - Preview loads are genuinely abortable: dismissal, source change, unmount
//   and reload all abort the in-flight fetch (which cancels the body stream)
//   and invalidate the generation, so a late result can never create an
//   unreclaimed object URL or update the wrong source's view. Object URLs
//   are created only after the generation check, so cancelled loads create
//   none at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Source } from "@/lib/types";
import { describeError, FileActionError } from "./evidence-detail-errors";

/** Per-request timeout for file fetches (download + preview), covering the
 *  complete response body, not just the headers. */
export const FILE_REQUEST_TIMEOUT_MS = 30_000;

/** How long a download anchor's object URL is kept alive after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 10_000;

type FileFetchOptions = {
  timeoutMs?: number;
  /** External cancellation (preview lifecycle). Aborting it aborts the
   *  underlying request — including a body that is still streaming. */
  signal?: AbortSignal;
};

interface FileFetchResult {
  response: Response;
  blob: Blob;
}

/**
 * Fetches a source file and reads its COMPLETE body under a single timeout:
 * the timer is only cleared after `blob()` settles, so a stalled body is
 * aborted at the bound instead of hanging forever. An external `signal`
 * aborts the same underlying request at any point.
 */
async function fetchSourceFileBytes(
  url: string,
  opts: FileFetchOptions = {},
): Promise<FileFetchResult> {
  const timeoutMs = opts.timeoutMs ?? FILE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        // Error-body read is also under the timeout: a stalled error body
        // must terminate too.
        const body = (await response.json()) as { detail?: unknown };
        if (body && typeof body.detail === "string") detail = body.detail;
      } catch {
        /* non-JSON error body — keep the status text */
      }
      throw new FileActionError(detail, response.status);
    }
    // Still under the armed timeout: a body whose headers arrived but which
    // never completes is aborted at the bound (integrator finding #1).
    const blob = await response.blob();
    return { response, blob };
  } catch (err) {
    if (err instanceof FileActionError) throw err;
    if (timedOut) {
      throw new FileActionError(
        `The file did not finish downloading within ${Math.round(timeoutMs / 1000)}s — the connection may be stalled mid-transfer. Retry, or check that the API is healthy.`,
        null,
        true,
      );
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new FileActionError("The file request was cancelled.", null);
    }
    throw err; // TypeError (network) and anything else: describeError() labels it.
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Best-effort filename extraction from a Content-Disposition header. */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      /* malformed escape sequence — fall through to the plain form */
    }
  }
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(header);
  if (quoted) return quoted[1].replace(/\\"/g, '"').trim() || null;
  const bare = /filename\s*=\s*([^;]+)/.exec(header);
  if (bare) return bare[1].trim() || null;
  return null;
}

export interface DownloadResult {
  filename: string;
  bytes: number;
}

/**
 * Explicit "Download original" for any source type (contract §EU-D.2):
 * fetches the shipped same-origin file endpoint, preserves the served bytes
 * and the server-declared filename, and hands the blob to the browser via a
 * temporary object URL. Unlike a bare <a href>, failures (missing stored
 * file → 410, API down, timeout — including a stalled body) are thrown so
 * the UI can show them.
 */
export async function downloadOriginalFile(
  source: Pick<Source, "id" | "original_filename">,
  opts: FileFetchOptions = {},
): Promise<DownloadResult> {
  if (typeof document === "undefined") {
    throw new FileActionError("Downloads require a browser environment.");
  }
  const { response, blob } = await fetchSourceFileBytes(api.sourceFileUrl(source.id), opts);
  const filename =
    parseContentDispositionFilename(response.headers.get("content-disposition")) ??
    source.original_filename ??
    `source-${source.id}`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the blob alive long enough for the browser to latch the download,
  // then release the memory.
  setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_URL_LIFETIME_MS);
  return { filename, bytes: blob.size };
}

export interface SourcePreviewBlob {
  /** The raw blob — the caller creates the object URL itself, so a result
   *  that arrives after the load was cancelled/superseded never creates a
   *  URL that would need reclaiming. */
  blob: Blob;
  contentType: string;
  sizeBytes: number;
}

/**
 * Controlled fetch for the opt-in PDF preview (contract §EU-D.3): returns
 * the file as a Blob (no Content-Disposition semantics, so rendering it can
 * never trigger a download) under the body-spanning timeout. The caller owns
 * object-URL creation and revocation.
 */
export async function fetchPreviewBlob(
  source: Pick<Source, "id">,
  opts: FileFetchOptions = {},
): Promise<SourcePreviewBlob> {
  const { response, blob } = await fetchSourceFileBytes(api.sourceFileUrl(source.id), opts);
  return {
    blob,
    contentType: response.headers.get("content-type") ?? blob.type ?? "application/octet-stream",
    sizeBytes: blob.size,
  };
}

export type PreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; objectUrl: string; contentType: string; sizeBytes: number }
  | { phase: "error"; message: string };

/**
 * Opt-in preview lifecycle (contract §EU-D.3 + integrator review): load on
 * demand, label loading/error, and abort + invalidate pending work on
 * dismissal, source change, unmount and reload. Object URLs are created only
 * after the generation check (cancelled loads create none) and revoked on
 * every transition away from "ready".
 */
export function useFilePreview(sourceId: string) {
  const [state, setState] = useState<PreviewState>({ phase: "idle" });
  const generationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const trackedSourceIdRef = useRef(sourceId);

  const revoke = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  /** Abort the in-flight preview load (cancels the body stream) and
   *  invalidate its generation so the late result is dropped silently. */
  const abortPendingLoad = useCallback(() => {
    generationRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
  }, []);

  // Navigating to another source without unmounting this component aborts
  // any pending load, revokes the old URL and resets the preview.
  useEffect(() => {
    if (trackedSourceIdRef.current === sourceId) return;
    trackedSourceIdRef.current = sourceId;
    abortPendingLoad();
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;
    setState({ phase: "idle" });
  }, [sourceId, abortPendingLoad, revoke]);

  // Unmount: abort any pending load AND invalidate it — a late blob must not
  // create an object URL nobody will revoke (integrator finding #2).
  useEffect(
    () => () => {
      generationRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    },
    [],
  );

  const load = useCallback(async () => {
    // A reload supersedes any pending load: cancel it before starting.
    abortPendingLoad();
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;

    const generation = generationRef.current;
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setState({ phase: "loading" });
    try {
      const preview = await fetchPreviewBlob({ id: sourceId }, { signal: controller.signal });
      if (generationRef.current !== generation) return; // superseded — no URL, no state
      const objectUrl = URL.createObjectURL(preview.blob);
      objectUrlRef.current = objectUrl;
      setState({
        phase: "ready",
        objectUrl,
        contentType: preview.contentType,
        sizeBytes: preview.sizeBytes,
      });
    } catch (err) {
      if (generationRef.current !== generation) return; // cancelled/superseded
      setState({ phase: "error", message: describeError(err) });
    } finally {
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
    }
  }, [sourceId, abortPendingLoad, revoke]);

  /** Dismiss the preview — also the "Cancel" action while a load is pending:
   *  aborts the fetch and drops the late result. */
  const dismiss = useCallback(() => {
    abortPendingLoad();
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;
    setState({ phase: "idle" });
  }, [abortPendingLoad, revoke]);

  return { state: state, load, dismiss };
}

// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.2 "Download original" and §EU-D.3 "PDF preview"). New file inside
// the EU-D write set; the shipped sources API and shared hubs are untouched.
//
// The shipped GET /sources/{id}/file endpoint answers with
// `Content-Disposition: attachment`, so pointing an <iframe> at it (the old
// viewer) makes the browser download the file on page load. Every preview or
// download from the detail page therefore goes through a controlled fetch()
// that can surface errors, and PDF previews are opt-in to avoid eagerly
// buffering large files. Object URLs are revoked on source change, unmount,
// reload and dismiss.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Source } from "@/lib/types";
import { describeError, FileActionError } from "./evidence-detail-errors";

/** Per-request timeout for file fetches (download + preview). */
export const FILE_REQUEST_TIMEOUT_MS = 30_000;

/** How long a download anchor's object URL is kept alive after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 10_000;

type FileFetchOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

async function fetchSourceFileResponse(
  url: string,
  opts: FileFetchOptions = {},
): Promise<Response> {
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
    const resp = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const body = (await resp.json()) as { detail?: unknown };
        if (body && typeof body.detail === "string") detail = body.detail;
      } catch {
        /* non-JSON error body — keep the status text */
      }
      throw new FileActionError(detail, resp.status);
    }
    return resp;
  } catch (err) {
    if (err instanceof FileActionError) throw err;
    if (timedOut) throw new FileActionError("The file request timed out.", null, true);
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
 * file → 410, API down, timeout) are thrown so the UI can show them.
 */
export async function downloadOriginalFile(
  source: Pick<Source, "id" | "original_filename">,
  opts: FileFetchOptions = {},
): Promise<DownloadResult> {
  if (typeof document === "undefined") {
    throw new FileActionError("Downloads require a browser environment.");
  }
  const resp = await fetchSourceFileResponse(api.sourceFileUrl(source.id), opts);
  const blob = await resp.blob();
  const filename =
    parseContentDispositionFilename(resp.headers.get("content-disposition")) ??
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

export interface SourcePreview {
  objectUrl: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Controlled fetch for the opt-in PDF preview (contract §EU-D.3): returns a
 * Blob object URL with no Content-Disposition semantics, so rendering it can
 * never trigger a download. The caller must revoke the URL when done.
 */
export async function fetchPreviewBlob(
  source: Pick<Source, "id">,
  opts: FileFetchOptions = {},
): Promise<SourcePreview> {
  const resp = await fetchSourceFileResponse(api.sourceFileUrl(source.id), opts);
  const blob = await resp.blob();
  return {
    objectUrl: URL.createObjectURL(blob),
    contentType: resp.headers.get("content-type") ?? blob.type ?? "application/octet-stream",
    sizeBytes: blob.size,
  };
}

export type PreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; objectUrl: string; contentType: string; sizeBytes: number }
  | { phase: "error"; message: string };

/**
 * Opt-in preview lifecycle (contract §EU-D.3): load on demand, label
 * loading/error, revoke the object URL on source change, unmount, reload or
 * dismiss, and drop results from superseded loads.
 */
export function useFilePreview(sourceId: string) {
  const [state, setState] = useState<PreviewState>({ phase: "idle" });
  const generationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const trackedSourceIdRef = useRef(sourceId);

  const revoke = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  // Navigating to another source without unmounting this component resets
  // the preview and revokes the old URL.
  useEffect(() => {
    if (trackedSourceIdRef.current === sourceId) return;
    trackedSourceIdRef.current = sourceId;
    generationRef.current += 1; // in-flight loads for the old source are dropped
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;
    setState({ phase: "idle" });
  }, [sourceId, revoke]);

  // Revoke whatever is live when the viewer unmounts.
  useEffect(() => () => revoke(objectUrlRef.current), [revoke]);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;
    setState({ phase: "loading" });
    try {
      const preview = await fetchPreviewBlob({ id: sourceId });
      if (generationRef.current !== generation) {
        revoke(preview.objectUrl); // superseded by a newer load / source change
        return;
      }
      objectUrlRef.current = preview.objectUrl;
      setState({ phase: "ready", ...preview });
    } catch (err) {
      if (generationRef.current !== generation) return;
      setState({ phase: "error", message: describeError(err) });
    }
  }, [sourceId, revoke]);

  const dismiss = useCallback(() => {
    generationRef.current += 1;
    revoke(objectUrlRef.current);
    objectUrlRef.current = null;
    setState({ phase: "idle" });
  }, [revoke]);

  return { state: state, load, dismiss };
}

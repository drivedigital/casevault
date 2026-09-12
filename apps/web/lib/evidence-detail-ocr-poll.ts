// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.5). New file inside the EU-D write set.
//
// OCR reprocess watch: POST /sources/{id}/reprocess answering 202 means the
// request was ACCEPTED, not that extraction finished. `queued:false` never
// starts a loop (the reason is shown instead). For `queued:true` the persisted
// source is polled through the existing GET /sources/{id} (no fabricated job
// endpoint) every OCR_POLL_INTERVAL_MS, with a total budget of
// OCR_POLL_BUDGET_MS per reprocess request. Terminal statuses stop the loop
// and refresh the source, pages and list caches. On timeout the loop stops
// and reports "still unconfirmed" — a timeout is never claimed as a job
// failure.
//
// Cancellation rules (integrator review 2026-09-11):
// - Polling is GENUINELY abortable: every status request is made through an
//   AbortController (api.getSource forwards the signal), so a slow or hung
//   request is terminated, not merely ignored. Promise timeouts alone would
//   leave the request alive.
// - At most ONE polling request is ever in flight: the loop is strictly
//   sequential (the next request starts only after the previous one settles
//   and the cadence pause completes).
// - The per-request bound is capped by the REMAINING total budget, so no
//   request can outlive the 120s deadline.
// - Unmount, navigation to another source, a new watch and stop() all abort
//   the in-flight request and the cadence pause; a watch started by a late
//   mutation callback after unmount never runs (mounted guard). Stale
//   results are dropped by the abort/generation checks after every await.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Source } from "@/lib/types";
import { describeError } from "./evidence-detail-errors";

/** Status-check cadence (contract: default 2s). */
export const OCR_POLL_INTERVAL_MS = 2_000;
/** Total automatic-polling budget per reprocess request (contract: 120s). */
export const OCR_POLL_BUDGET_MS = 120_000;
/** Per-request settle bound: a hung status request cannot block the loop —
 *  and never gets more than the remaining total budget. */
export const OCR_POLL_REQUEST_TIMEOUT_MS = 10_000;

export type OcrTerminalStatus = "complete" | "skipped" | "failed";

export function isOcrTerminalStatus(status: string): status is OcrTerminalStatus {
  return status === "complete" || status === "skipped" || status === "failed";
}

export type OcrWatch =
  | { phase: "idle" }
  | { phase: "watching"; since: number; jobId: string | null }
  | { phase: "done"; outcome: OcrTerminalStatus; since: number }
  | { phase: "timeout"; since: number };

/** Thrown when an individual status request hits its settle bound. */
class PollRequestTimeout extends Error {}

interface OwnedWatch {
  sourceId: string;
  watch: OcrWatch;
}

/** One status request: aborted by the settle bound OR by the watch-level
 *  signal (navigation/unmount/new watch). The bound never exceeds the
 *  remaining total budget. */
async function pollSourceStatus(
  sourceId: string,
  boundMs: number,
  watchSignal: AbortSignal,
): Promise<Source> {
  const controller = new AbortController();
  const onWatchAbort = () => controller.abort();
  if (watchSignal.aborted) controller.abort();
  else watchSignal.addEventListener("abort", onWatchAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, boundMs);
  try {
    // Integrator-approved api.getSource(id, signal?) — real cancellation.
    return await api.getSource(sourceId, controller.signal);
  } catch (err) {
    if (watchSignal.aborted) throw err; // loop drops it via its own signal check
    if (timedOut) throw new PollRequestTimeout();
    throw err; // real network error — surfaced by describeError()
  } finally {
    clearTimeout(timer);
    watchSignal.removeEventListener("abort", onWatchAbort);
  }
}

/** Cadence pause that ends early when the watch is cancelled. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface UseOcrWatchArgs {
  sourceId: string;
  /** Invoked once when a terminal status is observed; refresh caches here. */
  onTerminal: (outcome: OcrTerminalStatus) => void;
}

export function useOcrWatch({ sourceId, onTerminal }: UseOcrWatchArgs) {
  // State is tagged with the source it belongs to; anything left over from a
  // previous source is derived away (no setState-in-cleanup races).
  const [run, setRun] = useState<OwnedWatch>({ sourceId, watch: { phase: "idle" } });
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  // Unmount OR navigation to another source: abort the in-flight request and
  // the cadence pause. (The effect re-runs when sourceId changes.)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [sourceId]);

  const start = useCallback(
    (jobId: string | null) => {
      stop(); // never two loops at once
      // A late reprocess response arriving after unmount must not spawn a
      // detached polling loop (integrator review: delayed responses across
      // navigation).
      if (!mountedRef.current) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      const signal = controller.signal;
      const startedAt = Date.now();
      setError(null);
      setRun({ sourceId, watch: { phase: "watching", since: startedAt, jobId } });

      void (async () => {
        const deadline = startedAt + OCR_POLL_BUDGET_MS;
        while (!signal.aborted) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break; // budget exhausted — stop automatically
          let outcome: OcrTerminalStatus | null = null;
          try {
            // Bound = min(per-request settle, remaining budget): no request
            // can outlive the total deadline.
            const source = await pollSourceStatus(
              sourceId,
              Math.min(remaining, OCR_POLL_REQUEST_TIMEOUT_MS),
              signal,
            );
            if (signal.aborted) return;
            if (isOcrTerminalStatus(source.ocr_status)) {
              outcome = source.ocr_status;
            } else if (
              source.ocr_status !== "queued" &&
              source.processing_status === "failed"
            ) {
              // The ocr_source job marks processing_status=failed on error
              // while ocr_status stays "running"; once the stage has left
              // "queued" that combination means the job died. A stale
              // processing_status=failed from an earlier ingest failure
              // (ocr_status still "queued") is NOT treated as terminal.
              outcome = "failed";
            }
            setError(null);
          } catch (err) {
            if (signal.aborted) return;
            setError(
              err instanceof PollRequestTimeout
                ? "A status check timed out — still watching; the next check is automatic."
                : describeError(err),
            );
          }
          if (signal.aborted) return;
          if (outcome !== null) {
            setRun({ sourceId, watch: { phase: "done", outcome, since: startedAt } });
            onTerminalRef.current(outcome);
            return;
          }
          await sleepAbortable(OCR_POLL_INTERVAL_MS, signal);
        }
        if (!signal.aborted) {
          // Timeout ≠ failure: the job may still be running (contract
          // §EU-D.5). Automatic checks stop; manual refresh takes over.
          setRun({ sourceId, watch: { phase: "timeout", since: startedAt } });
        }
      })();
    },
    [sourceId, stop],
  );

  // Derived per-source state: a watch left over from a previous source is
  // reported as idle for the current one.
  const activeWatch: OcrWatch = run.sourceId === sourceId ? run.watch : { phase: "idle" };
  const activeError = run.sourceId === sourceId ? error : null;

  return { watch: activeWatch, error: activeError, start, stop };
}

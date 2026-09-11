// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.5). New file inside the EU-D write set.
//
// OCR reprocess watch: POST /sources/{id}/reprocess answering 202 means the
// request was ACCEPTED, not that extraction finished. `queued:false` never
// starts a loop (the reason is shown instead). For `queued:true` the persisted
// source is polled through the existing GET /sources/{id} (no fabricated job
// endpoint) every OCR_POLL_INTERVAL_MS, with at most one request in flight,
// a per-request settle timeout, and a total budget of OCR_POLL_BUDGET_MS per
// reprocess request. Terminal statuses stop the loop and refresh the source,
// pages and list caches. On timeout the loop stops and reports
// "still unconfirmed" — a timeout is never claimed as a job failure.
// Unmount or navigation to another source cancels everything; stale
// responses are dropped by generation guards.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { describeError } from "./evidence-detail-errors";

/** Status-check cadence (contract: default 2s). */
export const OCR_POLL_INTERVAL_MS = 2_000;
/** Total automatic-polling budget per reprocess request (contract: 120s). */
export const OCR_POLL_BUDGET_MS = 120_000;
/** Per-request settle bound: a hung status request cannot block the loop. */
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

/** Resolves with the promise's outcome, or rejects after `ms` (no abort of
 *  the underlying fetch — api.getSource does not accept a signal, and the
 *  result of a superseded request is dropped by the generation guard). */
class StatusPollTimeout extends Error {}

function settle<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StatusPollTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface UseOcrWatchArgs {
  sourceId: string;
  /** Invoked once when a terminal status is observed; refresh caches here. */
  onTerminal: (outcome: OcrTerminalStatus) => void;
}

export function useOcrWatch({ sourceId, onTerminal }: UseOcrWatchArgs) {
  const [watch, setWatch] = useState<OcrWatch>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationCounterRef = useRef(0);
  const activeGenerationRef = useRef<number | null>(null);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cancelTimer();
    activeGenerationRef.current = null; // generation guard drops stale callbacks
  }, [cancelTimer]);

  // Unmount or navigation to another source: cancel the loop and reset the
  // reported state. Runs on mount too, which is a harmless idle reset.
  useEffect(() => {
    setWatch({ phase: "idle" });
    setError(null);
    return () => stop();
  }, [sourceId, stop]);

  const start = useCallback(
    (jobId: string | null) => {
      stop(); // never two loops at once
      const generation = ++generationCounterRef.current;
      activeGenerationRef.current = generation;
      const startedAt = Date.now();
      setError(null);
      setWatch({ phase: "watching", since: startedAt, jobId });
      const isCurrent = () => activeGenerationRef.current === generation;

      const run = async () => {
        if (!isCurrent()) return;
        if (Date.now() - startedAt >= OCR_POLL_BUDGET_MS) {
          activeGenerationRef.current = null;
          // Timeout ≠ failure: the job may still be running (contract §EU-D.5).
          setWatch({ phase: "timeout", since: startedAt });
          return;
        }
        let outcome: OcrTerminalStatus | null = null;
        try {
          const source = await settle(api.getSource(sourceId), OCR_POLL_REQUEST_TIMEOUT_MS);
          if (!isCurrent()) return;
          if (isOcrTerminalStatus(source.ocr_status)) {
            outcome = source.ocr_status;
          } else if (
            source.ocr_status !== "queued" &&
            source.processing_status === "failed"
          ) {
            // The ocr_source job marks processing_status=failed on error while
            // ocr_status stays "running"; once the stage has left "queued" that
            // combination means the job died. A stale processing_status=failed
            // from an earlier ingest failure (ocr_status still "queued") is NOT
            // treated as terminal.
            outcome = "failed";
          }
          setError(null);
        } catch (err) {
          if (!isCurrent()) return;
          setError(
            err instanceof StatusPollTimeout
              ? "Status check timed out — still watching."
              : describeError(err),
          );
        }
        if (!isCurrent()) return;
        if (outcome !== null) {
          activeGenerationRef.current = null;
          setWatch({ phase: "done", outcome, since: startedAt });
          onTerminalRef.current(outcome);
          return;
        }
        timerRef.current = setTimeout(() => {
          void run();
        }, OCR_POLL_INTERVAL_MS);
      };
      void run();
    },
    [sourceId, stop],
  );

  return { watch, error, start, stop };
}

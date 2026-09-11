// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0).
//
// Human-readable, non-leaking descriptions of client-side failures for the
// evidence detail page. The API's `detail` string is already a curated
// message, so it can be shown as-is; raw stack traces never reach the user.
// New file inside the EU-D write set — shared hubs stay untouched.

import { ApiError } from "@/lib/api";

/** Failure raised by the EU-D file helpers (download / preview fetches). */
export class FileActionError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly timedOut = false,
  ) {
    super(message);
    this.name = "FileActionError";
  }
}

/** Maps any thrown client-side error to one honest, user-safe sentence. */
export function describeError(err: unknown): string {
  if (err instanceof FileActionError) {
    if (err.timedOut) return "The file request timed out.";
    return err.message || "The file could not be fetched.";
  }
  if (err instanceof ApiError) {
    return err.message || `Request failed (HTTP ${err.status}).`;
  }
  // fetch() rejects with a TypeError when the request cannot be issued at
  // all (API down, DNS, offline) — label it instead of showing "Failed to
  // fetch", which reads like a bug.
  if (err instanceof TypeError) {
    return "Network error — the API could not be reached.";
  }
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return "Request timed out.";
    }
    return err.message || "Unexpected error.";
  }
  return "Unexpected error.";
}

// EU-ERR — deliberate error-disclosure boundary for the evidence LIST
// surfaces (rendered via apps/web/components/evidence-list-states.tsx).
// Contract §EU-L (1)–(3): failures stay visible, attributable and retryable
// "without leaking raw server traces".
//
// Problem this fixes: describeError() used to return ANY Error.message
// verbatim. An API error's `detail` is untrusted transport payload — not a
// curated contract surface — so a server-side 500 (or anything in between)
// could place a traceback, SQL statement or internal path in `detail` and
// have it rendered verbatim in the UI. EU-V's L3.2–L3.4 injected-500 browser
// case observed exactly that; the earlier in-file comment claiming the API
// only ever sends a curated `detail` string was wrong and is corrected with
// this change.
//
// Trust rule (a deliberate mapping — NOT blanket trust in `detail`, and NOT
// regex redaction of arbitrary text):
//   1. Known server validation outcomes pass through ONLY via an exact
//      allowlist of the curated sentences the API actually emits on these
//      surfaces (apps/api/app/services/source_service.py). Each maps to UI
//      copy authored HERE, so even an allowlisted response contributes no
//      server-controlled characters to the DOM. The size-limit pattern's only
//      free part is a digit run (`\d{1,4}`) used as an allowlist shape check —
//      no free text is captured, matched or rendered.
//   2. Everything else — 5xx bodies, unknown/arbitrary 4xx details, statusText
//      fallbacks, programmer errors, injected or malformed payloads — gets a
//      generic, actionable message that may cite the HTTP status (a safe,
//      non-attacker-controlled integer) but never any response-body text.
//   3. Connection-level failures get their own honest message; the raw
//      browser text ("Failed to fetch") is not shown.
//
// Failure states remain failures (never empty/success); callers keep their
// attribution (which file/row/operation), accessible retry controls, pending
// guards, and the 4xx-vs-5xx outcome-uncertainty logic in outcomeKnown(),
// which this module does not change.
//
// Pure module: no React, no fetch, no DOM. Falls back to generic text on any
// unexpected shape instead of throwing.

import { ApiError } from "@/lib/api";

export type ListErrorKind =
  | "trusted-validation" // allowlisted known server validation outcome
  | "server-error" // 5xx (or unknown-status ApiError)
  | "rejected-4xx" // 4xx not in the allowlist
  | "network" // request never reached a server
  | "timeout" // request cancelled/timed out before an answer
  | "generic"; // anything else (unexpected error shapes included)

export interface MappedListError {
  kind: ListErrorKind;
  /** User-safe, actionable message. Authored in this file; never embeds
   *  server/network-provided text (digits parsed from the allowlisted
   *  size-limit sentence are the only exception). */
  message: string;
  /** HTTP status when a real server response produced the error, else null. */
  status: number | null;
}

/** Fallback for anything unexpected. */
const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const SERVER_ERROR_MESSAGE =
  "The server had a problem with this request. Please try again.";
const NETWORK_MESSAGE =
  "Network error — the server could not be reached. Check the connection and try again.";
const TIMEOUT_MESSAGE =
  "The request timed out before the server answered. Please try again.";

/** The curated empty-upload validation sentence emitted by
 *  apps/api/app/services/source_service.py (HTTP 422). Exact match only. */
const EMPTY_UPLOAD_DETAIL = "Uploaded file is empty.";

/** The curated oversize-upload sentence emitted by the same service
 *  (HTTP 413): `File exceeds the {N} MB upload limit.` — anchored, and the
 *  ONLY free part is the numeric limit, which we echo as digits. */
const SIZE_LIMIT_DETAIL = /^File exceeds the (\d{1,4}) MB upload limit\.$/;

/** Known validation outcome → fixed UI copy authored here. */
function trustedValidationMessage(status: number, detail: string): string | null {
  if (status === 422 && detail === EMPTY_UPLOAD_DETAIL) {
    return "The uploaded file was empty — nothing was stored. Choose a file with content and try again.";
  }
  const sizeLimit = status === 413 ? SIZE_LIMIT_DETAIL.exec(detail) : null;
  if (sizeLimit) {
    return `The file exceeds the ${sizeLimit[1]} MB upload limit — choose a smaller file.`;
  }
  return null;
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/** Map any thrown value from a list-surface query/mutation to safe,
 *  attributable, actionable user text. Total function: never throws. */
export function mapListError(error: unknown): MappedListError {
  if (error instanceof ApiError) {
    const status = typeof error.status === "number" ? error.status : null;
    const detail = typeof error.message === "string" ? error.message : "";
    if (status !== null && status >= 400 && status < 500) {
      const trusted = trustedValidationMessage(status, detail);
      if (trusted !== null) {
        return { kind: "trusted-validation", message: trusted, status };
      }
      // Unknown 4xx: the outcome is proven (the server answered), but the
      // body text is untrusted — name only the status.
      return {
        kind: "rejected-4xx",
        message: `The server rejected this request (HTTP ${status}).`,
        status,
      };
    }
    // 5xx, or an ApiError without a usable status: the answer proves nothing
    // about content and the body is untrusted — generic server-error copy.
    return { kind: "server-error", message: SERVER_ERROR_MESSAGE, status };
  }
  if (isTimeout(error)) {
    return { kind: "timeout", message: TIMEOUT_MESSAGE, status: null };
  }
  // fetch() rejects with a TypeError when the request cannot be issued at
  // all (API down, DNS, offline). Label it honestly instead of rendering the
  // browser's raw "Failed to fetch".
  if (error instanceof TypeError) {
    return { kind: "network", message: NETWORK_MESSAGE, status: null };
  }
  return { kind: "generic", message: GENERIC_MESSAGE, status: null };
}

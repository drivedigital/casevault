# Evidence UI closure — integration review (2026-09-11)

Base: `ab0ee23`. Reviewed EU-L `ab9164b` (PR 17), EU-D `5e7036c`
(PR 18), EU-V `a434ae1` (PR 19). **Changes requested; none integrated.**

Local checkout metadata was stale at 631b85a while restored files matched
remote ab0ee23 byte-for-byte (temporary-index comparison). Backed up restored
tracked/untracked content outside the repo, reconciled metadata without dropping
files. Candidate merges were aborted after testing; product tree unchanged.

## EU-L — PR 17

Independent strict candidate gate: **119 passed**, migration round-trip, ruff,
web lint/typecheck/build. Browser reproduction (Chromium 152, actual built UI,
injected transport responses; no actual API/data):
1. Hold POST /sources response; drop synthetic-first.txt.
2. Choose-file button becomes disabled.
3. Drop synthetic-second.txt while first is pending.
4. Observe **two concurrent POST /sources requests**.

Blocking: `handleFile`, `onDrop`, and surrounding `openPicker` lack pending
protection; disabling only the button does not protect other entry paths. Add
same-tick-safe in-flight guard across all entry paths plus regression coverage.
Also fix response-loss uncertainty copy (network errors do not prove upload was
not committed or row unchanged), title-only search label, and investigate first
keyboard activation instead of hiding it behind three attempts in acceptance.

## EU-D — PR 18

Independent strict candidate gate: **119 passed**, migrations, ruff, web checks.
Two targeted real-browser/app reproductions using injected slow Response stream:
- Headers resolve immediately but body never ends. After advancing browser clock
  31 seconds, preview remains Loading; fetch AbortSignal is not aborted.
  `fetchSourceFileResponse` clears timeout before callers await `resp.blob()`.
- Start preview, navigate Back to evidence, then finish the body: **one object URL
  created, zero revoked** after viewer unmount. Cleanup revokes only existing URL;
  it neither invalidates generation nor aborts a pending preview.

Fix timeout/cancellation through body consumption, invalidate/abort on unmount,
source change, dismiss, and revoke every late blob URL. Add browser regressions.
Source review also shows OCR Promise timeout never aborts its underlying request,
then next poll may start while prior fetch is still pending. This violates the
one-request/cancellation acceptance rule. Bound by remaining total budget and
use real abort. A narrow additive optional AbortSignal on `api.getSource` is
approved (EU-D only); all other shared-client edits still require approval.
Delayed save/reprocess responses must be covered across source navigation.

First browser harness attempt hit the sandbox Chromium single-process close
limitation; repeated with ordinary headless launch flags and both findings
reproduced successfully. No native PDF renderer proof claimed: PDF capability
was injected solely to exercise app fetch/object-URL lifecycle without rendering.

## EU-V — PR 19

This deliverable is checklist/tooling preparation, not final acceptance specs.
Pinned isolated Playwright approach approved in principle; no manifest/CI changes.
Blocking findings:
1. Existing managed-browser path reproducibly throws ReferenceError from bare
   `require()` with top-level await in generated .mjs. Resolver only knows Linux
   paths and cannot support advertised Mac instructions. Use platform-aware
   managed executable lookup or explicit override, clear unavailable error,
   and actual managed install for playwright-download; Linux fallback only Linux.
2. Injected migration failure in stack startup gives created DB count=1, dropped
   count=0, no state file. Startup has no rollback; stop cannot recover. Failure
   paths need transactional/incremental owned-resource cleanup. Stop must preserve
   actionable state and fail on incomplete cleanup, not claim success.
3. Unconditional `rm -rf tests/browser/node_modules` may delete another owner's
   install. Remove only an owned managed symlink or refuse; preserve directories.
4. Full DSNs printed on startup/errors; redact. Credential-bearing state requires
   restricted permissions; machine-readable env output must be opt-in and quoted.
5. Bind browser-facing servers to 0.0.0.0 for Arena previews; maintain relative
   browser API/proxy contract; fix printed Python script invocation.

Injected startup probe used stubs only (no database/process created). Existing
browser-path repro used a dummy managed-browser tree (no executable launched).
No claim the full EU-V stack was independently verified in this turn.

## Next steps / coordination

Comments with fix requests posted on PRs 17/18/19. Agents remain on their assigned
branches; push revisions to same PRs. D/L stay disjoint except EU-D's explicitly
approved optional getSource signal addition. EU-V final behavior specs/run wait
for corrected D+L integration; preparation completion is not acceptance closure.
Local Mac/native PDF rendering remains EU-M's separate responsibility.

Diagnostics and scratch tools live outside tracked repo. Temporary review web
servers/browser processes stopped; no persistent product services left running.
No new dependency manifests, lockfiles, feature changes, or skipped-assertion
workarounds added to integration.

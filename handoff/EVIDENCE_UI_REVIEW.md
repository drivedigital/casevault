# Evidence UI closure — integration review (2026-09-11)

**Current status (2026-09-12): EU-D revision b041694 merged as `c8c7d27`.**
EU-L still awaits the retry-lock correction; EU-V is working; EU-M remains on
owner-requested hold. Earlier findings below are historical; see latest sections.

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

## EU-L revision re-review — 2026-09-12

Reviewed PR 17 revision `6bd3cdfd77718c3f41bb87a752fd668d72b2bb5c` on
integration `7ed39b1`. Strict independent gate: **119 passed, no skips**, migration
round-trip, Ruff, web lint/typecheck/build pass (pre-existing detail img warning).
Original same-tick double-drop now produces ONE POST. Response-loss uncertainty
copy and title-search label corrected. Agent reports 16 browser tests; that full
suite was not independently rerun here.

**Remaining blocker independently reproduced:** after an injected initial upload
failure, click the Retry button and dispatch another synthetic file drop in the
same browser evaluation/task. Two uploads remain pending (three POSTs total,
including failed original). Retry invokes `upload.mutate(attemptedFile)` directly,
bypassing the synchronous inFlightRef guard used by normal submissions. Fix by
routing retry through the same guarded path; cover retry+drop/rapid retries and
lock release after success/failure. PR comment:
https://github.com/drivedigital/casevault/pull/17#issuecomment-5644130294

Proof: actual production Next UI and Chromium 152; labelled injected route abort
and held responses, no real backend/data in browser probe. Scratch script
`/home/user/eu-review-tools/list-revision-probe.mjs`; strict gate log
`/home/user/eul-revision-gate.log` (outside Git). Candidate aborted, no merge.
Review web/browser stopped. Restored stale Git metadata again reconciled only
after backup and temporary-index equality check against remote integration.

**Owner sequencing decision:** EU-M and local environment startup are on hold
until a substantive integrated testing point. Do not request Phase A testing now.
Integrator will supply an exact corrected D+L integrated SHA and focused checklist
when useful. Native browser/PDF and exact Mac worker reproduction remain unverified
until then, not waived.


## EU-D revision accepted and merged — 2026-09-12

Reviewed `b0416943c6f08a8a3360b13f523693b310f0bde0`, PR 18, against
integration `0f9e498`. Merged as **c8c7d27**. EU-D write set honored; the only
shared-client change is the approved optional getSource AbortSignal.

Independent proof on candidate product tree (unchanged by merge):
- Strict gate before AND after merge: **119 passed, no skips**, migrations
  upgrade/downgrade/upgrade, Ruff, web lint/typecheck/build all green.
- Full EU-D Playwright suite without Redis: **25 passed, 2 skipped** (both
  require worker). Runtime ~3.1m, including real-time 120s polling test.
- Then enabled isolated Redis 6397 + standard Linux RQ Worker: explicitly ran
  the two worker-dependent tests: **2 passed**, no skips. This was a targeted
  worker run, not a second full 27-test suite.
- Real API/browser positive paths: downloads byte-equal for PDF/image, safe
  PDF fallback, Status draft initialization/refetch/save/reset, pages, links,
  queued:false, and real-worker complete (TXT)/skipped (PDF) refresh.
- Labelled transport/clock/capability injection: errors/retries, stalled file
  bodies aborted at 30s, cancelled/late preview cleanup, one active polling
  request with actual abort and remaining-budget bound, delayed mutation
  responses after navigation. No native PDF rendering claimed.
- Independently read RQ payloads and corresponding persisted source state:
  TXT job 7b8d491d-19eb-4a13-bda2-a1b29d4733fa -> result status complete,
  ocr_status complete, page_count 1; persisted OCR/processing complete.
  PDF job cf64e0a4-4059-4cb0-9997-5285cb027b60 -> result status complete,
  ocr_status skipped; persisted OCR skipped / processing complete.

Environment: isolated pinned Playwright 1.63.0, Chromium 152, real production
Next 14.2.15, disposable Postgres database casevault_eud_review, synthetic files
outside repo, Redis 6.2.14 / RQ 2.12.0 Linux Worker. No manifest/lockfile/CI edits.
Scratch configs/logs outside Git: /home/user/eu-review-tools/d.config.mjs,
/home/user/d-gate.log, /home/user/d-postmerge-gate.log,
/home/user/d-browser-workerless.log, /home/user/d-browser-worker.log.

Two initial API setup attempts failed before launch due to scratch DSN path
rewriting/percent interpolation; corrected by replacing only the URL path while
preserving its original socket query. No product changes needed. Temporary web,
API, worker and queue stopped; disposable browser DB/storage removed, embedded
Postgres stopped after final gate. Restored Git metadata was backed up and
reconciled only after temporary-index equality with remote 0f9e498.

EU-V can incorporate c8c7d27 now, but final integrated acceptance still waits for
corrected EU-L. EU-M remains on hold; no request to start the local environment.

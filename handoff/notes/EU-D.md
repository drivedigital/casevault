# EU-D — Evidence detail-page completion
Contract: docs/contracts/evidence_ui_closure.md v1.0 (+ authorized integration
amendment 2026-09-11)

Branch `arena/01a08cdf-casevault`. Base = integration tip `ab0ee23`;
integration commit `7ed39b1` ("Integrator: review evidence closure PRs and
request lifecycle/tooling fixes") incorporated via merge `13c9fdf`. Revision
series: `5e7036c` (initial EU-D implementation, PR #18 revision 1) → fix
commit **`<FINAL-FIX-SHA>`** (integrator review findings, PR #18 revision 2 —
see "What changed — revision 2") → note-SHA update commit (this line only).
The exact branch-tip SHA is stated in the PR review thread with the
re-review request.

**PR status:** PR #18 (`arena/01a08cdf-casevault` → `arena/01a0899f-casevault`),
both revisions pushed there. Stopped for integrator re-review; no self-merge,
no next-wave work.

## What changed — revision 1 (initial implementation)

UI-only, inside the EU-D write set. `apps/web/app/evidence/[id]/page.tsx`
rewritten as the single owner of detail orchestration (4 tabs, distinct
404/network/stale states, targeted cache invalidation); new
`apps/web/components/evidence-detail-*` (error notes, download button,
viewer, status panel, matters panel) and `apps/web/lib/evidence-detail-*`
(drafts, file download/preview, OCR poll, error mapping); new
`tests/browser/eu-detail-*` (fixtures, HTTP probe, browser spec, README).
Full list in the PR description; nothing outside the write set.

## What changed — revision 2 (integrator review findings, all four fixed)

1. **File timeout now covers the complete body** (`lib/evidence-detail-files.ts`):
   `fetchSourceFileBytes` keeps the 30s timer armed across `response.blob()`
   (and error-body JSON reads), so a response whose headers arrive but whose
   body stalls is aborted at the bound with actionable feedback ("did not
   finish downloading within 30s — the connection may be stalled
   mid-transfer. Retry, or check that the API is healthy.").
   `describeError` passes the actionable message through instead of a
   generic one.
2. **Preview lifecycle cleanup** (`useFilePreview` + viewer): dismissal,
   source change, unmount and reload all (a) abort the in-flight fetch —
   genuinely cancelling the body stream — and (b) invalidate the generation,
   so a late result can neither create an unreclaimed object URL nor update
   the wrong source. Object URLs are now created only AFTER the generation
   check (a cancelled load creates none at all), and `fetchPreviewBlob`
   returns the raw blob instead of a pre-created URL. A "Cancel" button is
   available while a preview load is pending.
3. **OCR polling is genuinely abortable** (`lib/evidence-detail-ocr-poll.ts`
   rewritten): every status request goes through a real `AbortController`
   (Promise timeouts no longer leave requests alive); the loop is strictly
   sequential — at most ONE watch request in flight, ever; the per-request
   settle bound is `min(10s, remaining budget)` so no request can outlive
   the 120s total deadline; the 2s cadence pause is interruptible; unmount,
   source change, `stop()` and a new watch all abort everything; a
   mounted-guard prevents a delayed 202 (mutation completing after
   navigation) from spawning a detached loop; per-source derived state
   removes setState-in-cleanup races. Terminal/timeout semantics unchanged
   (complete|skipped|failed → stop + refresh caches; timeout → "still
   unconfirmed" + manual refresh, never a failure claim).
4. **Approved shared-client change** (`apps/web/lib/api.ts`, per the
   2026-09-11 amendment — the ONLY shared edit): `getSource(id, signal?)`
   forwards an optional AbortSignal through the existing `apiFetch`.
   Both existing callers omit it and behave exactly as before.

Regression tests added (`tests/browser/eu-detail.spec.mjs`, now 27 tests):
stalled response body for download AND preview (aborted at 30s, actionable
feedback, retry recovers byte-exact); preview completion after navigation
(real abort + the generation-guard double-lock via a body that completes
late despite a resisted abort — zero object URLs created, the exact
integrator repro); preview cancel; slow status request (aborted at the 10s
bound, `watchMaxInflight === 1`, loop resumes, navigation stops it);
budget-cuts-a-hung-request (a held request started at ~116s is cut at the
120s deadline, not granted 10 more seconds); delayed PATCH across navigation
(exactly one request, only its own source updated); delayed 202 across
navigation (no detached watch loop). The previously browser-skipped
"Preview failed [injected 503]" test now runs via injected PDF capability.

## Proof

Environment: sandbox without Docker; embedded Postgres 16
(`scripts/agent_pg.py`), Redis 7.2.5 built from the GitHub source tarball,
RQ worker 2.12.0, synthetic storage root `/tmp/eu-d-storage` (never `data/`),
disposable databases, Chromium 152.0.7977.0 + Playwright 1.63.0 (isolated,
uncommitted — install steps in `tests/browser/eu-detail-README.md`).

1. **Strict gate** — `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1
   EVIDENCE_REQUIRE_DEPS=1 bash scripts/verify_all.sh` (Redis stopped):
   - migrations upgrade head → downgrade base → upgrade head on a fresh DB: OK
   - `pytest`: **119 passed, 2 warnings in 20.16s** (baseline count kept)
   - `ruff check apps workers scripts tests`: clean
   - web lint (`✔ No ESLint warnings or errors`) / typecheck / build: clean
   - `GATE GREEN — python, migrations, lint and web all pass.`
   - Honest caveat, recorded for the integrator: the first gate run WITH
     Redis up failed 2 tests in `tests/api/test_intake_review.py` —
     `proposals/generate` enqueues when Redis answers, and the running
     worker (attached to the app DB) consumed the test-enqueued jobs, so the
     test saw `queued:true, created:0` instead of inline `created:2`. This
     is an environmental interaction, not a code regression: with Redis
     stopped the same command passes 119/119. (Also noted in the README.)
2. **HTTP probe** (HTTP-only, no browser), workerless —
   `API_BASE_URL=http://localhost:8100 node tests/browser/eu-detail-http-probe.mjs`:
   all checks `ok` — attachment disposition + original filename + sha256
   byte-equality for TXT/PDF/PNG, reprocess 202 shape, honest
   `queued:false` reason without Redis.
3. **Browser spec** (real browser; spec auto-detects worker mode), both
   modes, full suite of 27:
   - **workerless:** **25 passed, 3 skipped** → after the 503-preview test
     was un-skipped via injected capability the final workerless run was
     **25 passed / 2 skipped** (the 2 need a real worker; explicit reasons).
   - **with Redis + RQ worker:** **26 passed / 1 skipped** (the
     workerless-only `queued:false` test; explicit reason).
   - Slowest test ~2.1m (the real-time 120s budget proof, unchanged).

   **Evidence classes, stated per test in its title:**
   - `[real API]` / `[real API + worker]` — real API, real Postgres, real
     Redis+RQ worker where stated; the only synthetic input is the fixture
     upload. Covers: no-download-on-load, byte-exact downloads (sha256 via
     the browser download event), drafts lifecycle, 404 vs network vs
     stale, link/unlink incl. real 409, queued:false no-poll, queued:true →
     real terminal complete (text) and skipped (PDF), navigation-stops-watch.
   - `[injected 503 / transport / sequence]` — deterministic fault
     injection for negative paths (unchanged from revision 1).
   - `[injected stalled body (+clock)]` (NEW) — a real `Response` whose
     `ReadableStream` body never completes; `page.clock` fires the app's
     real 30s timer; the abort's arrival at the stream is asserted
     (`bodyAborted`/`bodyCancelled`), as is zero object-URL creation and
     retry recovery.
   - `[injected stalled response]` (NEW) — a held status request that only
     the app's abort can end; proves the 10s per-request bound, one-request
     -in-flight (`watchMaxInflight === 1`), and the deadline cut.
   - `[injected delayed response]` (NEW) — held PATCH/reprocess responses
     released after navigation; proves exactly-one save, no cross-source
     cache writes, and no detached watch loop.
   - `[injected pdf capability …]` (NEW) — `navigator.pdfViewerEnabled`
     forced true so the preview UI exists in this PDF-incapable browser.
     **This exercises fetch/object-URL/generation mechanics only. No native
     PDF rendering is claimed** (the integrator's instruction): the
     capability-honest tests still branch on the browser's REAL capability
     state, and any download seen under injection is a browser artifact.

## Contract gaps

None new. The two §EU-D.5 interpretation notes from revision 1 stand and are
now reinforced by regressions: the 120s budget is a TOTAL per reprocess
request (each poll bounded by its remaining time — tested), and terminal
"failed" detection honors the shipped job's `processing_status=failed` +
`ocr_status≠queued` shape.

## Risks / follow-ups

- **Native PDF inline rendering remains unverified in this sandbox** — by
  design and per instruction: the injected PDF capability was used solely to
  exercise fetch/object-URL lifecycle, never claimed as rendering proof.
  Still transferred to EU-V/EU-M with the checklist in
  `tests/browser/eu-detail-README.md`.
- The clock-driven regressions depend on Playwright's `page.clock` (1.63)
  semantics; the wall-clock 120s budget test remains as the real-time proof
  of the same deadline.
- Run the Python gate with Redis stopped (see the environmental caveat in
  Proof §1) — `scripts/verify_all.sh` assumes the inline (no-Redis)
  proposals path.
- The one approved shared-client edit (`api.getSource` optional signal) is
  additive; all other shared files remain untouched.
- Revision-1 notes still apply: Playwright CDN blocked in sandbox (isolated
  `@sparticuz/chromium` workaround documented); EU-M owns native-macOS
  observations; running `next build` while `next dev` is live corrupts the
  dev `.next` (restart dev after builds).

## What the next agent must know

- Detail page composition is unchanged from revision 1 (page orchestrates;
  `lib/evidence-detail-*` + `components/evidence-detail-*` own behavior).
  New invariants: file-fetch timeouts span the whole body; preview loads are
  abortable and generation-guarded (object URLs created only after the
  generation check); the OCR watch is strictly sequential, remaining-budget
  -bounded, and abortable at every transition.
- `api.getSource(id, signal?)` is the ONLY shared-client change, made under
  the 2026-09-11 amendment; keep any further shared edits behind integrator
  approval.
- Reproduce the proof: stack per `tests/browser/eu-detail-README.md`
  (disposable DB + `/tmp` storage root), gate with Redis stopped, HTTP
  probe, then the spec once WITHOUT redis/worker and once WITH both.
  Expected: 25/2 (workerless) and 26/1 (worker); the real-time budget test
  takes ~2.5 minutes by design.
- The live stack (web :3000, API :8100, redis, worker, synthetic data only)
  is left running in this sandbox for the owner to click through.

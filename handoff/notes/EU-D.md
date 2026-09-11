# EU-D — Evidence detail-page completion
Contract: docs/contracts/evidence_ui_closure.md v1.0

Branch `arena/01a08cdf-casevault`, base = integration tip `ab0ee23`
("Plan evidence UI closure…"), one commit on top titled *"EU-D: complete
evidence detail page (Status, downloads, preview, errors, OCR)"* — its SHA
is reported with the PR / to the owner. UI-only: no API, worker, hub,
dependency, migration or CI changes; the stale WS-C patch was not
replayed — the page was rewritten in place from the shipped tree.

**PR status:** pushed to `origin/arena/01a08cdf-casevault` with a focused
PR into `arena/01a0899f-casevault` (template-filled, proof pasted), then
stopped for review — no self-merge. (Earlier in this session the sandbox
GitHub token had expired and blocked `git push` / `gh pr create`
(`HTTP 401: Bad credentials`); the connection was restored and the push
+ PR were issued immediately after.)

## What changed

Product (all inside the EU-D write set; `apps/web/app/evidence/[id]/page.tsx`
modified, everything else new):

- `apps/web/lib/evidence-detail-drafts.ts` — Status-tab draft lifecycle
  (§EU-D.1). Pristine drafts fall back to current server values (direct
  Status entry and Edit entry both initialize from server); dirty drafts
  survive background refetches; navigation to another source resets to
  pristine; save reconciliation is guarded by an edit-revision counter so a
  slow response can never overwrite newer edits.
- `apps/web/lib/evidence-detail-files.ts` — fetch-backed `downloadOriginal`
  (§EU-D.2, bytes + server filename preserved via Blob/object-URL anchor
  handoff, errors thrown and surfaced) and `fetchPreviewBlob` +
  `useFilePreview` (§EU-D.3): opt-in preview, Blob/object URL, revoked on
  source change / unmount / reload / dismiss, superseded loads dropped.
- `apps/web/lib/evidence-detail-ocr-poll.ts` — `useOcrWatch` (§EU-D.5):
  `queued:false` never starts a loop; `queued:true` polls the persisted
  source via the existing `GET /sources/{id}` every 2s, one request in
  flight (10s settle bound), 120s budget per reprocess request, terminal
  `complete|skipped|failed` → stop + refresh caches, timeout →
  "still unconfirmed" + manual refresh (never claimed as failure),
  cancellation on unmount/source change, generation-guarded stale responses,
  visible network errors.
- `apps/web/lib/evidence-detail-errors.ts` — `describeError` /
  `FileActionError`: user-safe error sentences (no raw traces).
- `apps/web/components/evidence-detail-error.tsx` — `ErrorNote` /
  `WarningNote` (role=alert/status, retry affordance).
- `apps/web/components/evidence-detail-download-button.tsx` — explicit
  "Download original" for every type, pending + error states inline.
- `apps/web/components/evidence-detail-viewer.tsx` — viewer: PDF preview is
  opt-in and never points at the attachment endpoint (fixes the page-load
  download the old `<iframe src="/api/v1/sources/{id}/file">` caused);
  feature-detects `navigator.pdfViewerEnabled` and shows a clearly labeled
  download fallback in browsers that cannot render PDFs inline (in this
  sandbox's headless Chromium, `false` — a blob iframe there DOWNLOADS the
  file instead of rendering it, so the check is load-bearing); images via
  plain `<img>` (embedded images ignore Content-Disposition) with labeled
  error state; text branch distinguishes "no pages yet" from a failed pages
  query; stale-but-loaded data is labeled, not silently shown as fresh.
- `apps/web/components/evidence-detail-status-panel.tsx` — Status tab:
  drafts form (Save disabled until initialized+valid, no double-submit),
  per-operation failure attribution (save vs include/exclude) with retained
  input, include/exclude with both-flag transitions, and the full honest OCR
  feedback set (accepted ≠ completed; not-queued reason; watching; complete
  / skipped / failed distinct; timeout ≠ failure).
- `apps/web/components/evidence-detail-matters.tsx` — Matters tab: distinct
  errors + retries for links query, matters-list query, link and unlink
  actions (never a false "Not linked to any matter" / empty select);
  per-row unlink pending state; selection preserved for retry.
- `apps/web/app/evidence/[id]/page.tsx` — single-owner orchestration:
  distinct 404 vs network error states with retry (full error state only
  when NO data; a failed background refetch keeps the loaded page with a
  labeled stale banner), header Refresh, processing/ocr status badges,
  targeted cache invalidation (`["source", id]`, `["sources"]`,
  `["pages", id]`, `["source-matters", id]`, `["matter-sources", matterId]`)
  — ledger/intake queries never touched (§EU-D.6).

Tests (`tests/browser/`, new; pytest does not collect `.mjs`, the web build
does not depend on them, no repo dependency added):

- `eu-detail-fixtures.mjs` — synthetic TXT/PDF/PNG, byte-identical ports of
  `scripts/pipeline_smoke.py::synthetic_fixtures` (sha256-verified against
  the Python originals).
- `eu-detail-http-probe.mjs` — HTTP-only probe (labeled as such) against the
  real API: attachment disposition + original filename + byte-equality
  (sha256) for all three types, reprocess 202 shape, honest `queued:false`
  reason without Redis.
- `eu-detail.spec.mjs` — 19 Playwright tests, each labeled `[real API]`,
  `[real API + worker]`, `[injected 503]`, `[injected transport]` or
  `[injected sequence]`.
- `eu-detail-README.md` — reproducible setup (isolated, pinned, uncommitted
  tooling), run commands, evidence-class labels, honest limitations, and the
  EU-V handoff checklist.

## Proof

Environment: sandbox without Docker; embedded Postgres 16
(`scripts/agent_pg.py`), Redis 7.2.5 built from source (GitHub tarball),
RQ worker 2.12.0 (`rq.Worker`, Linux default), synthetic storage root
`/tmp/eu-d-storage` (never `data/`), disposable databases only.

1. `bash scripts/verify_all.sh` with the closure-wave flags
   `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1 EVIDENCE_REQUIRE_DEPS=1`:
   - migrations upgrade head → downgrade base → upgrade head: OK
   - `pytest`: **119 passed, 2 warnings in 24.82s** (baseline count kept)
   - `ruff check apps workers scripts tests`: clean
   - web lint / typecheck / build: clean (`✔ No ESLint warnings or errors`;
     `/evidence/[id]` route builds, 10.1 kB)
   - `GATE GREEN — python, migrations, lint and web all pass.`

2. HTTP probe (HTTP-only, no browser), both modes —
   `API_BASE_URL=http://localhost:8100 node tests/browser/eu-detail-http-probe.mjs`:
   - **workerless:** all 25 checks `ok`, including per-type
     `attachment; filename="eu-detail-synthetic.*"`, sha256 byte-equality
     (text 8d2d8f68…, pdf f2664e27…, image 8b6f051a…), and
     `{"queued":false,"job_id":null,"reason":"ocr queue unavailable: Error 111 connecting to localhost:6379. Connection refused."}`.
   - **with Redis+worker:** same checks `ok`; reprocess reports
     `queued:true` with a job id (logged as note).

3. Browser spec (real browser interactions; Playwright 1.63.0 driving
   Chromium 152.0.7977.0 — see README for the isolated install), both modes:
   - **workerless:** **16 passed, 3 skipped** (2 need a worker; 1 needs a
     PDF-capable browser). Includes: pdf page-load triggers ZERO downloads
     (old-viewer regression), Download original byte-exact via the browser's
     download event + `saveAs` (pdf + png), drafts init/refetch-preservation/
     save-reconcile/invalid-guard/navigation-reset, missing-source 404 state,
     API-unreachable error + recovery, stale-source labeling, pages/matters
     failure ≠ false-empty, link/unlink success + real 409 + injected unlink
     503 + recovery, `queued:false` reason shown with NO polling loop
     (request-count proof), and the injected 120s poll budget → "still
     unconfirmed, stopped polling" + polling actually stops.
   - **with Redis+worker:** **17 passed, 2 skipped** (workerless-only test;
     PDF-capable-browser-only test). Real-worker paths:
     `queued:true` → accepted → watching → terminal **complete** with pages
     refreshed and polling stopped; PDF → terminal **skipped** (stub) shown
     as neither success nor error.
   - Every skipped test carries an explicit reason; no test is silently
     skipped.

4. Fixtures cross-check: JS fixture sha256 digests equal the Python
   originals' (verified at implementation time; digests above).

## Contract gaps

None blocking. Two interpretation notes for the integrator:

1. **§EU-D.5 "bounded interval (default 2s, max 120s per request)"** —
   implemented as: 2s cadence, one status request in flight at a time, 10s
   per-request settle bound, and a 120s TOTAL automatic-polling budget per
   reprocess request (then stop + manual refresh). If "max 120s per request"
   meant something else, it is a one-constant change in
   `lib/evidence-detail-ocr-poll.ts`.
2. **§EU-D.5 terminal statuses** — the shipped `ocr_source` job leaves
   `ocr_status="running"` with `processing_status="failed"` when it dies.
   The watch treats "ocr_status has left `queued` AND processing_status
   failed" as terminal failed, so a real job failure is reported as failed
   rather than polling to the 120s timeout; a stale `processing_status=failed`
   from an earlier ingest failure (ocr_status still `queued`) is NOT treated
   as terminal. Flagging in case a different reading is wanted.

## Risks / follow-ups

- **Browser limitation (transferred to EU-V per the brief):** this sandbox's
  headless Chromium cannot render PDFs inline (`navigator.pdfViewerEnabled
  === false`; a blob-URL iframe downloads instead of rendering). The UI
  feature-detects and shows the labeled fallback — asserted by the spec —
  but the inline blob-iframe render and the "Preview failed [injected 503]"
  test were NOT executed here. Reproducible checklist:
  `tests/browser/eu-detail-README.md` (+ this note's tooling section).
- **Tooling:** the Playwright CDN is blocked from this sandbox; the isolated
  workaround (`@playwright/test@1.63.0` + `@sparticuz/chromium@152.0.0`
  binary + its AL2023 NSS libs, symlinked into git-ignored `node_modules/`)
  is documented step-by-step in the README. EU-V owns the final tooling
  decision; nothing was committed to the repo's manifests.
- Sandbox redis was built from the 7.2.5 source tarball (GitHub); the local
  Mac tester's engine/version observations (EU-M) remain authoritative for
  native macOS behavior.
- Running `next build` while `next dev` is live corrupts the dev server's
  `.next` (restart `make web` after any build). Sandbox observation only.
- `queued:false` still persists `ocr_status="queued"` server-side (shipped
  W2-EV behavior, untouched); the UI states this explicitly instead of
  hiding it.

## What the next agent must know

- The detail page is now composed of focused modules (list above); the page
  file orchestrates queries/mutations/cache invalidation only. One owner per
  contract — do not split these files across agents.
- Drafts semantics: "pristine" means the inputs fall back to live server
  values; any user edit switches to preserved drafts until save/reconcile,
  explicit reset, or navigation. The reconcile guard is an integer revision
  captured at submit time (`saveRevisionRef` in the page).
- OCR watch lives at page level (survives tab switches), keyed on `sourceId`
  (resets on navigation), and only ever polls the shipped
  `GET /api/v1/sources/{id}` — no new endpoints.
- Reproduce the proof: stack per `tests/browser/eu-detail-README.md`
  (disposable DB + `/tmp` storage root), then the HTTP probe, then the spec
  once WITHOUT redis/worker and once WITH both. Expect 16+3 / 17+2 as above;
  a PDF-capable browser additionally runs the two preview-path tests.
- The live stack (API :8100, web :3000, redis, worker) was left running in
  this sandbox for the owner to click through; synthetic data only.

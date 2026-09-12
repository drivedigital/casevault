# EU-L — evidence list resilience and accessible upload

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (§EU-L, including the
2026-09-11 authorized integration amendment)
Branch: `arena/01a08ce1-casevault` (session branch; PR #17 — same PR, no
replacement, not self-merged)
Base SHA: `ab0ee23e8859e0a8a031e065c2537f10db005957`
Revision history:
- `6dc932c` + `ab9164b` — original EU-L delivery (reviewed as `ab9164b`)
- `73418b9` — merge of integration commit `7ed39b1` (preserves `ab9164b`;
  see "Branch reconciliation" below)
- Fix SHA: `ea9c8f1965d4340e8eae136f423d9eaed822a52f` (on top of `73418b9`)

## What changed (this revision)

Addresses every blocking finding from `handoff/EVIDENCE_UI_REVIEW.md`
(2026-09-11) and the PR #17 review comment. Still EU-L write set only —
detail page, shared clients/types, shared components, backend/worker,
manifests, lockfiles, CI untouched.

1. **Upload single-flight guard on every entry path** (was: button-only).
   `apps/web/components/evidence-list-upload.tsx` now guards `handleFile`
   (button change, drop, direct picker selection) AND `openPicker` (zone
   click / button activation) with a synchronous `inFlightRef` lock plus the
   `isPending` check — the ref closes the same-tick window where two rapid
   events would both observe stale idle state; the integrator's reproduced
   bypass (drop + held response → two POSTs) cannot recur. The lock releases
   in the mutation's `onSettled` (fires on success AND failure), so it cannot
   get stuck. A refused second attempt gets visible feedback ("An upload is
   already in progress — “<file>” was not submitted…", `data-testid=
   upload-blocked`); the zone carries `aria-busy` while pending; the blocked
   feedback clears when the in-flight upload settles.
2. **Browser regression for the bypass** —
   `eu-list-failures.spec.ts`: "INJECTED held upload response: drops and
   picker activation while pending cannot start a second upload" holds the
   first POST response open, then (a) drops a second file on the zone and
   (b) clicks the zone while pending, asserting the blocked feedback names
   the file, the button is disabled, `aria-busy` is set, exactly ONE POST was
   made; after release the first upload completes, the lock is reusable, and
   the second file uploads as a second POST (verified in the real API).
   The former latency-based pending test was superseded by this stronger
   held-response version (same protection, stricter proof).
3. **Honest outcome-uncertainty copy + refresh-first reconciliation**
   (`evidence-list-states.tsx`, `evidence-list-upload.tsx`,
   `evidence-list-row.tsx`): new `outcomeKnown(error)` — a 4xx ApiError
   proves the outcome; network failure or 5xx does not. Upload response loss
   now reads "…the connection failed before the server's answer arrived, so
   it is not known whether the file was added — the server may have accepted
   it… Refresh the list first… retrying… will create a duplicate copy";
   row mutation response loss reads "…not known whether the change was
   saved — the server may have applied it. Refresh the list first…". Both
   notices offer "Refresh list first" (invalidates `["sources"]`) BEFORE the
   retry. 4xx branches keep the definite wording ("the server rejected the
   upload — the file was not added" / "The row is unchanged"). Read-only use
   of the shared `ApiError` class — no client changes.
4. **Search label** now matches shipped server behaviour:
   "Search titles" with hint "Searches source titles only (not filenames)".
   (`GET /sources?q=` matches `title` only — backend unchanged; parity
   remains a BACKLOG item.)
5. **Keyboard activation: repeated-Enter allowance removed and diagnosed.**
   The helpers in both specs now use ONE activation: focus → 500 ms settle →
   single Enter → assert the picker opened (in-page click listener on the
   input) → hand the synthetic file over at the DOM boundary
   (`input.files` + change). A miss fails the test loudly. Diagnosis
   (measured, see below): the product's keyboard affordance is correct —
   a genuine Enter always activated the button and always invoked
   `input.click()` (20/20, all variants); the earlier misses were Playwright's
   filechooser interception not surfacing the dialog (14–19/20) and, at zero
   settle, the injected focus/keypress ordering racing (2–4/8, with and
   without route interception — routes are NOT the cause). Test-harness
   artefact, not product behaviour; documented in the spec headers and
   `tests/browser/eu-list-README.md`.

Preserved unchanged: filter bar + client/server filter parity, explicit
both-flags include/exclude, row-attributable mutation feedback, matter
filter/badge failure states, stale-data labelling, bare-array client,
duplicate warnings, `["sources"]`-only cache refresh.

## Branch reconciliation

Local checkout metadata had rolled back to base `ab0ee23` between sessions
while the working tree matched remote `ab9164b` byte-for-byte (verified per
file with `git show ab9164b:<path> | diff -`). Reconciled without losing
work: reset HEAD to `ab9164b` (remote tip, PR #17 head), then merged
integration `7ed39b1` as a true merge commit `73418b9` (parents `ab9164b` +
`7ed39b1`; disjoint files, no conflicts). No force-push, no work discarded.

## What changed (original delivery, for reference)

- `apps/web/app/evidence/page.tsx` — four distinct body states
  (loading/error/filtered-empty/empty), stale rows dimmed + labelled
  ("Saved result — may be out of date"), filters preserved through
  failure/retry, `["sources"]`-only invalidation.
- `apps/web/components/evidence-list-states.tsx` — describeError,
  outcomeKnown/errorStatus, labelled RetryButton, Notice (role=alert/status),
  ListStateRow.
- `apps/web/components/evidence-list-upload.tsx` — keyboard-operable upload
  with entry-path-complete single-flight guard (see above).
- `apps/web/components/evidence-list-filters.tsx` — filter bar with
  title-search label fix; matter-filter failure announced + retryable;
  Included/Excluded exclusive pair.
- `apps/web/components/evidence-list-row.tsx` — per-row include/exclude
  (both flags, row-scoped pending protection, honest failure alerts),
  matter badge with distinct failed state.
- `tests/browser/eu-list.spec.ts` (5), `tests/browser/eu-list-failures.spec.ts`
  (11), `tests/browser/eu-list-README.md` — browser suites + versioned setup.
- `handoff/notes/EU-L.md` — this note.

## Proof

Environment (rebuilt this session): sandbox without Docker — embedded
Postgres 16 via `python scripts/agent_pg.py`, API via uvicorn :8100 with
`LOCAL_STORAGE_ROOT=/tmp/...` (never `data/`), web via `next dev` :3000
proxying `/api/v1`. Browser: real Chromium (Chrome for Testing, npm-distributed
build per README sandbox note) driven by Playwright 1.63.0. All fixtures
synthetic in-memory TXT.

1. Web gate:
   ```
   npm run lint --workspace=web        # pass (only pre-existing detail-page warning)
   npm run typecheck --workspace=web   # pass
   npm run build --workspace=web       # pass (inside verify_all.sh)
   ```
2. Full strict gate:
   ```
   bash scripts/verify_all.sh
   ==> Database ... ==> Migrations (upgrade head -> downgrade base -> upgrade head)
   ==> pytest (real Postgres): 118 passed, 1 skipped, 3 warnings
   ==> ruff: All checks passed!
   ==> web: lint / typecheck / build: pass
   GATE GREEN — python, migrations, lint and web all pass.
   ```
3. Browser regressions (review findings 1–5):
   ```
   npx playwright test --config=playwright.config.ts   # 5 consecutive full runs
   16 passed (19.5s) / 16 passed (20.8s) / 16 passed (23.4s)
   16 passed (25.4s) / 16 passed (27.7s)               # + 3× positive suite alone: 5 passed
   ```
   = eu-list-failures.spec.ts (11) + eu-list.spec.ts (5); 80+ single
   keyboard activations across runs, zero misses.

Coverage honesty (real vs injected):

- **Real browser + real API** (positive suite, no mocks): keyboard-opened
  picker → real POST /sources → row + bare-array `GET /sources` read-back;
  include/exclude exclusive transitions verified through the API; duplicate
  badge; filtered-empty vs empty; `matter_id` asserted on the outgoing
  request.
- **Injected transport failures** (negative suite, labelled INJECTED per
  test): real app code/browser with route-level abort / 422 / 400 / 500 /
  latency / held-response. Each test's positive half (retry after unrouting
  or releasing the hold) hits the real API — e.g. the held-upload regression
  verifies the first upload really completes and the second really uploads
  (two real POSTs total, in the real DB). The single-flight bypass scenario
  itself (review finding 1/2) is injected-timing reproduction; the fix is
  product code exercised by the real drop/keyboard events.
- Keyboard diagnosis numbers (finding 5) come from scratch harness probes
  outside the repo: button-activation/product-path proof 20/20 in every
  variant; chooser-event surfacing 14–19/20; immediate-press loss 2–4/8 with
  and without routes; ≥50 ms settle 8/8–12/12. Committed tests use the
  resulting single-activation protocol.
- No real-worker OCR path is exercised (the list page does not poll OCR);
  upload enqueue degradation without Redis remains the server's existing
  best-effort behaviour, unmodified.

## Contract gaps

- Unchanged from the original delivery: `GET /sources?q=` matches title only
  while the UI previously advertised filename search — resolved on the UI
  side this revision (label now says "Search titles"); server-side filename
  matching remains a BACKLOG parity item.
- §EU-L 2 "send both flags" is implemented literally (both flags always in
  the PATCH body); noted so reviewers know the payload is intentional.

## Risks / follow-ups

- `tests/browser/` still needs the runner decision from EU-V/integrator;
  Playwright remains an isolated tool (nothing added to package.json/CI).
- Row actions disable only the mutating row; per-row parallel actions remain
  safe (each row owns its mutation).
- The blocked-upload feedback is info-tone; if the product later wants a
  queue ("upload next after current"), it is a small change on top of the
  guard — out of scope here.
- Stale-labelling relies on react-query's per-key cache; a hard reload during
  an API outage shows the full-error state (correct distinct behaviour).

## What the next agent must know

- EU-V: suites are ready for integrated acceptance; `EU_WEB_BASE`/`EU_API_BASE`
  env vars, serial execution (`workers:1`), disposable DB (no source-deletion
  endpoint — use a scratch DB). The held-response test intentionally holds a
  real request open for a few seconds.
- EU-D: list success paths invalidate only the `["sources"]` prefix; the
  detail page's `["source", id]` cache is untouched by list mutations.
- If `next build` runs while `next dev` serves the same `.next`, the dev
  server 404s its own chunks — restart the dev server after any production
  build (hit again this session).
- The in-page click-listener technique (asserting the picker opened) is
  reusable for any future keyboard-operability proof in this repo.

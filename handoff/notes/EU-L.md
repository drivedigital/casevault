# EU-L — evidence list resilience and accessible upload

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (§EU-L)
Branch: `arena/01a08ce1-casevault` (this session's assigned branch)
Base SHA: `ab0ee23e8859e0a8a031e065c2537f10db005957` (integration tip, per session setup)
Final SHA: see "Proof" below (filled at commit; also in the PR)

## What changed

Product (EU-L write set only):

- `apps/web/app/evidence/page.tsx` — list page recomposed around four distinct
  body states: loading, request-error, filtered-empty, plain empty. A failed
  list request renders an error banner with an explicit retry and — when older
  results are still cached — keeps them visible, dimmed, and labelled
  "Saved result — may be out of date" (`data-testid=stale-chip`), never as an
  empty list. Header count shows "Unavailable" / "N results (saved)"
  accordingly. Search/filter values live in page state and survive failure and
  retry untouched. Success paths invalidate only the `["sources"]` query
  prefix.
- `apps/web/components/evidence-list-states.tsx` (new) — shared primitives:
  `describeError` (API `detail` or generic fallback; raw traces never reach the
  UI), `RetryButton` (labelled per action for screen readers), `Notice`
  (`role=alert` for failures / `role=status` for neutral updates),
  `ListStateRow` (the four table-body states, with "Clear filters" action for
  filtered-empty).
- `apps/web/components/evidence-list-upload.tsx` (new) — keyboard-operable
  upload: a real `<button>` (Tab + Enter/Space) opens the file picker; drag &
  drop preserved. Pending state disables the picker ("Uploading…",
  `aria-busy`, `role=status`), preventing duplicate submissions. Failure
  renders an attributable alert ("Upload failed for `<file>`", reason, "the
  file was not added") with a retry that resubmits the SAME file. Oversize
  files (>100 MB, client guard mirroring the server) get a visible error with
  no fake retry. Success shows a `role=status` confirmation and refreshes only
  source-list caches.
- `apps/web/components/evidence-list-filters.tsx` (new) — the filter bar with
  full parity to the shipped page: server filters (q, matter_id, source_type,
  evidence_review_status) and client-side filters (source_status, ocr_status,
  included/excluded). Matter-filter load failure renders an announced,
  retryable error in place of the select — it cannot read as a normal empty
  "All matters" list; the chosen matterId stays in state across the failure.
  Included/Excluded remain an exclusive pair (checking one explicitly clears
  the other).
- `apps/web/components/evidence-list-row.tsx` (new) — per-row include/exclude
  actions with a row-owned mutation: both flags always sent explicitly
  (`included_flag:true, excluded_flag:false` and the mirror), both of that
  row's buttons disabled while its request is pending (no double submission),
  failure shows an inline `role=alert` naming row + operation + reason with a
  retry resubmitting the same payload, and is never rendered as success.
  Success invalidates only `["sources"]`. Per-row linked-matters badge
  distinguishes loading / confirmed-empty ("—" only after a successful query) /
  FAILED (announced "Couldn't load linked matters" + labelled retry).

Tests (EU-L write set only):

- `tests/browser/eu-list.spec.ts` (new) — 5 positive-path tests, real browser
  against the real stack (no mocks): keyboard upload → row + bare-array API
  assertion; include/exclude exclusive transitions verified through the API;
  duplicate warning; empty vs filtered-empty distinctness + Clear filters;
  matter filter sends `matter_id` to `GET /sources` and filtered-empty shows
  for a fresh matter.
- `tests/browser/eu-list-failures.spec.ts` (new) — 9 negative-path tests using
  INJECTED transport failures (Playwright route abort/500/latency, labelled in
  each test name/body): list failure ≠ empty; retry loads the real list;
  refetch failure labels retained rows "saved" and preserves the search term
  through both failure states and retry; upload failure names the file and
  retry succeeds for real; picker disabled while an upload is pending (exactly
  one POST); row mutation 500 shows inline alert, flags unchanged (checked via
  API), row retry succeeds; slow row PATCH disables that row's buttons with
  exactly one PATCH; matter-filter failure announced + retry repopulates; row
  badge failure distinct from "no linked matters" + retry shows the linked
  matter.
- `tests/browser/eu-list-README.md` (new) — versioned reproducible setup
  (`@playwright/test` 1.63.0), disposable-stack instructions, env vars, the
  real-vs-injected coverage table, and the sandbox browser note.

No changes to: detail page, shared `lib/api.ts` / `lib/types.ts` / shared
components, backend, worker, migrations, CI, Makefile, package/lockfiles,
ignore rules. The `["sources"]` bare-array client and shipped server filters
are used as-is (§EU-L 4).

## Proof

Environment: sandbox, no Docker — embedded Postgres via
`python scripts/agent_pg.py` (Postgres 16, scratch `data/pgdata`), API via
uvicorn on :8100 with `LOCAL_STORAGE_ROOT=/tmp/...` (never `data/`), web via
`next dev` on :3000 proxying `/api/v1`. Browser: real Chromium (Chrome for
Testing 153.0.8010.12, obtained from npm — see README sandbox note) driven by
Playwright 1.63.0. All fixtures synthetic TXT generated at runtime; test
uploads only in the disposable local DB.

1. Web gate:
   ```
   npm run lint --workspace=web        # pass (only pre-existing warning in detail page, not my file)
   npm run typecheck --workspace=web   # pass
   npm run build --workspace=web       # pass (9 routes compiled)
   ```
2. Full wave gate:
   ```
   bash scripts/verify_all.sh
   ==> Database (fresh casevault_test) ... ==> Migrations (upgrade head ->
   downgrade base -> upgrade head) ... ==> pytest (real Postgres)
   118 passed, 1 skipped, 3 warnings
   ==> ruff   All checks passed!
   ==> web: lint / typecheck / build   pass
   GATE GREEN — python, migrations, lint and web all pass.
   ```
3. Browser regression proof (real API + real browser; failures suite uses
   labelled injected transport errors per contract §Proof and safety):
   ```
   npx playwright test --config=playwright.config.ts   # 3 consecutive full runs
   14 passed (25.5s) / 14 passed (23.9s) / 14 passed (26.5s)
   # = eu-list.spec.ts (5) + eu-list-failures.spec.ts (9)
   ```

Coverage honesty (what each claim actually used):

- Real browser interactions + real API (positive suite): keyboard-opened file
  picker → real POST /sources → row appears; row include/exclude → real PATCH,
  verified by reading back `GET /sources` (asserted bare array); duplicate
  badge; filtered-empty vs empty; `matter_id` reaching `GET /sources`
  (asserted on the outgoing request).
- Injected transport failures (negative suite): real app code and browser, but
  list/upload/PATCH/matters/badge requests were aborted, stubbed 500, or
  delayed by route interception. Positive halves of those tests (retry after
  unrouting) hit the real API. No real-worker OCR behaviour is exercised
  (list page does not poll OCR); upload enqueue degradation without Redis is
  the server's existing best-effort path, unmodified.

## Contract gaps

- None blocking. Two observations for the integrator:
  1. `GET /sources?q=` matches `title` only (not filename) — the UI search
     label says "Search title / filename"; either the label or the filter is
     slightly off. Backend change ⇒ out of scope here (BACKLOG filter-parity
     item already tracks parity).
  2. Contract §EU-L 2 says "Send both flags for exclusive include/exclude
     transitions" — implemented literally (both flags always in the PATCH
     body). No API change needed; noted so reviewers know the payload is
     intentional.

## Risks / follow-ups

- `tests/browser/` needs a runner decision: Playwright is proposed as the de
  facto runner but is NOT added to package.json/CI (contract: no mandatory
  dependency/CI change; tooling proposal belongs to EU-V). The suites run
  standalone per the README; if EU-V ratifies Playwright, only the harness
  config needs committing.
- Row actions disable only the mutating row; other rows stay interactive
  (per-row parallel actions are safe — each row owns its mutation).
- Stale-labelling relies on react-query's per-key cache (`errorUpdatedAt`);
  a hard reload during an API outage shows the full-error state (no cache),
  which is the correct, distinct behaviour.
- The first-activation file-chooser quirk (swallowed Enter when Playwright
  interception is active) is a browser/CDP artefact, worked around in tests by
  repeating the same keyboard press; documented in the spec headers and README.

## What the next agent must know

- EU-V: `tests/browser/eu-list-*.spec.ts` are ready for integrated acceptance;
  they expect `EU_WEB_BASE`/`EU_API_BASE` (defaults localhost:3000/:8100), run
  serially (`workers:1`), and seed synthetic rows into the configured
  disposable DB (no cleanup endpoint exists for sources — use a scratch DB).
- EU-D: list-page success paths invalidate only the `["sources"]` prefix; the
  detail page's `["source", id]` cache is intentionally untouched by list
  mutations (unchanged from the shipped behaviour).
- If `next build` runs while `next dev` serves the same `.next`, the dev
  server 404s its own chunks (seen in this session) — restart the dev server
  after any production build.

# Revised-agent review and product merge — 2026-09-12 (America/Chicago)

## EU-ERR accepted and merged

PR21 reviewed head7ac87d7f1a1707782780bcd552bbc9a55d170ff9, merged via GitHub as
**a21ea3481351cb1b19ea3488e4dde4cc2644bfd1** into arena/01a0899f-casevault.
Candidate/merged apps, workers, scripts, tests, packages trees compared identical.
No integrator feature edits. Only reviewed safe list-error mapping + regressions.

Independent verification on an exact git archive of candidate, not another branch:
- Strict gate `EVIDENCE_REQUIRE_DEPS=1 INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1
  bash scripts/verify_all.sh`, with BOTH DB URLs explicitly set to a newly created
  owned test DB, owned scratch storage and private redislite binary: exit0,
  **119 passed, zero skips, 2 warnings, 22.69s**. Migration up/down/up, Ruff,
  web lint/typecheck/build passed. No production/shared database touched.
- Browser: isolated @playwright/test1.63.0 + npm Chromium, workers1/retries0/
  max-failures1, outer300s: eu-error (7), eu-list (5), eu-list-failures (13):
  **25 passed, zero skips, 28.2s, exit0**. Tested real API/Next/PG plus labelled
  injected faults, synthetic TXT only. No worker/native PDF/full acceptance claim.
- First browser attempt failed launching Chromium (missing libnspr4, before any
  app interaction):1 failed/24 not run. Added bundled AL2023 libraries to private
  tooling and reran; no product/test assertions changed. Not a product failure.
- Logs outside Git: /home/user/pr21-strict.log, pr21-browser-setup-failure.log,
  pr21-browser.log. API8111, web3111 and owned PostgreSQL stopped; status confirmed
  not running. Owned scratch DB/storage removed after shutdown; no shared cleanup.
- PR21 five checks observed green, but do not substitute those for browser proof.
  Merge disposition comment5649648819. EU-ERR task complete; no further work assigned.

## EU-V corrections accepted; bounded runtime followup released

PR19 head575d771a47bc68c4e33e89ebf9fe561784fac1df reviewed, still unmerged.
Image test restored, RQ URL moved to child env, RQ error output narrowed, nullable
page_count typing, stale-reader note corrected, initial ingest settle and afterEach
AbortController cancellation added. Source acceptance is not a runtime rerun claim.

Comment5649648897 authorizes merging exact a21ea34 into SAME EU-V session branch,
recording resulting test SHA and proving product tree matches a21ea34. Work<=45min,
setup<=15min, each batch<=5min, case<=120s, workers1/retries0/max-failures1:

1. `timeout 300 bash scripts/eu_browser_run.sh --grep 'L2.5|L3.2/L3.3/L3.4' --retries=0 --workers=1 --max-failures=1 --reporter=line eu-acceptance-list.spec.ts`
2. ONLY IF1 passes: `timeout 300 bash scripts/eu_browser_run.sh --grep 'real worker run for (text|pdf|image)' --retries=0 --workers=1 --max-failures=1 --reporter=line eu-acceptance-ocr.spec.ts`

Preserve original badge no-disclosure assertion, exact uploaded/job ID, structured
payload + committed pages + UI, two sequential explicit clicks/type. Image newly
authorized, not previously proved. Initial ingest must settle. Stop/report on failure;
no extra suites/D5.12/product edits/self-merge. Cancellation/cleanup ledger required.

## OCR-PLAN R2 accepted only as proposal; session parked

Reviewed ba93aac content at combined PR20 headd1a504f. Bounded design task complete
as exploration, NOT frozen implementation contract. No further OCR-session edits
now; implementation/dependency/CI work still held. R2 “resolved” labels are author
proposals, not approved guarantees. Before future contract freeze:
- Bind attempts immutably from enqueue to commit; ensure progress when a newer
  request invalidates first attempt then loses try-lock. Returning already_running
  does not automatically trigger RQ retry. Hold/release advisory locks explicitly
  on one physical connection; returning connection to pool does not unlock it.
- Bound IPC and parent memory, drain pipes before join deadlock, explicitly sanitize
  spawned child env and handle parent death. Spawn alone does not isolate secrets.
- Resolve inconsistent full-swap-only vs mixed/skipped swap rules, last-success vs
  latest-attempt statuses and truncation completeness/API/UI semantics.
- Darwin resource enforcement, contract amendments and present/absent engine tests
  still need approved scope and verification. No engine/platform accuracy run here.

## PV-GATE revised verifier remains open for one security correction

PR20 headd1a504f includes PV helpercb91e9e. Author reports3 pass29.7s, bounded
async children, connection/read timeouts, symlink-aware stored-path containment and
positively verified cleanup; no independent PV browser rerun by integrator.

Independently imported exact helper and tested `sanitize()` with synthetic JSON
`{"password": "SYNTHETIC_SENTINEL"}` and plain trace/evidence text. Sentinel remains
in both and current errors/parseJson echo sanitized excerpts. Credential regexes
are not an arbitrary evidence/diagnostic disclosure boundary.

Comment5649650869: fixed error codes + bounded numeric status ONLY; do not keep
expanding regexes. Cap accumulated stdout/stderr, safely handle stdin errors,
correct detached:false orphan guarantee. Small synthetic negative checks then
ONLY3 PV browser cases<=5min; work<=30min/setup<=15min. No real data/full suite.

Shared branch ownership now explicit: PV-GATE ONLY remaining writer on
arena/01a097ea-casevault, PV paths/note only. OCR session parked. PR title/body
corrected to combined inventory (gh pr edit hit Classic Projects deprecation;
used gh REST API to update successfully). No simultaneous push/rebase permitted.

## Preview and acceptance

Limited synthetic preview may use merged a21ea34 under OWNER_PREVIEW.md isolation
and checklist. Older PV/native-fallback evidence stays attributed to a040e9f, not
silently relabelled to new SHA. List error disclosure fixed; detail helper still
passes raw error messages (source-identified separate gap, no real-data leak
established). Full acceptance/native Mac/real-data/engine/operational gates remain.

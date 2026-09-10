# Evidence UI closure — v1.0 FROZEN (2026-09-10)

This is a focused completion wave, **not Wave 3**. Baseline product: integration
`8850721` (119-test strict gate). Start after this contract is committed, from
the latest `arena/01a0899f-casevault`. The shipped sources API and Wave 2 review
floor remain unchanged. Earlier WS-C original/recovery patches are reference
only: never replay the stale full-module patch from dev-logs over this tree.

## Ownership and merge order

| Assignment | Role | Exclusive write set | Dependency |
|---|---|---|---|
| EU-D | Detail-page implementer | `apps/web/app/evidence/[id]/page.tsx`, new `apps/web/components/evidence-detail-*`, new `apps/web/lib/evidence-detail-*`, `tests/browser/eu-detail-*`, `handoff/notes/EU-D.md` | Start now |
| EU-L | List-page implementer | `apps/web/app/evidence/page.tsx`, new `apps/web/components/evidence-list-*`, `tests/browser/eu-list-*`, `handoff/notes/EU-L.md` | Start now |
| EU-V | Independent browser verifier | `tests/browser/eu-acceptance-*`, `scripts/eu_browser_*`, `handoff/notes/EU-V.md` | Plan now; final run after D+L merge |
| EU-M | Local Mac/browser tester | report only on local tester's dev-logs workflow | Worker check now; UI check after D+L merge |

Merge D and L in readiness order (disjoint files), then V. One owner for the
entire detail page: Status, downloads, PDF preview, errors and OCR refresh are
not separate assignments. V does not modify implementer tests or product code.

Read-only for implementers/verifier: shared `lib/api.ts`, `lib/types.ts`, shared
components, dependency manifests/lockfiles, CI, Makefile, migrations, backend,
worker, ignore rules, integrator handoff documents. Request a minimal hub change
from integrator first. EU-V proposes any browser-test tooling installation;
there is no existing web test runner. Do not introduce parallel test frameworks.
Uncommitted isolated tooling is allowed; final tests must have reproducible,
versioned setup instructions. No mandatory dependency/CI changes without approval.

## Required behavior (acceptance contract)

### EU-D: detail page
1. Direct entry to Status and entry through Edit initialize current server title
   and source status. Never submit an uninitialized/invalid status. Background
   refetch must not erase dirty drafts; navigation to another source resets them.
   Save success reconciles drafts/cache; save failure retains input and gives
   useful feedback/retry. Concurrent save/reprocess operations must not silently
   duplicate requests or overwrite newer edits.
2. Explicit **Download original** for every type uses shipped same-origin file
   endpoint and preserves bytes/filename. A preview or API response alone is not
   proof a download click works. Show errors if a fetch-backed download fails.
3. PDF preview must not accidentally invoke an attachment download on page load.
   Allowed UI-only solution: controlled fetch to Blob/object URL, revoke on
   source change/unmount, label loading/error and provide a download fallback.
   Avoid eagerly buffering large files: make preview opt-in if needed. Never
   render untrusted HTML via raw DOM insertion. Do not weaken file endpoint
   attachment/security headers or add remote viewers/providers. Native PDF
   renderer support varies: report actual browser result and honest fallback.
4. Surface source/pages/matter-list/link/unlink/update errors distinctly; retries
   preserve entered values and successful state. Missing source and unavailable
   API must not become a false empty/healthy view. Respect action pending state.
5. OCR: POST 202 means accepted, NOT completed. `queued:false` displays the reason
   and must not start a completion polling loop or claim extraction success.
   For `queued:true`, poll source status at a bounded interval (default 2s, max
   120s per request). On `complete|skipped|failed`, stop and refresh pages/source
   and affected caches. Distinguish skipped/failed from successful extraction.
   On timeout stop automatic polling, show still-unconfirmed status and manual
   refresh; do not claim job failure solely due to timeout. Stop on unmount or
   source change, prevent overlapping loops and guard stale responses. Network
   errors must be visible. Poll persisted source state using existing API; no
   fabricated job-status endpoint. Known engine stubs remain valid skipped cases.
6. Maintain cache consistency for source list/detail and linked-matter views
   without invalidating unrelated ledger/intake queries unnecessarily.

### EU-L: list page
1. Loading, empty, filtered-empty and request-failure states are distinct. Failed
   list requests show actionable retry; stale data, if retained, is labeled.
2. Upload and row include/exclude failures are visible and attributable to the
   attempted operation/source. Preserve query/filter values through retries.
   Pending-state behavior prevents duplicate row actions; do not treat a failed
   mutation as success. Send both flags for exclusive include/exclude transitions.
3. Matter filter and per-row matter badge query failures must not look like
   “no linked matters.” Provide useful accessible feedback/retry without leaking
   raw server traces. Upload remains usable by keyboard, not only pointer/drag.
4. Preserve server-supported filters and existing client-side filter parity;
   sources remain a bare array. No new envelope/pagination or backend filters.
5. Refresh affected source-list queries after success; retain duplicate warnings,
   original navigation and existing ledger/intake functionality.

## Proof and safety
- All tests use synthetic TXT/PDF/image fixtures, isolated test DB/storage and
  queues. No real evidence or identifying filenames/hashes in commits/reports.
  Do not alter or flush the user's shared Redis/database. Raw diagnostics remain
  outside Git; only redacted summaries in handoffs.
- Each implementer runs web lint/typecheck/build plus targeted regression proof.
  Builds are not browser proof. Say exactly whether assertions used real API,
  HTTP-only probes, browser interactions, or injected transport errors.
- EU-V runs actual browser interactions against integrated real API for positive
  paths. Deterministic network failures/status sequences may be injected for
  negative tests, separately labeled; they do not replace real-worker proof.
- Verify original download bytes against synthetic input; PDF renderer/fallback;
  dirty form refetch; navigation reset; list/link errors; pending controls;
  OCR queued false, complete, skipped, failed, timeout and poll cleanup.
- Local Mac tester records exact SHA, Python/RQ versions, normal launcher-selected
  class, two sequential Reprocess OCR requests, actual job results and persisted
  state, original bytes and absence of new SIGABRT reports. Python 3.12 proof
  does not establish 3.14 compatibility; do not conflate upload with Reprocess.
- Full wave gate after each merge is integrator-owned. Required flags:
  `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1 EVIDENCE_REQUIRE_DEPS=1`, with explicit
  disposable DB and real Redis binary available. Never point at real case data.
- If a browser binary is unavailable, report the blocker and transfer execution
  to EU-M; do not declare browser acceptance green based on build/source alone.

## Coordination and completion

Use `handoff/AGENT_POLICY.md` except these newer closure write sets govern this
wave. Stay on the branch assigned by the current Arena session; do not create,
switch to, or push another session's branch. Preserve local work before updating
base; do not follow an old blanket reset command without checking/backing up
changes. A stale Git HEAD with restored files must be reconciled, not discarded.

Each agent reports branch, base SHA, final SHA, focused PR targeting integration,
exact commands/results, blockers, and next-owner notes. Closed/merged PRs are not
containers for new work: open a new PR. Freeze branch after handoff until review.
Hub/API changes require integrator approval. No new chronology/proof-graph/OCR
engine work until this closure wave is signed off.

# Current coordination status

Updated 2026-09-12 (America/Chicago). Latest disposition: REVIEW_REVISIONS.md.
Historical updates below are not current assignments or authorization.

## Product and branches

- Integration: `arena/01a0899f-casevault`; product **a21ea3481351cb1b19ea3488e4dde4cc2644bfd1**.
- EU-ERR PR21/7ac87d7 merged as a21ea34 after independent strict119/no skips +
  focused25 browser/no skips. EU-ERR complete, no further task assigned.
- EU-D PR18/c8c7d27 and EU-L PR17/a040e9f remain merged; original sessions closed.
- EU-V PR19/575d771 open: corrections accepted, bounded post-fix tests authorized.
- PR20/d1a504f combines OCR-PLAN R2/ba93aac and PV-GATE/cb91e9e. Still open.
  OCR task accepted as proposal ONLY and parked. PV sole remaining branch writer.
- Local-ops0159466 unmerged, approval-blocked. No bypass, branch deletion, main
  release, engine/dependency/CI implementation or real-data acceptance authorized.

## Current assignments

| Owner | Next action | Required proof |
|---|---|---|
| EU-V | Merge exact a21ea34 into existing PR19 branch; run2 list cases; ONLY if pass,3 real-worker TXT/PDF/image cases | comment5649648897 / REVIEW_REVISIONS.md commands, exact test SHA, no disclosure, retry/accessibility, payload+SQL/pages+UI, cleanup; no full suite |
| PV-GATE | Fixed-code bridge errors (no excerpts), output caps/stdin handling, negative probes +3-case rerun | comment5649650869, <=30min work/5min browser; PV paths only, sole PR20 writer |
| OCR-PLAN | Park; no further edits/implementation | Proposal accepted, ownership/IPC/state/Darwin/contract gates still open |
| EU-ERR | Complete | Independent119+25 gate, merged a21ea34 |
| Owner/EU-M | Limited synthetic preview at a21ea34 only under OWNER_PREVIEW.md | Isolation preflight, native/manual results, exact SHA, owned cleanup; no approval-block workaround |
| Integrator | Review bounded followups; track separate detail-error disclosure and remaining acceptance | No claimed full acceptance from partial runs |

## Current measured proof

Candidate7ac87d7 and merged product a21ea34 are tree-identical over runtime/test
paths. Independent strict119 passed/no skips (22.69s) plus migrations/Ruff/web
checks; focused25 browser passed/no skips (28.2s). Initial Chromium missing-library
launch failure separately recorded. Owned API/web/PG stopped, scratch data removed.
EU-V corrected OCR runs and PV3-case runs remain author-reported at their original
SHAs; no native PDF or Mac proof inferred. Full EU-V acceptance still incomplete.

## Historical proof and dated updates (superseded for assignments)

## Measured proof versus reported proof

- Independent D+L pre/post merge strict gate: **119 passed, no skips**, migrations
  up/down/up, Ruff, web lint/typecheck/build green.
- Independent combined browser run: **43 passed / 2 worker-only skipped** (18L +
  25D). Separate earlier D-only worker tests: **2 passed**, payload/state checked.
  This is not combined final EU-V acceptance, native PDF or Mac proof.
- Hosted CI at `0788cccc91e777afa83bbd40b59e16cd57d8be98`: python, web, secrets,
  intake, evidence all success. [Run 34720445577](https://github.com/drivedigital/casevault/actions/runs/34720445577).
  Evidence job is HTTP/worker/storage, NOT browser acceptance. No new audit-commit
  CI result claimed; PR-event secret-scanner permissions are not inferred from a push run.
- EU-V `2c360a1` reports tooling15 pass; list14/6; detail10/11 then partial5/1 and
  4/2; OCR10/3 then partial3/3. Counts are separate runs, not additive. Raw logs
  reportedly lost on reset. No final sign-off or independent validation of those counts.
- Service-busy interruptions have no established provider-level root cause.
  Metadata regression, missing dependencies and source-reviewed harness defects
  are distinct observed problems, not proof of why the AI service was busy.

## Documentation map

- [Agent policy](AGENT_POLICY.md): permissions, write sets, PR/merge rules.
- [Recovery](RECOVERY.md): interruptions, stale metadata, closed sessions, evidence preservation.
- [Testing](TESTING.md): safe gate prerequisites; archived phase checklists.
- [Verification workflows](VERIFICATION_WORKFLOWS.md): CI coverage, local gate, browser proof and backups.
- [Backlog](BACKLOG.md), [known issues](KNOWN_ISSUES.md), [decisions](DECISIONS.md).
- [Kickoffs](kickoff/README.md): current roster; historical assignment scopes are not reactivation.
- [EU-M checkpoint](EU_M_CHECKPOINT.md): **held**, historical checklist only.
- [Patch intake](REVIEW_PATCH_INTAKE.md), [local-ops review](LOCAL_OPS_REVIEW.md),
  [evidence integration review](EVIDENCE_UI_REVIEW.md): detailed audit records.
- Contracts: `docs/contracts/evidence_ui_closure.md` (active closure),
  `wave2_intake_core.md` and `sprint3_evidence.md` (shipped interfaces/history).

## Latest bounded verifier checkpoint (preview hold superseded below)

3c405cf changes only EU-V list spec and note. Corrected L1.5 uses Include success
invalidation -> observed background GET failure -> same cached row + stale chip.
T1 reported1 pass (1.9s), corrected L1.5 reported1 pass (4.1s). Two wrong title
selectors executed no tests; earlier focus-trigger draft failed. No fresh whole-list
count, independent rerun or full acceptance inferred. Five other original list
failure groups, detail and real-worker payload proof remain unresolved. Next batch
request: PR19 comment5648897894. EU-M hold unchanged.

## Renewed owner-preview decision

Owner asked when local preview can run. Product is unchanged since a040e9f; do not
wait for all verifier cases to permit a bounded synthetic demonstration. Explicit
renewed release/checklist is OWNER_PREVIEW.md. Preflight isolation failure means
STOP; no real evidence, backup/restore, destructive gate or unmerged tooling.
Final acceptance remains held. PDF/image stub rechecked in both process_source
and ocr_source at a040e9f: each deliberately sets skipped and records no engine
wired. Successful worker orchestration/native PDF rendering is not extraction.
3c405cf is the same reviewed short-batch head, not an additional EU-V delivery.
No agent-launch tool is available here; owner must start the two fresh sessions.

## Latest review — EU-V e7fe31e

Assigned two-case batch complete, NOT final acceptance: agent reports1 pass/1 fail
(exit1,24.5s). L2.5 now proves exact-ID PATCH failure/retry and preserved controls.
Row badge accessible error/recovery passes, but injected traceback/SQL appears in
UI. Source-reviewed unsafe Error.message passthrough corroborates disclosure path;
no independent browser rerun or observed real-data disclosure claimed here.
EU-ERR fresh-session brief ready for third slot, not launched. PV-GATE remains
independent; OCR-PLAN PR20 head61da3b4 submitted for design-only review.
EU-V next: fix own RQ result reader/async waits, run real TXT+PDF explicit reprocess
cases only; no full-suite rerun/product edit. After fix merge rerun original badge
case plus shared-helper regressions. Final acceptance requires remaining list/detail
cases and full impacted suites, not accumulated partial counts. Limited synthetic
preview may continue, but record error-disclosure limitation and use no real data.

## OCR-PLAN / PV-GATE review update

OCR-PLAN PR20 head61da3b4 reviewed: design direction acceptable in principle,
changes requested before implementation contract. Key gates: cross-entry concurrency,
hard parser bounds/crash cleanup, retained-page consistency/mixed coverage, safe
reasons and existing-test/CI compatibility. See OCR_PLAN_REVIEW.md; comment5649440419.
No merge or package approval. PV-GATE is owner-reported ready but submission not
visible in fetched refs/PRs/dev-logs; PR URL or commit SHA requested. No PV run claimed.

## Four-deliverable review (supersedes older artifact-availability statements)

See BATCH_REVIEW_2026_09_12.md. EU-ERR PR21/b78fa82 needs three authorized safe-text
regression updates and network-copy correction before gate/merge. EU-V PR19/5e925be
now reports decoded TXT/PDF sequential OCR proof; helper/coverage followups remain.
PV-GATE319120e is bundled in PR20 head61da3b4 with original OCR-PLAN2b6688a, not
missing. PV needs bounded/redacted bridge and note corrections; OCR design is NOT
revised since original review. PR20 must accurately disclose combined scope; only
one writer on that assigned branch. No PR merged or runtime tests rerun this turn.

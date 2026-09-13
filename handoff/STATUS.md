# Current coordination status

Updated 2026-09-13. Latest disposition: CONTINUATION_REVIEW.md.
Historical updates below are not current assignments or authorization.

## Product and branches

- Integration: arena/01a0899f-casevault. Product pin remains **a21ea3481351cb1b19ea3488e4dde4cc2644bfd1**.
- PR20/b86db71 merged as4bf4e2f (PV verifier + OCR proposal ONLY; no product changes).
  PV/OCR complete and parked. No OCR engine/dependency/CI approval; design gates remain.
- EU-ERR PR21 merged a21ea34 after independent119 Python +25 browser/no skips.
  Original EU-D/L sessions closed; never reuse their branches.
- EU-V PR19 open, head7893901. Reports2 list pass4.5s +3 worker pass22.1s at
  test0b6c613/producta21ea34; accepted bounded evidence, NOT final acceptance.
- Local-ops0159466 still unmerged/approval-blocked; no bypass or destructive real-data work.

## Current assignments

| Owner | Next action | Required proof |
|---|---|---|
| EU-V | Correct/run D1.8/D4.6 detail pending proof; only if pass, correct/run visible-keyboard L4.1 | PR19comment5651803847; <=45min work, batches<=5min, no full suite |
| BOOT-ID (fresh session NOT launched) | Owner to launch kickoff/BOOT-ID.md | First-boot identity concurrency regression + narrow backend fix; no shared data/warm-up-as-fix |
| PV-GATE / OCR-PLAN / EU-ERR | Complete and parked | No further writes; OCR remains proposal only |
| Owner/EU-M | Optional limited synthetic preview at a21ea34 under OWNER_PREVIEW.md | First-boot race caveat, exact SHA, native observations, owned cleanup; no real data |
| Integrator | Review bounded checkpoints; gate bootstrap fix when delivered | Full acceptance and separate detail-error disclosure still unresolved |

## Current proof and new limitation

See CONTINUATION_REVIEW.md. Independently ran PV negative checks7/7 atb86db71; author
v6 browser3pass32.9s was on a040e9f with identity already committed. Original v4 fresh
DB1fail/2pass59.7s exposed intermittent uq_users__email bootstrap race. Source-correlated
in current product; not independently reproduced. Warm-up/reload is not a proven fix.
Older independent strict119+focused25 browser passes remain at7ac87d7/a21ea34. No new
full-suite, native PDF, Mac or engine proof. Current metadata recovered after exact tree
comparison/backups; working files preserved, origin31101e3 was intact.

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

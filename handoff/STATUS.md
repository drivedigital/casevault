# Current coordination status

Updated 2026-09-12; EU-V short-batch review after documentation audit008b249.
This is the entry point for current assignments and proof. Historical worklogs,
archived briefs and agent notes are evidence, not current authorization. The latest
explicit owner instruction and current scoped brief take precedence; contracts
remain binding. Update this page when assignments, holds or merge status change.

## Product and branches

- Integration: `arena/01a0899f-casevault`. Product checkpoint:
  `a040e9f739ec3741cd28ee99756d256ea8b78d43`; subsequent integration changes are docs.
- EU-D #18 merged `c8c7d27`; EU-L #17 merged `a040e9f`. Both original sessions are
  closed; do not assign remote work or push their branches from another session.
- EU-V #19 **open, unmerged**, latest inspected `e7fe31e`. Only active verifier.
- Local-ops proposal `0159466` on `codex/local-ops-safety` remains unmerged,
  approval-blocked follow-up not implemented. Never bypass the approval block.
- `dev-logs` contains reports/cumulative patches, not a merge source. Notes from
  `54001f0` were selectively archived at `0788ccc`; no product patch replay.
- No main release, branch deletion or OCR-engine implementation authorized.
  Two fresh-session briefs prepared (not launched here): PV-GATE preview verification
  and OCR-PLAN design-only. Limited owner preview released under OWNER_PREVIEW.md.

## Tasks / acceptance blockers

| ID | Owner | Next action | Exit evidence |
|---|---|---|---|
| V-DIAG | EU-V / integrator | Short batch complete at3c405cf; correction source-reviewed, not independently rerun | Reported T1 1 pass + L1.5 1 pass; earlier selector/focus attempts retained separately |
| V-LIST | EU-V | Next: L2.5 query/filter retry and L3.2–L3.4 row badge only; work30min, tests5min, cases60s, retries0/max-failures1 | Actual uploaded-ID correlation, observed failure + retry recovery, preserved controls/accessibility/no raw trace; checkpoint existing PR19 then stop |
| V-OCR | EU-V, after diagnostic review | Correct result-reader, enums and exact uploaded-ID correlation; establish real integrated OCR proof | Explicit Reprocess job ID -> decoded ocr_source payload -> SQL state/pages -> UI; TXT complete/PDF skipped |
| V-DETAIL | EU-V, after diagnostic review | Triage saved detail failures, especially save-pending candidate | Dispatch AND completion times, action sequence and pending state before calling duplicate PATCH a product bug |
| REVIEW-D/L | Integrator | Limitation notes recovered; no completed independent review | Fresh review requires new accessible session/own branch and explicit scope; do not recycle closed sessions |
| M-PREVIEW | Owner/EU-M | **Limited synthetic preview authorized** at a040e9f after isolation preflight in OWNER_PREVIEW.md; full acceptance/real-data work held | Exact SHA, native browser/download and explicit Reprocess observations, redacted report, owned cleanup |
| PV-GATE | Fresh agent, not launched | kickoff/PV-GATE.md: independent bounded preview verification, <=45min | Focused tests/report, exact job/payload/SQL/UI correlation; new PR, no merge |
| OCR-PLAN | Fresh agent, not launched | kickoff/OCR-PLAN.md: local PDF/image extraction design only, <=45min | Engine/packaging recommendation, safety/acceptance matrix and proposed write sets; note-only PR |
| OPS | Local-ops author/integrator | Separate proposal review; wait for normal approval path | Socket-safe test guard, webhook tests, full gate; no real backup/restore claim from mocks |

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

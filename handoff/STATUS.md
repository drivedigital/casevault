# Current coordination status

Updated 2026-09-12; documentation audit of integration `0788ccc`.
This is the entry point for current assignments and proof. Historical worklogs,
archived briefs and agent notes are evidence, not current authorization. The latest
explicit owner instruction and current scoped brief take precedence; contracts
remain binding. Update this page when assignments, holds or merge status change.

## Product and branches

- Integration: `arena/01a0899f-casevault`. Product checkpoint:
  `a040e9f739ec3741cd28ee99756d256ea8b78d43`; subsequent integration changes are docs.
- EU-D #18 merged `c8c7d27`; EU-L #17 merged `a040e9f`. Both original sessions are
  closed; do not assign remote work or push their branches from another session.
- EU-V #19 **open, unmerged**, latest inspected `2c360a1`. Only active verifier.
- Local-ops proposal `0159466` on `codex/local-ops-safety` remains unmerged,
  approval-blocked follow-up not implemented. Never bypass the approval block.
- `dev-logs` contains reports/cumulative patches, not a merge source. Notes from
  `54001f0` were selectively archived at `0788ccc`; no product patch replay.
- No main release, branch deletion, OCR-engine work or new feature wave authorized.

## Tasks / acceptance blockers

| ID | Owner | Next action | Exit evidence |
|---|---|---|---|
| V-DIAG | EU-V | Restore approved isolated prerequisites (15-min cap), fix L1.5 background-refetch setup, one tooling smoke + L1.5 once (5-min batch cap); stop/report | Exact product/spec SHA, command, outcome, corrected assertion and saved log references; push PR19, no merge |
| V-LIST | EU-V, after diagnostic review | Classify remaining saved list failures, repair invalid specs without weakening requirements | Per-case product/spec/blocked classification plus valid bounded reruns; not just revised counts |
| V-OCR | EU-V, after diagnostic review | Correct result-reader, enums and exact uploaded-ID correlation; establish real integrated OCR proof | Explicit Reprocess job ID -> decoded ocr_source payload -> SQL state/pages -> UI; TXT complete/PDF skipped |
| V-DETAIL | EU-V, after diagnostic review | Triage saved detail failures, especially save-pending candidate | Dispatch AND completion times, action sequence and pending state before calling duplicate PATCH a product bug |
| REVIEW-D/L | Integrator | Limitation notes recovered; no completed independent review | Fresh review requires new accessible session/own branch and explicit scope; do not recycle closed sessions |
| M-HOLD | Owner/EU-M | **HOLD local integration/testing** | Integrator must issue renewed exact checkpoint, focused checklist and explicit go-ahead |
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

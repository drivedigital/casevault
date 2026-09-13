> Current2026-09-13: BOOT-ID.md prepared for one fresh owner-launched session,
> NOT started here. EU-V next bounded scope is PR19comment5651803847. PR20 merged;
> PV/OCR/EU-ERR complete, no further branch writes. STATUS.md is authoritative.

> Current assignments: EU-ERR complete/merged a21ea34; EU-V575d771 authorized
> bounded post-fix tests via PR19comment5649648897; OCR-PLAN parked (proposal only);
> PV-GATE sole writer on combined PR20 for correction comment5649650869. See STATUS.md.

# Current assignments — 2026-09-12

Read [current status](../STATUS.md), [policy](../AGENT_POLICY.md), and
[recovery](../RECOVERY.md) first. Product a040e9f, active closure contract:
`docs/contracts/evidence_ui_closure.md`. Historical briefs do not reactivate sessions.

| Agent | Current state | Authorized next step |
|---|---|---|
| EU-D | PR18 merged c8c7d27; session closed | None. List-review limitation note recovered; new review requires fresh accessible session |
| EU-L | PR17 merged a040e9f; session closed | None. OCR-review limitation note recovered; corrected plan in REVIEW_PATCH_INTAKE.md |
| EU-V | PR19 open; latest inspectede7fe31e | Short batch done; next L2.5 + L3.2–L3.4 only, work<=30min/tests<=5min, retries0; checkpoint/stop, no long rerun or merge |
| EU-M | Limited synthetic preview released | Follow ../OWNER_PREVIEW.md at a040e9f; full acceptance held |
| PV-GATE | Fresh session brief ready, not launched | PV-GATE.md; focused independent preview checks, no product changes |
| OCR-PLAN | Fresh session brief ready, not launched | OCR-PLAN.md; design-only real PDF/image extraction proposal |
| Integrator | Owns integration and shared docs | Review measured results, coordinate fixes, full gate after product merge; do not implement agent features |

D/L/V/M briefs in this directory retain historical implementation scope. Current
EU-V edits remain its contract write set; no product/hub/dependency/CI writes.
D/L original follow-up notes are limitations, not completed independent reviews.
No new session should begin until both product and verifier objects are accessible.

## Evidence and delivery

Commit a redacted run ledger after each bounded batch, then normal push to YOUR
assigned branch and existing active PR. Record full/partial/skipped/blocked counts
separately. If closed, export only authorized notes. Raw synthetic artifacts stay
outside Git; they may not survive reset. Never merge dev-logs or replay cumulative
patches. Never self-merge, take over another session's branch, or force-push.

## Historical waves

Sprint3 and Wave2 delivered: sources0003; intake/ledger/proposals/facts0004;
ledger/inbox UIs, excerpts/reprocess, normal-worker fixes and evidence/intake
verifiers integrated. See ../BRANCH_RECONCILIATION.md, ../WORKLOG.md and the W2-*
briefs for history. No second0003 or reserved0005 intake migration should be created.
Old reset/force-push setup instructions were removed in the documentation audit.

Latest: EU-V bounded list batch1 pass/1 fail; next RQ reader/OCR proof batch.
Third fresh slot EU-ERR.md prepared (not launched) for raw list error disclosure.
OCR-PLAN submitted design PR20; PV-GATE evidence awaited. See STATUS.md latest entry.

OCR-PLAN PR20/61da3b4 reviewed, changes requested (OCR_PLAN_REVIEW.md).
PV-GATE owner reports ready; integrator needs visible PR URL/commit SHA to review.

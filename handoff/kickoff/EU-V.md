> Current task: diagnostic-first per ../STATUS.md and PR19. Existing PR only;
> no long suite before short-batch review, no product fixes or self-merge.
> Original broader acceptance scope follows for reference. EU-M is ON HOLD.

# EU-V — independent evidence browser acceptance

**Recommended assignee:** former WS-D verifier. Start planning now; final proof
waits for both EU-D and EU-L integration SHAs.

## Paste-ready assignment

Read AGENT_POLICY and frozen `docs/contracts/evidence_ui_closure.md` v1.0.
Your assignment is **EU-V**, independent verification, NOT product implementation.
Stay on your assigned session branch. Own only EU-V paths in the contract.

First inventory browser tooling. No web test runner currently exists. Propose
one minimal reproducible setup to the integrator before any dependency/CI change;
keep test files disjoint from EU-D/EU-L. Preparing a checklist and scratch tooling
is unblocked. Do not assert expected behavior from implementation alone.

After D+L merge, run actual browser acceptance against integrated real API using
synthetic fixtures and isolated DB/storage. Cover every acceptance case in the
contract: direct Status/dirty-refetch/reset; downloads and PDF behavior; list and
link errors/retries; keyboard upload; pending-state protection; OCR false/terminal/
timeout/cancellation. Label network/status fault injection separately from real
API/worker tests. Real-worker success requires result payload AND committed state,
not merely queued or RQ FINISHED. No backend/OCR-engine fix scope.

Report product bugs to their owners through integrator; do not weaken tests or
fix pages yourself. If browser binaries unavailable, report blocker and hand
exact scripts to EU-M. Builds and curl are not click-through proof.

Deliver focused verifier PR, `handoff/notes/EU-V.md`, tested merge SHA, browser/
runtime versions, commands/results, exact failures and fixture cleanup. Preserve
current evidence/intake CI jobs; no CI writes without explicit integrator approval.

# Four-deliverable review — 2026-09-12

Source/ancestry/spec review only this turn. No runtime suite independently rerun,
no candidate merge attempted, no product/dependency/CI change. All PRs stay open.

## EU-ERR PR21 — b78fa8274e76027ae1ddfa131855f5527f24f36f

Three-commit chain:75781a0 product helper, ef87ce3 tests, b78fa82 note. Scope
conforms to original brief. Safe allowlisted validation/generic message mapping
addresses arbitrary API detail disclosure across list surfaces. Agent reports
7 new browser tests pass; existing list negative suite10 pass/3 fail because
three tests demand raw injected detail. Product change not ready to merge with
known incompatible browser expectations.

Approved narrow write-set extension: ONLY the three identified expectations in
`tests/browser/eu-list-failures.spec.ts`, replacing raw-message requirements with
safe text plus no-echo assertions, retaining all attribution/uncertainty/retry
semantics. Also correct network text claiming server unreachable (response may
have been lost after commit) and contradictory digit-echo comments. Request all
7 eu-error +18 eu-list tests and web checks; integrator strict gate follows revised
SHA. Detail-page error passthrough is separately flagged, not part of this fix.
Comment5649550926.

## OCR-PLAN + PV-GATE share PR20 and one branch

Actual ancestry on arena/01a097ea-casevault:
2b6688a OCR-PLAN note ->319120e PV tests/note ->61da3b4 delivery note.
PR20 head61da3b4 includes FOUR files, not a note-only design PR. This corrects
previous inability to locate PV: its commit existed beneath the design PR head.
No newer OCR design revision is present; OCR-PLAN note is identical at2b6688a
and61da3b4. Previous concurrency/bounds/state/error/CI design review remains open
(see OCR_PLAN_REVIEW.md, comment5649440419). No engine/dependency approval.

PV evidence is useful: author reports3 tests pass (29.9s), original downloads
byte-exact for TXT/PDF/PNG, explicit two-click TXT/PDF OCR payload/SQL/UI agreement,
Status save and include/exclude persistence. Earlier PDF null-vs0 harness failure
separated honestly. No native PDF/Mac/full acceptance claim. But helper blocks Node
with execFileSync and no child/DB/Redis deadline, so claimed bounded waiting does
not cover a hung bridge. Request async bounded child/connection/read operations,
cancellation, redacted failure output and containment check for stored-file reads.
Correct TXT upload RQ-finished row: text ingestion is inline, no ingest job required.
Clarify product/test commit identity and positively owned cleanup (remote services
left running cannot be assumed alive or safe to remove from this workspace).

Comment5649551113 requests accurate combined PR inventory and ONE delivery writer;
no simultaneous sessions updating the same branch. If two sessions have same branch
assignment, owner must resolve that mapping, not have an agent switch/create a branch.
PV author reruns only3 tests after fix; OCR author revises note only. No merge yet.

## EU-V PR19 — 5e925bee5a0d5152941a829ce427dc894cf89368

Supported RQ return_value/latest_result plus awaited execFile replaces raw result
hash decoding/busy-spin. New assertions require job=ocr_source, exact source_id,
status=complete, expected OCR outcome and page count, SQL page text and UI state.
Agent reports TXT two sequential clicks pass; PDF initially failed incorrect
page_count0 expectation then corrected null and passed two sequential clicks.
This is author-reported integrated OCR orchestration evidence, not extraction,
independently rerun proof or whole acceptance. Other shared-helper tests not rerun.

Requested: restore image test definition (select a bounded run with grep, do not
remove coverage); pass Redis URL through child env and redact child errors; type
page_count as nullable; remove stale unresolved-reader claims; explicit initial
ingest settle before reprocess; cancellable polling child. No full rerun yet.
Comment5649551022. List disclosure rerun waits for revised EU-ERR merge.

## Next sequence
1. Obtain narrow revised PR21; independent strict + focused browser gate then merge.
2. PV helper corrections and accurate combined-PR20 delivery; review original OCR
   design gates (no assumption2b6688a resolved them).
3. EU-V original failing badge + safe-text regression on fixed product SHA, remaining
   list/detail/image cases, then impacted full acceptance suites with measured
   per-run ledger. No additive partial counts or restored raw-detail assertions.
4. Limited synthetic owner preview remains at a040e9f under OWNER_PREVIEW.md until
   a new merged product SHA is explicitly supplied; error-disclosure limitation
   still applies. Full/real-data acceptance and engine implementation remain held.

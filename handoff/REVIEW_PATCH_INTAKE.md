# EU-D / EU-L review-patch intake — 2026-09-12

Source: dev-logs commit `54001f0`, `EU-D.patch` (4412 lines) and
`EU-L OCR Review.patch` (2881 lines). Both fetched/read, never executed.

## Safe disposition
These are cumulative patches against ab0ee23, NOT note-only changes. Reconstructed
both in separate temporary Git indexes outside the working index/tree. All product
paths actually changed by each patch match their already-integrated counterparts;
no new feature correction is supplied. Older shared WORKLOG, kickoff roster and
EVIDENCE_UI_REVIEW snapshots must NOT replace current integration records. Neither
patch includes the other workstream's integrated product changes.

Extracted only the two newly added review notes, preserving their original text
under an archival warning. No dev-logs merge, original implementation replay,
branch takeover, or product/harness changes. Original patch SHA256:
- EU-D: 1cfea33f49e63424d514a8812879391a7e42686e4d5d1ea8b180a544199848a6
- EU-L: 67695b94311bb0978d922543c60fe0944bab2c8f26fae7c904fddac6dc94f382

## EU-D: accepted as limitation report only
The report honestly states neither a040e9f nor 0212370 was accessible and offers
NO classification of the six list failure groups. No browser case was rerun.
Its background-refetch vs reload concern is valid as a review question (and was
already observed by integrator in verifier source), not an independent product
pass/fail. The report's wording "EU-V's merged verifier files" is inaccurate:
PR19 is still unmerged. A valid retry-recovery test must first prove the initial
failure and then prove successful recovery; repeatedly injecting failure on retry
is a separate resilience case, not necessary proof of successful retry.

## EU-L: useful baseline findings, verification plan requires correction
Source inspection at actual product a040e9f confirms these material differences:
1. Plain TXT upload ingests inline in source_service.create_source; it explicitly
   sets enqueue_processing=False. The note's expectation of exactly ONE ingest
   job for TXT is wrong and would block a correct product.
2. Explicit OCR reprocess runs workers.pipeline.jobs.ocr_source on queue `ocr`,
   not process_source on `ingest`. ocr_source returns a dict with job, source_id,
   status, ocr_status and page_count on success. It catches failures and returns
   status=failed/reason; RQ FINISHED is therefore insufficient.
3. Need explicit POST /sources/{id}/reprocess with stages=["ocr"] (prefer actual
   UI click for UI acceptance), capture returned queued=true/job_id and use the
   RQ result API to inspect that EXACT job. Upload-only proof is not OCR reprocess.
4. Uploaded ID correlation is correct. Do not assume every isolated integrated
   database contains prior fixtures; establish actual contents. Likewise injected
   transport responses do not persist invalid values in the real database; the
   invalid OCR/source enum concern concerns fixture fidelity, not proven DB writes.
5. "Established: nothing" is scoped to this reviewer's inaccessible evidence,
   not global absence of OCR evidence. Integrator previously verified D-only
   worker payload/state; combined-checkpoint final acceptance remains separate.
6. A bounded wait expiring leaves job outcome unconfirmed, but any violated test
   deadline/acceptance requirement must still be recorded as a failed or blocked
   test with context—not silently relabel every timeout harmless.

### Corrected minimum verification definition (not executed this turn)
Preflight exact product/verifier SHA, disposable DB/storage/Redis, healthy real API,
normal worker listening on OCR queue, browser and supported RQ result reader.
Use a unique synthetic TXT and PDF, capture actual upload IDs. Wait for initial
upload processing to settle (TXT is inline; PDF ingest may be queued). Then click
Reprocess OCR ONCE per fixture, correlate each POST job_id with Job.return_value()
or latest_result(), require job="ocr_source", matching source_id, status="complete".
TXT: ocr_status complete, page_count1, one committed page with expected text.
PDF: ocr_status skipped; for fresh stub fixture no OCR pages. Verify SQL and UI
for the exact source IDs and original bytes unchanged. No fixture updates by SQL.
Run at most120s AFTER prerequisites, async polling, stop at first mismatch; save
partial observations and timeout classification. Do not auto-enqueue retries.
This minimal two-case probe is NOT the full sequential-reprocess, timeout,
cancellation, error-path or native-PDF acceptance suite. No execution authorized
for EU-M while the owner's current hold remains in force.

## Current verifier evidence / next step
New EU-V checkpoint `2c360a1` was fetched during intake. Its note now REPORTS:
initial integrated OCR10 passed/3 failed, corrected partial OCR3/3; detail initial
10/11 and partial5/1 then4/2; list remains14/6. Raw scratch logs reportedly lost
on reset. These are agent-reported saved counts, NOT independently rerun here,
not additive counts or whole-suite acceptance. The notes also retain stale claims;
EU-V must reconcile them and finish the requested short diagnostic before any
long rerun. Candidate detail save-race finding needs request/response timing proof;
two requests 2654ms apart with1200ms artificial delay alone do not prove overlap.

EU-D/L closed-session notes now safely preserved. Fresh reviewers must use their
own assigned branches and confirm checkpoint access first, never push closed
session branches. EU-M remains ON HOLD per renewed owner instruction, superseding
older checkpoint-release wording; integrator must explicitly issue a new go-ahead,
exact checkpoint and checklist. Local-ops0159466 remains separate/unmerged.

No tests run in this intake: source/patch review and isolated-index reconstruction
only. Restored Git metadata reconciled to remote24a00f6 only after backup and a
no-difference temporary-index comparison. No product files changed.

> Archived reviewer submission, extracted from `dev-logs` commit `54001f0`,
> `EU-L OCR Review.patch`; author-reported local note commit `2646c02`.
> Preserved as a limitation/baseline report, **not completed checkpoint acceptance**.
> See `handoff/REVIEW_PATCH_INTAKE.md` for integrator corrections, current hold,
> and superseding instructions. Do not execute the original cross-session push
> advice or the uncorrected OCR verification plan below.

# EU-L — OCR proof review and minimum verification definition

Assignment: independent review of EU-V's OCR harness/fixtures at verifier
checkpoint `0212370` against integrated product checkpoint
`a040e9f739ec3741cd28ee99756d256ea8b78d43`; review + verification-plan only.
Authorized file: this note. No harness/product/tooling files were read-modified
beyond read-only inspection of the local baseline tree.

## Revisions under review (recorded separately)

| What | Revision | Inspectable this session? |
|---|---|---|
| Integrated product checkpoint (reported) | `a040e9f739ec3741cd28ee99756d256ea8b78d43` | **NO** — object absent from local store; origin unreachable |
| EU-V verifier checkpoint (reported) | `0212370` (full SHA unknown here) | **NO** — object absent from local store; origin unreachable |
| Local baseline actually inspected | `ab0ee23` working tree (restored files preserved untouched) | YES |

## Evidence-access limitation (reported, not guessed)

This Arena session is closed (implementation PR merged); remote git/`gh`
operations are blocked at platform level. Local object store inspection:

- `git cat-file -e a040e9f739ec3741cd28ee99756d256ea8b78d43` → absent
- `git cat-file -e 0212370` → absent
- Branch metadata had rolled back to base `ab0ee23`; even this session's own
  pushed commits (`6bd3cdf`, `14f4491`) are absent from the local object
  store. Restored working-tree files were preserved untouched.

**Consequence:** no claim below is based on the two checkpoints themselves.
Everything harness-specific is classified SUSPECTED / REPORTED-NOT-VERIFIED.
Stable shipped surfaces (enums, worker code, dependency pins, prior handoff
evidence) were confirmed against the `ab0ee23` baseline tree and are labeled
CONFIRMED-AT-BASELINE; the closure-wave freeze kept backend/worker read-only
for D/L/V, so they are expected unchanged at `a040e9f`, but that expectation
is itself unverified here.

## Findings

1. **Injected `ocr_status:"processing"` / `source_status:"processed"` vs
   shipped enums — value/enum mismatch CONFIRMED-AT-BASELINE.**
   Shipped `SourceStatus` = `primary|derived|testimony|working_note|
   public_record` (`apps/api/app/models/enums.py::SourceStatus`): there is no
   `"processed"`. Shipped OCR vocabulary (`apps/web/lib/types.ts::OcrStatus`,
   `OCR_STATUSES`) = `not_started|queued|running|complete|failed|skipped`:
   there is no `"processing"` (that value belongs to the separate
   `ProcessingStatus` vocabulary). `"processed"` appears in *neither*
   vocabulary. `sources.ocr_status`/`processing_status` are free string
   columns (`apps/api/app/models/source.py`), so injected wrong-vocabulary
   values persist silently and the list UI renders them as badge labels
   verbatim — an injected-invalid state looks "alive" while proving nothing.
   Which fixture injects them: SUSPECTED (harness at `0212370` inaccessible).
2. **Raw Redis job-hash result reading vs installed RQ API — mechanism
   CONFIRMED-AT-BASELINE; harness code SUSPECTED.** `workers/requirements.txt`
   pins `rq>=2.2,<3`. RQ 2.x persists successful results under dedicated
   result keys and exposes them via `Job.fetch(id).return_value()`; the legacy
   `rq:job:<id>` hash's result field is not where RQ 2.x results live. A
   harness that reads the raw job hash for a result would legitimately see
   nothing on a successful run — consistent with a saved "worker returned
   `None`" assertion even when the worker succeeded.
3. **Saved "worker returns `None`" assertion vs implementation and prior
   evidence — implementation CONFIRMED-AT-BASELINE; assertion
   REPORTED-NOT-VERIFIED.** `workers/pipeline/jobs.py::process_source` returns
   a structured dict: `{"source_id", "status": "complete"|"already_complete",
   "ocr_status", "page_count"}` (and raises on failure). Prior wave evidence
   (`handoff/notes/W2-G.md` `result.return_value`; `handoff/notes/W2-J.md`
   read-back of real RQ job results from the worker registry) shows structured
   results were retrievable via the RQ API before this wave. A `None` result
   assertion is inconsistent with both; given (2), the `None` is most
   plausibly a harness read-path artifact, not worker behaviour.
4. **Synchronous subprocess polling + busy-wait loop — REVIEW-BLOCKED.** The
   harness is inaccessible; no classification offered. When inspectable,
   check: does the busy-wait sleep (CPU starvation can slow the worker under
   test), does it block the test event loop, is there a bounded timeout, and
   does a poll miss mutate state.
5. **Fixture identity (following the actually-uploaded source) —
   REVIEW-BLOCKED.** The integrated DB after this wave's merges contains
   prior synthetic rows (e.g. `eu-l-*` uploads), so any title/filename-prefix
   lookup can match an older row. Required pattern for the harness: anchor on
   the `id` returned by the upload response and assert every downstream read
   (job payload, SQL row, UI row) against that exact id.

## What integrated OCR evidence is established / missing

- **Established: nothing.** No accessible artifact in this session shows a
  post-merge, real-worker OCR run against `a040e9f`. Pre-merge strict-gate
  counts (119-test floor etc.) are explicitly NOT integrated proof; prior
  W2-J result read-backs are pre-checkpoint and intake-pipeline, not OCR.
- **Missing:** job-id ↔ result-payload ↔ persisted-state ↔ UI correlation on
  the merged tree, for both a real TXT `complete`-path and a PDF `skipped`
  (stub) path.

## Minimum bounded verification (plan; confirm against `0212370` before running)

- **Prerequisites:** fresh checkout of the merged tree (≥ `a040e9f`);
  disposable DB (fresh `casevault_test` via `scripts/agent_pg.py` or compose —
  never the user's DB) + scratch `LOCAL_STORAGE_ROOT`; real `redis-server`
  binary; worker launched via the repo's normal path
  (`workers/run_worker.py`, ingest queue); RQ 2.x client for result read-back;
  real browser per the committed `tests/browser/eu-list-README.md` setup.
- **Case A — real TXT `complete`:** upload one synthetic `.txt` (UI keyboard
  path or `POST /sources`); capture the returned `source_id` (identity anchor).
  Expect exactly one ingest job; fetch its result via `Job.fetch(...).
  return_value()` with a bounded wait; assert payload fields
  `source_id == <uploaded id>`, `status == "complete"`, `ocr_status` in the
  shipped vocabulary, integer `page_count`. Committed SQL: `sources` row with
  that id has `processing_status='complete'`, matching `ocr_status`,
  `page_count=1`, and one `source_pages` row containing the synthetic text.
  UI: the `/evidence` row with that id shows the persisted pages/OCR values.
- **Case B — real PDF `skipped` (known engine stub):** upload one minimal
  synthetic PDF; same job path; payload `status=="complete"`,
  `ocr_status=="skipped"`; SQL: `ocr_status='skipped'`, no pages row expected
  from OCR; UI OCR badge reads `skipped`.
- **Maximum runtime:** ≤120 s wall clock for both cases including worker
  startup; each job itself should finish in seconds. At 120 s: stop, record
  INCONCLUSIVE (not "failed") per contract timeout semantics.
- **Stopping criteria:** stop on the first identity/payload/state mismatch
  (do not retry-loop); a second enqueue for the same source is a failure, not
  a recovery step; no DB writes beyond the two synthetic uploads; stop
  immediately if any prerequisite is unmet and report rather than improvise.
- **Scope separation (explicit):** a green probe establishes ONLY that the
  integrated worker processes one TXT and one PDF with correct result
  payload, persisted state, and UI reflection. It does NOT establish OCR
  timeout/polling-cancellation behaviour, `202 accepted ≠ completed`
  semantics, failed-job/error handling, multi-page OCR, or native PDF
  rendering (EU-M/local tester + full EU-V acceptance remain separate).

## Session/PR record

- Review note committed on session branch `arena/01a08ce1-casevault`
  (SHA in the commit line below / `git log -1`).
- The review-only PR into `arena/01a0899f-casevault` could NOT be opened from
  this closed session (platform-blocked). Next session: push this branch and
  open the focused PR containing only `handoff/notes/EU-L-OCR-REVIEW.md`, then
  re-run this review against the actual checkpoints before anyone executes
  the plan above.

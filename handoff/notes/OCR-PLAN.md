# OCR-PLAN — implementation-ready local PDF/image extraction design

Date: 2026-09-12 · Session branch: `arena/01a097ea-casevault` (fresh session) · Status: DESIGN ONLY
**REVISION 2 (2026-09-12, same PR20): integrator design review returned "changes
requested" with six implementation-design gates (`handoff/OCR_PLAN_REVIEW.md`,
PR20 comment 5649440419). Section "R2" below is the authoritative delta — it
supersedes contradicting lines in §1–§6 and records which gates are resolved in
design vs explicitly unresolved. Prior rationale is preserved unchanged where
not superseded. Reviewer authorization for this revision: note-only follow-up
≤45min, same PR, no self-merge/force-push, no implementation; unresolved
decisions are marked as design gates rather than given invented guarantees.**
Authorized by: `handoff/kickoff/OCR-PLAN.md` (2026-09-12). Write set used: **only this file**.
No code, dependencies, schemas, tests, CI, shared contracts or local-ops files were modified.
No packages were installed. No live case documents, external document services, or
model calls with evidence were used.

**Checkpoint access confirmed.** Product checkpoint `a040e9f739ec3741cd28ee99756d256ea8b78d43`
was absent from the initial shallow clone; recovered via `git fetch origin a040e9f…`
and verified an ancestor of this branch's head `2b7381e` (`git merge-base --is-ancestor`).
Diff `a040e9f..2b7381e` is handoff/docs only, so all code citations below read as
"at product checkpoint." Closed EU-D/L sessions were not reused; their notes were
read as evidence only.

**Fact labels used throughout**

- **[S]** — source-reviewed: read directly in this session (repo tree, git, or a
  URL listed in References).
- **[H]** — hypothesized / reported-but-not-verified in this session; must be
  confirmed before or during implementation.

Governing contracts: `docs/contracts/sprint3_evidence.md` §5 (worker contract,
optional-deps policy) and `docs/contracts/evidence_ui_closure.md` v1.0 (active
closure; OCR polling/UI semantics; "no new OCR engine work until closure
signed off" — this note is design, not engine work).

---

## R2. Revision 2 — gate-by-gate resolution of the integrator design review

Reviewer: integrator, `handoff/OCR_PLAN_REVIEW.md` + PR20 comment 5649440419
(reviewed head `61da3b4`). Direction accepted in principle: native PDF text
first, honest skipped for unimplemented scanned/image OCR, immutable originals,
per-page provenance, OCR fallback later. Six gates follow.

| Gate | Topic | Status in this revision |
|---|---|---|
| G-1 | Cross-entry-point concurrency ownership | **Resolved in design** (advisory-lock ownership + attempt-conditioned commit); requires one explicitly requested API write-set extension; residual limits stated |
| G-2 | Enforceable runtime/memory/time containment | **Partially resolved**: time = enforceable on Linux+Darwin via killable extractor child; Linux memory = rlimits in child; **Darwin memory cap = UNRESOLVED design gate G-2a** |
| G-3 | Derived-state consistency (page_count, latest-attempt vs last-success, mixed/truncated coverage) | **Resolved in design** (last-success dataset frozen on any non-swap outcome; mixed → `skipped`/`partial_no_text_layer`; truncation surfaced); public truncation field needs a small **contract amendment request G-3b** |
| G-4 | Exception-string passthrough | **Resolved**: enumerated public reasons only; `str(exc)` removed everywhere; diagnostics to worker logs + exception class name only |
| G-5 | Existing-test/CI compatibility + required fixtures | **Resolved as plan**: impacted tests enumerated with owners; present/absent engine modes; fail-closed `OCR_REQUIRE_DEPS=1`; mixed/scanned + concurrency + hard-bound regressions are acceptance-required before implementation, not deferrable |
| G-6 | Factual labels, primary sources, pin, timebox contradictions, typo | **Resolved**: primary upstream docs/license/pin added (`pypdf==6.18.1` proposal); blank-vs-scanned declared indistinguishable in slice A; contract-amendment need conceded; timebox wording fixed; "OCR-IMPR" typo fixed |

### R2-G1 — one cross-entry-point ownership mechanism (supersedes §3.3)

The §3.3 status-column claim is withdrawn: `ocr_status` is mutable by the API
(`reprocess` sets `queued` even while an extraction runs) and separate
ingest/OCR column guards do not serialize the two job entry points writing the
same `source_pages` rows. Replacement design — ownership independent of display
statuses:

1. **Ownership = one Postgres session-level advisory lock per source**, taken
   by BOTH `ingest_source` and `ocr_source` as their first step, in the job's
   own DB session: `SELECT pg_try_advisory_lock(hashtext('casevault-ocr:' ||
   :source_id))`. Lock not acquired → return `{"status": "already_running"}`
   (enumerated) and do nothing. One mechanism, both entry points, no second
   writer to `source_pages` can hold it concurrently.
2. **Hard-crash release/recovery is structural**: session advisory locks are
   released by Postgres when the holding connection dies — a killed/OOM'd
   worker needs no reaper, TTL, or stale-lock cleanup. Liveness signal =
   lock availability, never the status columns.
3. **Attempt-conditioned commit**: the reprocess endpoint allocates
   `attempt_next = attempt_last + 1` inside its existing pre-enqueue
   transaction using `SELECT … FOR UPDATE` on the `sources` row (row-lock
   makes the counter increment atomic). The job captures `attempt` at claim,
   and its final swap transaction re-checks, under `FOR UPDATE`, that
   `attempt` is still its own before COMMIT; if a newer request superseded it,
   it **discards** the extracted pages and returns `{"status": "superseded"}`
   with the last-success dataset untouched. Counter storage: first entry in
   `source_metadata.metadata_json["ocr"]["attempt"]` (JSONB read-modify-write
   is safe only under the row lock — the API owns increments, jobs own
   claim/verify).
4. **Explicitly requested write-set extension (integrator must approve — not
   implied as unnecessary)**: `reprocess_source` in
   `apps/api/app/services/source_service.py` gains the attempt-allocation
   block (≈5 lines, behavior otherwise unchanged). If the integrator refuses
   the API change, fallback: jobs allocate `attempt = current + 1` themselves
   under the advisory lock; semantics remain correct (unique attempts,
   superseded detection), but a second rapid reprocess can be refused as
   `already_running` instead of queueing behind the first — stated tradeoff.
5. Status columns (`processing_status`/`ocr_status`) become display hints
   written by the lock holder only; they are never consulted for mutual
   exclusion. Residual limits, stated not hidden: advisory locks protect one
   Postgres database only (multi-DB shard splits would need a new design);
   lock key uses `hashtext` (32-bit collision across distinct sources is
   theoretically possible — acceptably rare, and collision only causes
   mutual exclusion between unrelated sources, never data corruption [H]);
   RQ retries after `already_running` are left to RQ's own retry policy and
   are safe because claim is re-evaluated.

### R2-G2 — enforceable containment (supersedes the enforcement rows of §3.5)

Byte/page/char caps and a post-call clock cannot bound what happens *inside*
`PdfReader`/`extract_text` (decompression bombs, allocations, a single hung
call). Enforcement primitive: **the parser never runs in the worker process.**

- `ocr_extract.extract()` spawns a disposable child via
  `multiprocessing.get_context("spawn").Process` (matches the `run_worker.py`
  spawn posture on darwin; avoids fork-in-worker hazards on Linux too).
  Input = original bytes + bounds via pipe/pickle; output = structured result
  or process death. **The child never receives `DATABASE_URL`/`REDIS_URL`,
  never opens DB/Redis connections, creates no temp files in slice A** —
  cleanup surface is therefore one process handle.
- **Time (both platforms)**: parent `child.join(time_budget)`; on expiry
  `terminate()`, grace wait, then `kill()`. This enforces the time bound even
  inside a single parser call — the bound is a kill, not a check. Outcome:
  `failed`/`time_budget_exceeded`, no swap (old dataset preserved because the
  swap transaction had not started — see R2-G3).
- **Memory (Linux)**: child sets `resource.setrlimit(RLIMIT_AS, cap)` and
  `RLIMIT_CPU` (≤ time budget) before importing pypdf; allocation/decompression
  bombs die inside the child (`MemoryError`/signal), parent survives and maps
  to `failed`/`resource_limit` (enumerated). RLIMIT values are the
  implementation's own defaults (proposed: AS = 4× max in-memory working set
  of a capped document, final numbers in the implementation contract), not an
  optional local OS setting.
- **Memory (Darwin) = UNRESOLVED design gate G-2a**: `RLIMIT_AS` is not
  reliably enforced on macOS [H — known platform limitation; must be verified
  on the owner's Mac]. Proposed enforceable fallback, to be verified before
  implementation acceptance: parent-side RSS watchdog polling the child
  (`/proc/<pid>` on Linux; on darwin sample child RSS and kill on exceed —
  mechanism to be chosen from a verified primitive, e.g. `psutil` as another
  guarded optional dep or `resource.getrusage(RUSAGE_CHILDREN)` deltas).
  Until verified, the honest claim is: **on macOS, per-job wall-clock and CPU
  bounds are hard-enforced; the memory ceiling is best-effort**, and the
  old-results preservation guarantee (R2-G3) is what bounds the damage.
- **Cleanup**: `finally:` → child not alive → `kill()`; sessions closed in
  parent only. On timeout/OOM the previous derived dataset is preserved
  (nothing was swapped); a killed job's `ocr_status='running'` display hint is
  reconciled by the next claim attempt because ownership is the lock, not the
  column (R2-G1.2) — G-3/Q3's stale-running reconciler is thereby folded into
  the ownership mechanism.

### R2-G3 — last-success dataset vs latest-attempt (supersedes §3.4 page-cap line and matrix row 8)

- **Definitions.** *Last-success dataset* = `source_pages` rows +
  `sources.page_count` + `sources.ocr_status` as written by the last COMMITTED
  swap. *Latest-attempt* = metadata only:
  `metadata_json["ocr"]["last_attempt"] = {attempt, outcome, reason,
  pages_total_seen, pages_with_text, pages_truncated, at}`.
- **Rule: anything that is not a successful full swap writes NO pages, NO
  `page_count`, and NO `ocr_status` terminal value that describes extracted
  content** — it writes only `last_attempt` (plus a terminal status when the
  failure itself is the newest truth: `failed`, or `skipped` for
  password/limit outcomes of a *first* run). Specifically the §4 row-8
  behavior "page_count still set to the true count" is **withdrawn**: on
  page-limit skip, `page_count` and pages stay exactly as the last swap left
  them; the true PDF page count lives in `last_attempt.pages_total_seen`.
  `page_count` changes only in the same transaction as the pages it
  describes — the contradiction the review identified no longer exists.
- **Mixed native+scanned** (slice A: some pages have a text layer, some do
  not): pages that extracted text ARE written (useful text is not withheld),
  but the document outcome is `ocr_status='skipped'` with
  `reason='partial_no_text_layer'` — **never `complete`**, so "one good page"
  can never dress up as full extraction. `last_attempt` records
  `pages_with_text` vs `pages_total_seen`. Matrix row 4 is corrected
  accordingly.
- **Truncated pages** (output-char cap): per-page provenance flag plus
  `last_attempt.pages_truncated > 0`, and the page's `ocr_text` visibly ends
  with an ellipsis marker. **G-3b contract-amendment request**: today
  `SourcePageOut` has no truncation field and `layout_json` is not served, so
  plain UI surfacing needs one of (a) additive `SourcePageOut.truncated`
  boolean, or (b) a `page_label` convention. Requested: option (a) as an
  additive 1.x contract change the integrator schedules; until approved,
  truncation is surfaced in `last_attempt` + `ocr_text` marker and the note
  does NOT claim UI-visible truncation.
- **Blank vs scanned (G-6)**: slice A has no rasterizer, so a zero-text
  result cannot distinguish a blank digital PDF from an image-only scan —
  both map to `no_text_layer` with `pages_with_text: 0`. This is a stated
  limit; distinguishing becomes possible only in Design B (raster+image
  heuristics). No claim is made that provenance distinguishes them.

### R2-G4 — enumerated public reasons; no exception passthrough (supersedes §3.2 reason wording and §1.1.4 observation's tolerance)

- Public/machine-reason vocabulary (metadata `ocr.last_attempt.reason`, job
  payload `reason`, and UI-visible text) is a fixed enum: `no_text_layer`,
  `partial_no_text_layer`, `ocr_not_configured`, `password_protected`,
  `page_limit_exceeded`, `time_budget_exceeded`, `resource_limit`,
  `stored_bytes_changed`, `parse_error`, `already_running`, `superseded`.
  Parser exceptions must be assumed to embed document/path/credential
  content; **`str(exc)` is never persisted, returned, or logged at info**.
- Diagnostics: full exception detail goes only to worker logs (job-id
  correlated, redaction-checked by the verifier), plus the exception *class
  name* in `last_attempt.exception_class`. The existing `ocr_source` payload
  behavior (`"reason": str(exc)` today [S]) is listed as an intentional
  behavior change of this design: failure-path payload `reason` becomes
  enumerated-or-null. That is a shared-surface change and is called out in
  the contract-amendment list (R2-G6c), not silently made.

### R2-G5 — existing tests, CI modes, and acceptance-required fixtures

Enumerated impacted expectations (verified by reading the tests this session):

| Test (owner) | Current expectation | With pypdf present |
|---|---|---|
| `tests/api/test_phase2_sources.py` L61–79 (WS-D legacy → integrator-owned) | fake `%PDF-1.4 fake` bytes → `process_source` → `status=="complete"`, `ocr_status=="skipped"`, `page_count is None`, `pages==[]` | unparseable bytes → `failed`/`parse_error` → **assertions break** |
| `tests/integration/test_evidence_e2e.py` L38–51 + downstream PDF case (WS-D) | hand-crafted **valid** 2-page synthetic PDF (real xref/pages/text) treated as stub-skipped | becomes the digital-text happy path (`complete`, 2 pages) → **inverted expectations break** |
| `tests/browser/eu-detail.spec.mjs` L413–428 "honest empty (pdf, no OCR engine)" (EU-D, session closed) | PDF upload → OCR tab shows "No pages extracted yet" | pages now exist → **breaks** |
| PNG cases in `test_phase2_sources.py` L83ff | `ocr_status=="skipped"` | stays `skipped` (`ocr_not_configured`) → compatible |

Coverage modes (disjoint ownership, no silent skips):

- **Engine-absent mode** (default today, must keep passing unchanged except
  the stub reason prose → enumerated `ocr_not_configured`; no enumerated test
  asserts the old prose [S — verified by reading the assertions above]):
  current behavior contract preserved.
- **Engine-present mode**: OCR-IMPL's new unit tests + OCR-VERIFY's
  integration tests, gated behind `OCR_REQUIRE_DEPS=1` (same fail-closed
  pattern as `EVIDENCE_REQUIRE_DEPS` [S]) so required engine proof **cannot
  silently skip**; without the flag they skip visibly as optional-tier.
- **CI**: the integrator-owned one-pip-line change installs
  `workers/requirements-ocr.txt` in the `evidence`/`python` job **and** the
  impacted-test edits below are part of the same reviewed change — not
  distributed silently.
- **Required before implementation acceptance (not deferrable, per review)**:
  mixed/scanned fixture behavior (row 4, 2), concurrency regression (two
  concurrent `ocr_source` calls → exactly one extracts, other returns
  `already_running`), hard-bound regressions (time-budget kill of a
  deliberately slow child → `time_budget_exceeded`, old pages preserved;
  page-cap skip → dataset untouched). These live in OCR-IMPL's owned test
  files; existing suites are edited only as listed above, by approval.
- **Requested existing-test edits (integrator to assign/own or explicitly
  grant)**: the three broken-expectation rows above get explicit
  engine-present branches (or the integrator schedules them); OCR-IMPL does
  not touch them silently (policy hard rule 8).

### R2-G6 — labels, primary sources, pin, wording

- **Pin proposal**: `pypdf==6.18.1` (exact) or `pypdf>=6.18.1,<7` —
  primary source [S]: PyPI metadata `license_expression: BSD-3-Clause`,
  `requires_python: >=3.9`, trove classifiers 3.9→**3.14** (upstream
  *declares* 3.14; our own 3.14 verification is still required and remains
  listed unverified). AES-encrypted fixture needs `pypdf[crypto]` extra
  (RC4 is core) — matrix row 7 updated. Primary links added to References;
  third-party comparisons demoted to secondary background.
- **Contract amendment list (conceded — JSONB capacity is not a waiver)**:
  (a) R2-G1 API attempt-allocation extension; (b) R2-G3b additive
  `SourcePageOut.truncated`; (c) job payload `reason` enumerated-or-null +
  additive payload keys; (d) enumerated reason vocabulary as a shared
  vocabulary; (e) existing-test edits above. Proposal: additive 1.x of the
  new OCR contract; nothing in shipped `sprint3_evidence.md` is edited.
- **Wording fixes**: "OCR-IMPR" typo → "OCR-IMPL". The §5.5 hour figures are
  effort estimates for *future implementer/verifier sessions* to aid
  scoping — they are not this session's bound and do not authorize
  multi-hour work in a 45-min-bounded session; this revision consumed the
  reviewer's ≤45min note-only bound. "Normative for the implementing wave"
  (§3 header) is downgraded to **proposal pending contract freeze**; title
  word "implementation-ready" retained only as the brief's deliverable name,
  with all unresolved gates explicit in the R2 table.
- **Explicitly unverified (unchanged from R1, restated under review rule)**:
  no package install, no engine run, no accuracy/security benchmark, no
  Linux/Darwin runtime test of the child-process design, no pypdf
  exception-content audit, no 3.14 runtime check. These stay gates until a
  properly authorized implementation/verification session runs them.

---


## 1. Audit of `process_source`, `ocr_source` and the status/page/metadata APIs

### 1.1 Why PDF/image sources skip today — exact mechanics [S]

1. `apps/api/app/services/source_service.py::classify_source` maps extension or
   client MIME → `SourceType` (`.pdf→pdf`, image extensions → `image`). Type is
   decided from filename/MIME only — **bytes are never sniffed**.
2. `create_upload`: text types (`text|markdown|email|note`) are ingested inline
   (`ingest_text` writes page 1, `ocr_status='complete'`,
   `processing_status='complete'`, `ingest_method='inline_text'`); every other
   type gets `processing_status='queued'`, `ocr_status='not_started'` and a
   best-effort enqueue of `workers.pipeline.jobs.process_source` onto the
   `ingest` queue. Enqueue failure is swallowed (warning log) — a redis-less
   install leaves the source `queued` forever; `python -m workers.run_process`
   is the manual drain path.
3. `workers/pipeline/jobs.py::process_source`: for non-text types it takes the
   else-branch and does exactly:
   `source.ocr_status = "skipped"` plus
   `_merge_metadata(..., {"ingest_method": "worker_stub", "ocr": {"engine":
   "stub", "reason": "No OCR engine wired in this build …"}})`, then sets
   `processing_status = "complete"`, writes **no** `source_pages` rows, leaves
   `page_count` NULL, and returns
   `{"source_id", "status": "complete", "ocr_status": "skipped",
   "page_count": None}`. This is a **deliberate stub**, recorded as such in
   `handoff/DECISIONS.md` (Sprint 3) and `handoff/KNOWN_ISSUES.md` ([High] OCR
   is a stub).
4. `workers/pipeline/jobs.py::ocr_source` (W2-EV reprocess entry): same
   else-branch; sets `ocr_status='running'` **unconditionally** (no claim
   guard), then `skipped` + `ocr.engine=stub` + `ocr_reprocessed_at`. Unlike
   `process_source`, it catches **all** exceptions and returns
   `{"status": "failed", "reason": str(exc)}` — in RQ terms the job
   *succeeds* while the payload says failed. `process_source` instead rolls
   back, marks `processing_status='failed'` via `_mark_failed_quietly`, and
   **re-raises** (RQ marks the job failed). This asymmetry is intentional but
   must be understood by any verifier: **the RQ job state and the payload
   disagree by design on the ocr path** — proof must read payload *and* SQL
   (matches `handoff/notes/EU-L-OCR-REVIEW.md` finding 2: results must be read
   via RQ 2.x `Job.fetch(id).return_value()`, not the legacy raw job hash).
5. The reprocess API `POST /sources/{id}/reprocess` (202, `ReprocessOut
   {queued, job_id, reason}`) sets `ocr_status='queued'` **before** attempting
   enqueue; `queued:false` + reason means "no queue reached" (contract
   `evidence_ui_closure.md` §5: 202/queued:true ≠ completed).

So "PDF/image now skip" because: the upload path routes non-text types to a
worker job whose only implemented behavior for those types is the stub branch
— there is no wired extraction engine anywhere in the repo (`ocr_engine`
setting exists in `apps/api/app/config.py` but is read by nothing [S];
`OCR_ENGINE`/`TESSERACT_PATH` are spec'd env vars, unused in code [S]).

### 1.2 The three distinct things that must not be conflated

| Concern | Where it lives | Status at `a040e9f` |
|---|---|---|
| **Born-digital PDF text extraction** — decoding the text operators of a PDF that already has a text layer into `source_pages.ocr_text` | worker (none today) | **Missing.** Even this stub-free step has never existed; `page_count` for PDFs is NULL [S] |
| **Scanned-PDF/image OCR** — rasterizing pages/images and recognizing glyphs with an engine (Tesseract today per spec; VLM later) | worker | **Missing** (stub marks `skipped` with reason) [S] |
| **Native PDF preview** — rendering the *original* bytes in the browser via `/sources/{id}/file` (EU-D Blob/object-URL preview) | web UI | **Shipped** by EU-D (merged `c8c7d27`) [S]; renders originals only, performs no extraction, must remain decoupled from OCR. A working preview is **not** extraction (STATUS.md says exactly this) |

Design consequence: these are separate backlog items with separate engines.
The smallest honest vertical slice starts with born-digital text (§2) because
it needs no OCR engine; scanned/image OCR is the second slice behind the same
interface.

### 1.3 Additional audit observations the design must respect [S]

- `sources.processing_status` / `sources.ocr_status` are free `String(64)`
  columns; the real vocabularies are enforced only by convention (TS
  `OcrStatus`/`ProcessingStatus` unions in `apps/web/lib/types.ts`; worker/API
  string literals). Wrong-vocabulary values persist silently (EU-L-OCR-REVIEW
  finding 1). Design must reuse **only** the existing vocabulary:
  `processing_status ∈ {queued, processing, complete, failed}` (plus legacy
  `partial` in TS), `ocr_status ∈ {not_started, queued, running, complete,
  failed, skipped}`. No new values → no UI/type churn.
- `source_pages` has `UNIQUE (source_id, page_number)`; `layout_json` (JSONB)
  and `image_path` already exist — per-page provenance and (later) raster
  images fit **without migration**.
- `source_metadata.metadata_json` already carries `ingest_method`,
  `ocr.{engine,reason}`, `ocr_reprocessed_at`, `duplicate_of`, `ingest` — job
  level provenance extends additively.
- `source_excerpts` anchors on `page_start/page_end` **numbers**, not page row
  IDs [S] — so deleting/recreating page rows during reprocess does not orphan
  user excerpts (but see §3.4 caveat).
- `process_source` commits `processing_status='processing'` before working and
  early-returns `already_complete` when it sees `complete` — combined with the
  API's "set queued first" behavior this gives de-facto re-run semantics, but
  there is **no claim guard**: two concurrent workers can both run `ocr_source`
  on the same source (RQ runs jobs serially per worker process; two worker
  processes or a retry can race). §3.3 fixes this.
- Uploads are fully buffered (`await file.read()`) with a 100 MB
  `max_upload_bytes` guard [S] — the worker therefore reads whole files of up
  to 100 MB; bounds in §3.5 are mandatory, not optional.
- `run_worker.py` process model [S]: darwin → `rq.SpawnWorker` (rq ≥ 2.2,
  else `SimpleWorker` with loud warning); everything else → default forking
  `rq.Worker`. The macOS crash (`handoff/OCR_CRASH_REPORT.md`) was
  fork-child + libpq/CoreFoundation, **not** PDF parsing; any engine design
  must keep working under both fork (Linux) and spawn (darwin).

---

## 2. Engine choice — smallest local-only vertical slice

Constraint base [S]: local-first (`docs/specs` Technical Spec §15.1 names
OCRmyPDF/Tesseract + pdfplumber/PyMuPDF as candidates); dependency policy
(sprint3 §5): OCR/PDF libraries are **optional imports** declared in a new
`workers/requirements-ocr.txt`; `requirements-dev.txt` and CI keep passing
without them; mandatory deps need a DECISIONS entry. CI runs Python 3.12 on
Linux [S]; the owner's Mac runs Python 3.14 Homebrew, and **3.14 compatibility
is explicitly unverified** (`handoff/EU_M_CHECKPOINT.md`, KNOWN_ISSUES).

### 2.1 The two practical designs

**Design A — "native-text-first, OCR-ready" (pypdf only, no OCR engine yet).**
New worker module (e.g. `workers/pipeline/ocr_extract.py`) with guarded
optional imports:

- `pypdf` [S: BSD-3-Clause, pure Python, requires Python ≥ 3.9, current line
  6.x, zero system dependencies; per multiple 2026 comparisons its extraction
  is "basic" — multi-column/unusual encodings can garble]. **R2 pin proposal:
  `pypdf==6.18.1` (primary PyPI metadata: `license_expression: BSD-3-Clause`,
  `requires_python: >=3.9`, classifiers 3.9–3.14 — upstream-declared, our own
  3.14 check still required).** For
  `SourceType.pdf`: cheap `PdfReader` open → real `page_count` (fixes the NULL
  today) → per-page `extract_text()`.
- Per-page outcome recorded in provenance (§3.2): `method=pdf_native_text`
  when chars > 0, else `method=none` (blank page or image-only page).
- Document outcome: ≥1 page with text → `ocr_status='complete'` with
  `ingest_method='worker_pdf_native'`; **zero** pages with text →
  `ocr_status='skipped'` with machine reason `no_text_layer` (covers scanned
  and truly blank) — never `complete` with no text.
- `SourceType.image` (and spreadsheet/other): unchanged `skipped`, but with
  the same machine-readable reason vocabulary (`ocr_not_configured`) and real
  metadata. `page_count=1` for images.
- No Tesseract, no rasterizer, no system packages. CI-testable with pure
  Python synthetic fixtures.

**Design B — "text + OCR fallback in one slice" (pypdf + rasterizer +
Tesseract).** Adds: `pytesseract` [S: Apache-2.0, thin pure-Python wrapper,
requires the Tesseract binary + Pillow] and Tesseract itself [S: Apache-2.0;
brew formula 5.5.x with Apple-silicon bottles; apt `tesseract-ocr`]; page
rasterization via `pypdfium2` [S: Apache-2.0 **or** BSD-3-Clause dual license,
PDFium binary bundled in wheels, no mandatory runtime deps] rather than
Ghostscript [H: AGPL — licensing surface to avoid] or poppler/pdf2image [H:
poppler is GPL — subprocess "mere aggregation" but still policy-relevant].
`ocrmypdf` (17.x: Python 3.11+/3.12+ recommended, Tesseract 4.1.1+,
pypdfium2-or-Ghostscript, fpdf2+uharfbuzz; MPL-2.0 [H — verify at review])
produces a *searchable PDF*, which would additionally require reading the text
layer back out and deciding where a derived PDF may live — extra surface
Design A/B-lean avoids for the first slice.

### 2.2 Comparison and choice

| Dimension | Design A (chosen now) | Design B |
|---|---|---|
| System dependencies | none | Tesseract binary + language packs on every platform (brew/apt/Windows), plus rasterizer wheel |
| New Python deps | 1 (pypdf, pure, BSD) | 3+ (pytesseract, Pillow, pypdfium2) |
| CI impact | none required (optional-deps tier; pure-Python fixtures) | CI needs `apt tesseract-ocr` + traineddata or tests skip — CI is integrator-owned (`AGENT_POLICY` §2) |
| macOS/3.14 risk | minimal (pure Python) | binary-on-PATH, `TESSDATA`, Pillow/pytesseract wheel & 3.14 checks,SpawnWorker interplay |
| Security surface | PDF parser only, bounded (§3.5) | + image decompression-bomb, subprocess spawning, temp-file hygiene |
| Scanned PDF / image text | **not extracted** (honest `skipped: no_text_layer` / `ocr_not_configured`) | extracted with per-page OCR provenance |
| Fits 45-min-scoped work packages | yes (§5.5) | no — a full engine wave |

**Chosen: Design A now, deliberately shaped as the seam for Design B.** The
worker module exposes one function — `extract(source_type, mime, path, bounds)
-> ExtractResult` — whose PDF branch is pypdf-native in slice A; the scanned/
image branch returns `Skipped(reason="ocr_not_configured")` today and becomes
a Tesseract implementation later without touching job plumbing, statuses, or
tests' shape. Rationale: it delivers real, verifiable value immediately (real
PDF page counts, born-digital text, machine-readable skip reasons, the entire
safety/idempotency/provenance skeleton — which is where most of the risk
lives), with zero system dependencies and zero CI changes, while the actual
OCR engine remains behind the dependency/security review the kickoff reserves
for the integrator/owner. Tradeoff accepted: scanned PDFs and images still
produce no text in slice A — the UI will continue to show `skipped`, now with
a truthful, specific reason instead of the generic stub text.

### 2.3 What needs actual compatibility checks (runs, not assumptions)

1. **Python 3.12 / Linux (CI sandbox):** `pip install pypdf` into the dev
   venv, run the new worker unit tests + strict gate with
   `EVIDENCE_REQUIRE_DEPS=1`. Pure Python → expected green [H], must be run.
2. **Python 3.12 and 3.14 / macOS (owner machine):** same venv install +
   targeted worker tests through the normal launcher (`make worker`, platform
   default SpawnWorker) with one synthetic PDF. Per policy, 3.12 success does
   **not** establish 3.14; both must be observed and recorded.
3. **SpawnWorker job process executing pypdf end-to-end** (upload → ingest →
   payload read-back via `Job.return_value()`) — no fork hazard expected from
   a pure-Python parser [H]; verify once on darwin.
4. Design B only (later): tesseract on PATH from the worker's environment
   (brew prefix vs GUI-launch PATH), `pytesseract.pytesseract.tesseract_cmd`
   override support, `tesseract-ocr-eng`/traineddata presence per platform
   (English is *usually* bundled but "not always" — ocrmypdf languages doc
   [S]), Pillow/pytesseract wheels on 3.14, and CI apt install decision.

No install was performed in this session; the above is the checklist for the
implementation wave.

---

## 3. Safety specification (normative for the implementing wave)

> **R2 downgrade:** proposal pending contract freeze — not normative. Where
> R2 (above) supersedes this section, the R2 text wins; conflicts are marked
> inline.

### 3.1 Immutable originals

- The job reads bytes only via `LocalStorage.read(source.storage_path)`
  (containment-checked) [S]; it never writes to, moves, renames, or re-saves
  the original file; `storage_path`, `sha256`, `file_size_bytes` on `sources`
  are never mutated by extraction. `GET /sources/{id}/file` must keep serving
  byte-identical originals (acceptance A-9).
- Recompute sha256 of stored bytes at job start; mismatch vs `sources.sha256`
  → terminal `failed` with reason `stored_bytes_changed` and **no** page
  writes (integrity, not engine, failure).
- Any future derived artifacts (e.g. Design B page rasters) go under a
  `derived/` storage prefix referenced by `source_pages.image_path`; never
  under `uploads/`.

### 3.2 Per-page provenance (no migration; additive JSONB)

- `source_pages.layout_json["provenance"]` = `{"method":
  "pdf_native_text"|"ocr"|"none", "engine": "pypdf <version>", "char_count":
  int, "page_index": int, "extracted_at": iso8601, "duration_ms": int,
  "truncated": bool|undefined}`.
- `source_metadata.metadata_json["ocr"]` (merge, preserving
  `ocr_reprocessed_at` etc.): `{"engine": "pypdf", "engine_version": …,
  "mode": "native_text"|"ocr"|"stub", "attempt": n, "pages_total": n,
  "pages_with_text": n, "bounds": {…echo applied caps…}, "reason": <for
  skipped/failed>}`. Existing keys keep their meaning; nothing is removed.
- All provenance strings are engine metadata only — **never document text**
  (no evidence leakage into logs/metadata; reasons are enumerations, not
  exception dumps; `reason` values: `no_text_layer`, `ocr_not_configured`,
  `password_protected`, `page_limit_exceeded`, `time_budget_exceeded`,
  `stored_bytes_changed`, `parse_error`, plus `str(exc)` only in the existing
  failed-payload `reason` field, length-capped to ~2 KB and content-free of
  page text [H — verify no pypdf exception text echoes document content;
  sanitize defensively]).

### 3.3 Repeat / idempotency semantics

> **R2 superseded:** the status-column claim below is withdrawn — replaced by
> R2-G1 (advisory-lock ownership + attempt-conditioned commit). Retained only
> as the original rationale.

- **Claim guard:** replace the unconditional `ocr_status='running'` with a
  conditional claim: `UPDATE sources SET ocr_status='running' WHERE id=:id AND
  ocr_status IN ('not_started','queued','complete','skipped','failed')`;
  rowcount 0 → return `{"status": "already_running"}` without duplicating
  work. `ingest` claim mirrors this against `processing_status`.
- **Reprocess is a full re-run:** always re-read original bytes and rebuild
  pages from scratch; identical input ⇒ identical extracted text
  (deterministic). Direct double-enqueue of `process_source` keeps the
  existing `already_complete` early return [S].
- **Attempt counter** in `metadata_json["ocr"]["attempt"]` increments per run
  — makes "reprocess actually ran" independently provable.
- **Excerpt safety:** excerpts anchor page *numbers* [S]; page rows are
  recreated with new UUIDs on reprocess — no orphan rows. Caveat: if a
  reprocess changes page count, old `page_start/page_end` values may point
  past the new last page; flag such excerpts in a follow-up note, do **not**
  delete or rewrite them (policy hard rule 7: never delete evidence records
  as a side effect).

### 3.4 Atomic replacement of derived pages; failure outcomes; cleanup

- Build the complete new page set **in memory** (bounded), then in a **single
  DB transaction**: `DELETE FROM source_pages WHERE source_id=…` → insert new
  rows → update `page_count`, `ocr_status` → merge metadata → `COMMIT`. Any
  exception before COMMIT ⇒ rollback ⇒ old pages survive intact (current
  delete-then-insert is already one transaction [S]; keep and test it).
- No partial page sets are ever committed. Bounded-run expiry and page-cap
  are decided **before** any swap (§3.5) — an over-budget run ends `failed`
  (reason `time_budget_exceeded`) or `skipped` (`page_limit_exceeded`) with
  the previous page state untouched, never "complete with the first N pages".
- Failure mapping (no success-shaped failures):
  - corrupt/unparseable (parser exception) → `ocr_status='failed'`,
    `processing_status='failed'` for the ingest stage, metadata
    `ocr.reason='parse_error'`; job returns `{"status":"failed", …}`;
    `process_source` continues to re-raise (RQ-visible failure) [S behavior
    preserved].
  - encrypted/password → **`skipped`** with `password_protected` (engine
    worked; document legitimately inaccessible — distinct from failed).
  - scanned/no-text (slice A) → `skipped`/`no_text_layer`. Truly blank
    digital PDF lands here too; provenance records `pages_with_text: 0` so
    the two are distinguishable in data.
  - oversized (pages or time) → `skipped`/`page_limit_exceeded` (cheap
    pre-parse page count known) or `failed`/`time_budget_exceeded` (mid-run).
  - Worker hard-crash (OOM/kill): RQ marks job failed; source may stay
    `running` — **known gap**, see §6 open question Q3; do not fake a
    terminal state.
- Cleanup: any temp resources (Design B rasters; slice A needs none) in
  `finally:` blocks; scratch roots only (`LOCAL_STORAGE_ROOT`), never `data/`
  in tests [S policy].
- Cancellation: RQ 2.x has no safe mid-job cooperative cancel [H — matches
  EU-D's client-side cancellation design]; the bound is the guarantee: every
  job is short by construction (§3.5). The UI already stops polling on
  unmount/source-change/terminal states (closure contract §5) [S]; a late
  finishing job simply lands its terminal state in the DB (source of truth)
  and appears on next refresh — documented, not a bug.

### 3.5 Bounds (worker-read env, defaults; no API config edits)

> **R2 superseded in part:** the caps stay as policy inputs, but enforcement
> now comes from the killable extractor child + Linux rlimits (R2-G2); the
> "behavior on exceed" for page limits is corrected by R2-G3 (dataset
> untouched, no true `page_count` write). Retained as the original rationale.

| Bound | Env (proposed) | Default | Behavior on exceed |
|---|---|---|---|
| Pages per document | `CASEVAULT_OCR_MAX_PAGES` | 200 | `skipped` / `page_limit_exceeded`; `page_count` still set to the true count |
| Wall clock per job | `CASEVAULT_OCR_TIME_BUDGET_S` | 120 s | `failed` / `time_budget_exceeded`, no page swap |
| Per-page stored chars | `CASEVAULT_OCR_MAX_PAGE_CHARS` | 200_000 | page text truncated, `provenance.truncated=true` |
| Upload size (existing) | `max_upload_bytes` | 100 MB | already enforced at API [S] |
| (Design B) raster DPI / max pixels | TBD in B's contract | 150–200 DPI; Pillow `MAX_IMAGE_PIXELS` default kept | page-level `skipped` provenance note |

Memory: bounded transitively by upload cap + page cap + per-page char cap;
pypdf holds per-page strings, not whole-document images [H — verify with the
largest synthetic fixture]. A pathological-file OOM remains possible; the
response is the §3.4 crash path plus optional OS-level limits documented for
the local tester (not code in slice A).

---

## 4. Synthetic acceptance matrix (fixtures generated in-repo; never real case data)

Fixture strategy (zero new test deps): minimal valid PDFs as literal byte
constants hand-crafted in the test module (a tiny 1–2 page text PDF is a few
hundred bytes); encrypted variant produced at runtime by encrypting fixture 1
with pypdf itself (the engine under test — acceptable, dependency-free);
PNG/JPEG as embedded tiny byte constants; **scanned-PDF fixture** (image-only
page) hand-crafted as a PDF with a small image XObject [H — craftable; if it
proves brittle, generate it under Design B's fixture wave instead and run
A-matrix cases 1–9 meanwhile]. All fixtures synthetic, generic names
(`synthetic-two-page.pdf`), committed test code only.

| # | Fixture | Job under test | Expected `ocr_status` (+metadata reason) | Expected pages / page_count | Extra assertions |
|---|---|---|---|---|---|
| 1 | digital-text PDF, 2 pages, known strings | `process_source` (ingest) | `complete` | 2 rows, page_text matches | `ingest_method='worker_pdf_native'`, per-page `method=pdf_native_text` |
| 2 | scanned PDF (image-only) | `ocr_source` | `skipped` / `no_text_layer` | 0 rows; `page_count` = true count | provenance `pages_with_text: 0` |
| 3 | PNG and JPEG | `ocr_source` | `skipped` / `ocr_not_configured` | 0 rows; `page_count=1` | no exception, payload `status=complete` (stage completed, OCR skipped) |
| 4 | mixed: page 1 text + page 2 image-only | `ocr_source` | `skipped` / `partial_no_text_layer` (R2-G3; R1 said `complete` — withdrawn) | 2 rows; page 1 text present, page 2 `ocr_text` NULL/empty | page-level methods differ (`pdf_native_text` vs `none`); `last_attempt.pages_with_text=1` of 2 |
| 5 | blank valid PDF (no content streams with text) | `ocr_source` | `skipped` / `no_text_layer` | 0 rows | **indistinguishable from scanned in slice A** (R2-G3/G-6); `pages_with_text: 0` |
| 6 | corrupt: valid fixture byte-truncated / `%PDF` header garbage (mirrors current test style [S]) | both | `failed` / `parse_error` | **previous page state unchanged** (atomicity) | `processing_status='failed'` for ingest path; RQ job state vs payload asymmetry documented (§1.1.4) |
| 7 | encrypted (pypdf-supported cipher — RC4 natively; AES only if `cryptography` present [S: requires the `pypdf[crypto]` extra per primary PyPI metadata]; random synthetic password) | `ocr_source` | `skipped` / `password_protected` | 0 rows | **not** `failed` |
| 8 | huge-by-count: synthetic PDF declared/crafted > `MAX_PAGES` (test override env, e.g. cap=2) | `ocr_source` | `skipped` / `page_limit_exceeded` | 0 rows written; **`page_count`/pages left exactly as the last swap left them (R2-G3)** | true count only in `last_attempt.pages_total_seen`; cap is env-overridable in tests |
| 9 | repeat reprocess ×2 on fixture 1 | `ocr_source` twice | `complete` both times | exactly 2 rows after each run (no duplicates) | identical text; new page UUIDs; `attempt` 1→2; `sources.sha256` unchanged; **original-byte equality**: `GET /sources/{id}/file` bytes hash == upload hash; excerpts (pre-created on page 1) still present |
| 10 | claim race: source already locked by a live extraction, second `ocr_source`/`ingest_source` call (R2-G1) | both entry points | second returns `already_running`, no second page rebuild, no status-column dependency | dataset unchanged | ownership via advisory lock, not status columns; **acceptance-required concurrency regression** |
| 11 | slow extractor child > time budget (stubbed slow parse in child) | `ocr_source` | `failed` / `time_budget_exceeded` | previous pages preserved (no swap started) | parent kills child (`terminate`→`kill`); acceptance-required hard-bound regression (R2-G2) |
| 12 | allocation bomb / huge decompression stream (crafted, Linux-only assertions) | `ocr_source` | `failed` / `resource_limit` | previous pages preserved | child rlimit death contained; darwin memory bound = open gate G-2a, explicitly not claimed |
| 13 | rapid double reprocess (second request while first queued/running) | API + jobs | attempt increments; if a newer attempt supersedes an in-flight one → `superseded`, last-success dataset intact (R2-G1.3) | dataset consistency | attempt-conditioned commit proof |

**Cross-surface agreement (every applicable row):** RQ job payload (read via
`Job.fetch(id).return_value()` — RQ 2.x result keys, not the legacy hash [S
per EU-L-OCR-REVIEW]) ⇔ SQL `sources` row (`processing_status`, `ocr_status`,
`page_count`) ⇔ `source_pages` rows ⇔ `GET /sources/{id}` and
`GET /sources/{id}/pages` responses ⇔ web UI (`/evidence/[id]` badge +
page list, existing `OcrStatus` vocabulary only). Never assert a PDF row
"complete" when `ocr_status='skipped'` — the two statuses answer different
questions (§1.1) and both must be checked explicitly.

---

## 5. Delivery plan — write sets, compatibility, sequencing

### 5.1 Disjoint write sets (for integrator to freeze in a new contract)

> **R2 addition:** two explicitly requested write-set extensions, per the
> review rule "request shared surface changes explicitly instead of implying
> they are unnecessary": (1) the R2-G1 attempt-allocation block in
> `reprocess_source` (`apps/api/app/services/source_service.py`); (2) the
> enumerated existing-test edits in R2-G5 (three rows, engine-present
> branches). Both are integrator-owned unless explicitly granted.

**OCR-IMPL (implementer, fresh session):**
`workers/pipeline/ocr_extract.py` (new), `workers/pipeline/jobs.py`
(pdf/image branches only; the file currently has no active owner — integrator
confirms assignment), `workers/requirements-ocr.txt` (new, per sprint3 §5
naming), `tests/workers/test_ocr_extract.py` + `tests/workers/test_pipeline_pdf.py`
(new), `handoff/notes/OCR-IMPL.md`.
Read-only: everything else — no API/router/schema/model edits, no
`workers/queues.py`, no `run_worker.py`, no web files, no CI, no Makefile.

**OCR-VERIFY (verifier, fresh session, after merge of OCR-IMPL):**
`tests/integration/test_ocr_reprocess.py` (new; API → real enqueue → real
worker → payload → SQL → pages API, `EVIDENCE_REQUIRE_DEPS`-aware fail-closed
pattern [S existing pattern]), optionally `scripts/ocr_probe.py` (new),
`handoff/notes/OCR-VERIFY.md`. Read-only product code; reports defects, does
not fix them (policy §1).

**Integrator-only (by request):** one CI line if the `evidence`/`python` job
should install `workers/requirements-ocr.txt` (recommended, one pip line —
keeps engine tests in CI green rather than skipped); any
`apps/web/lib/types.ts` additions (none needed); DECISIONS entries for
dependency approvals; contract freeze for the wave.

### 5.2 API/schema compatibility — additive 1.x contract amendment requested [R2-revised]

> **R2 revision:** R1's "no contract version bump required" is **withdrawn** —
> metadata-shape compatibility does not waive contract review. Explicit
> amendment list (all additive; proposal: version 1.x of the new OCR
> contract, nothing in shipped `sprint3_evidence.md` edited): (a) API
> attempt-allocation in `reprocess_source` (R2-G1.4); (b) additive
> `SourcePageOut.truncated` boolean (R2-G3/G-3b); (c) job payload `reason`
> becomes enumerated-or-null plus additive payload keys (R2-G4 — a shared
> failure-path vocabulary change); (d) enumerated reason vocabulary adopted
> as shared vocabulary; (e) the R2-G5 existing-test edits. Endpoints,
> response *shapes* (other than (b)/(c)), status vocabularies, and queue
> names remain unchanged; job function signatures unchanged.

### 5.3 Migration need — none (verified, not assumed)

Provenance fits existing `source_pages.layout_json` +
`source_metadata.metadata_json` (JSONB) [S]; `page_count` column exists; no
new enum values (free string columns + existing TS unions) [S]. No Alembic
revision is created; nobody touches `alembic/` (policy hard rule 4).

### 5.4 Dependency approvals required before implementation

1. `pypdf` (Design A) as an **optional** dependency: new
   `workers/requirements-ocr.txt`, guarded imports, all behavior without it
   identical to today's stub except richer machine reasons. License BSD-3
   [S], pure Python [S]. Needs DECISIONS entry + integrator approval
   (mandatory-dep rule) — it is mandatory only inside the optional file, but
   the *engine path* depends on it, so approval is explicit.
2. Design B (Tesseract/pytesseract/Pillow/pypdfium2) — **separate** approval
   wave: Apache-2.0/Apache-or-BSD licenses [S] but system-binary packaging,
   CI, macOS-PATH and traineddata checks (§2.3.4). Not requested now.
3. Explicitly out: PyMuPDF (AGPL — Artifex commercial-license exposure [S]);
   Ghostscript-dependent paths (AGPL [H]); poppler-based pdf2image (GPL [H])
   — recorded so a future brief doesn't relitigate them silently.

### 5.5 Review/merge sequence and bounded work packages

Sequence: integrator freezes this design as contract (with any edits) →
dependency approval → OCR-IMPL fresh session → strict gate → review → merge →
OCR-VERIFY session → integrated proof → integrator full gate. Work packages
(bounded engineering effort, **not** calendar promises; these are scoping
estimates for *future* implementer/verifier sessions, not this session's
45-minute note bound, and not authorizations to exceed any session's own
brief):

| WP | Owner | Content | Bound |
|---|---|---|---|
| WP-0 | integrator | contract freeze + dependency DECISIONS | 1 h |
| WP-1 | OCR-IMPL | `ocr_extract.py` adapter, bounds, provenance + unit tests (§4 fixtures 1–10 direct-call) | 2–3 h |
| WP-2 | OCR-IMPL | `jobs.py` branch wiring, claim guard, failure mapping, idempotency tests | 1–2 h |
| WP-3 | OCR-IMPL | strict gate + compat checklist §2.3 (3.12 Linux; Mac items routed to owner/EU-M if sandbox lacks darwin) | 1 h |
| WP-4 | OCR-VERIFY | real-worker integration harness + payload/SQL/UI proof + browser-agreement leg (or explicitly delegate UI leg to EU-V/EU-M) | 2–3 h |
| WP-5 | integrator | review, merge, full gate, DECISIONS/KNOWN_ISSUES updates | 1–2 h |
| WP-6 (later wave) | future | Design B engine behind `extract()` seam + its own acceptance rows (2,3 become `complete`) + CI/macOS packaging checks | 4–8 h |

### 5.6 Exact minimum local test prerequisites (any session running this)

- Python 3.12 venv with existing `requirements-dev.txt` installed [S setup];
  `pypdf` installed **only after approval** (§5.4).
- Real Postgres, fresh disposable DB (`docker compose` or
  `scripts/agent_pg.py start` — never the user's DB) [S];
  scratch `LOCAL_STORAGE_ROOT` (conftest already redirects [S]).
- Real `redis-server` binary reachable at `REDIS_URL`; worker launched the
  normal way (`make worker` → `workers/run_worker.py`, platform-selected
  class) [S]; results read via RQ 2.x `Job.return_value()`.
- Flags for merge-grade proof: `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1
  EVIDENCE_REQUIRE_DEPS=1` [S contract] on a disposable DB only.
- Browser (UI-agreement leg only): existing eu-list/eu-detail setup docs [S];
  if unavailable, that leg transfers to EU-M/EU-V and is marked NOT
  ESTABLISHED rather than assumed (closure contract precedent [S]).

---

## 6. Open questions (labeled) and recommended next decision

- **Q1 [H]:** pypdf extraction accuracy on the owner's real document corpus —
  unmeasured by definition here (no real documents touched); slice A ships
  with per-page provenance precisely so accuracy surprises are visible per
  page. Mitigation if garbling appears: pdfplumber (MIT) swap behind the same
  `extract()` seam, or Design B raster+OCR for those pages.
- **Q2 [H → verify at implementation]:** no pypdf exception message echoes
  document text; sanitize `reason` defensively regardless (§3.2).
- **Q3 [open design gap]:** source stuck `ocr_status='running'` after a
  worker hard-crash has no reconciler in slice A (needs a lease/heartbeat
  design — follow-up contract item, not silently ignored).
- **Q4 [integrator decision]:** CI installs `workers/requirements-ocr.txt`
  (recommended) vs engine tests stay optional-tier skips locally.
- **Q5 [owner, Design B only]:** OCRmyPDF license MPL-2.0 [H — verify] is
  compatible in principle but pulls Ghostscript/AGPL considerations [H] and
  produces derived PDFs (storage/provenance questions); recommend plain
  pytesseract path instead, per §2.1.
- **Q6 [H]:** scanned-PDF synthetic fixture hand-crafting may be brittle
  (§4); fallback plan stated there.

**Recommended next decision (single):** approve Design A slice — pypdf as
optional dependency + the §5.1 write sets + "no CI change beyond the one pip
line" — and freeze it as the OCR implementation contract; launch OCR-IMPL as
a fresh session. Design B (real OCR engine) is proposed as the immediately
following wave, pre-scoped by §2.1/§5.4 so its dependency/security review can
run in parallel with OCR-IMPL coding. This note does **not** delay the
limited owner preview (per kickoff); nothing here changes product code.

---

## Proof (what this session actually did)

**Revision 2 (2026-09-12):** sandbox restore between turns reset the local
branch to base while the working file survived untracked; verified my
working note byte-identical to pushed `2b6688a`
(`git show 2b6688a:handoff/notes/OCR-PLAN.md | diff -` → identical), then
`git pull --ff-only` to the shared-branch tip `61da3b4` (PV-GATE commits
`319120e`/`61da3b4` preserved untouched — no rewrite of another delivery's
commits) and re-applied the note. This revision is note-only per PR20
comment 5649440419; no package installs, no engine runs, no tests executed
in this revision either.

- Read (source-reviewed [S]): STATUS, AGENT_POLICY, both active/shipped
  contracts, kickoff roster, OCR-PLAN brief, `workers/pipeline/jobs.py`,
  `workers/run_worker.py`, `workers/run_process.py`, `workers/queues.py`,
  `apps/api` sources router/service/schemas/models/enums/config/storage,
  `tests/api/conftest.py`, `scripts/verify_all.sh`, Makefile, `.env.example`,
  CI python-version pins, `apps/web/lib/types.ts` (status unions), EU-L
  OCR review, OCR crash report, KNOWN_ISSUES, DECISIONS, EU-M checkpoint,
  PR template.
- Git [S]: shallow-clone checkpoint recovery — `git fetch origin
  a040e9f739ec…` (success), `git merge-base --is-ancestor a040e9f… HEAD`
  (exit 0), `git diff --stat a040e9f..HEAD` (handoff/docs only). Branch:
  `arena/01a097ea-casevault`; no other branch touched; no force-push.
- Web (source-reviewed, URLs below): pypdf license/versions/extraction
  limits; pytesseract 0.3.13 Apache-2.0 + Tesseract Apache-2.0 brew 5.5.3/apt;
  pypdfium2 Apache-2.0-or-BSD + bundled binaries; ocrmypdf 17.x requirements
  (Python 3.11+/3.12+ rec, Tesseract 4.1.1+, pypdfium2-or-Ghostscript,
  fpdf2+uharfbuzz) and language-pack packaging.
- Not done (by design): no package installs, no engine runs, no accuracy
  benchmarks, no environment changes, no writes outside this file.

### References (accessed 2026-09-12)

**Primary upstream (authoritative for license/version claims — R2-G6):**

- pypdf — PyPI metadata (version 6.18.1, `license_expression: BSD-3-Clause`,
  `requires_python: >=3.9`, classifiers 3.9–3.14, `[crypto]` extra for AES):
  https://pypi.org/pypi/pypdf/json (release: https://pypi.org/project/pypdf/6.18.1/)
- pypdf — source/license/changelog/docs:
  https://github.com/py-pdf/pypdf (LICENSE: BSD-3-Clause) ·
  https://pypdf.readthedocs.io/en/stable/ ·
  https://pypdf.readthedocs.io/en/latest/meta/CHANGELOG.html ·
  text extraction guide: https://pypdf.readthedocs.io/en/stable/user/extract-text.html
- Tesseract OCR — upstream repo/license (Apache-2.0):
  https://github.com/tesseract-ocr/tesseract · docs:
  https://tesseract-ocr.github.io/
- OCRmyPDF — install/requirements (17.x):
  https://ocrmypdf.readthedocs.io/en/latest/installation.html ·
  language packs: https://ocrmypdf.readthedocs.io/en/latest/languages.md link in
  https://github.com/ocrmypdf/OCRmyPDF/blob/main/docs/languages.md ·
  packager matrix: https://github.com/ocrmypdf/OCRmyPDF/blob/main/docs/maintainers.md
- pypdfium2 — PyPI (licensing Apache-2.0/BSD-3-Clause, bundled binaries):
  https://pypi.org/project/pypdfium2/
- pytesseract — upstream repo/license (Apache-2.0):
  https://github.com/madmaze/pytesseract

**Secondary background (not authoritative for license/version claims):**

- pypdf vs PyMuPDF/licensing/extraction-quality comparisons:
  https://www.file2markdown.ai/blog/pypdf-vs-pymupdf ,
  https://subhajitbhar.com/blog/pdf-extraction/pdfplumber-vs-pymupdf-vs-pypdf2/ ,
  https://www.nutrient.io/blog/best-python-pdf-libraries/
- pypdf version/Python-support: https://generalistprogrammer.com/tutorials/pypdf-python-package-guide
- pytesseract 0.3.13 (Apache-2.0, wrapper prerequisites):
  https://libraries.io/pypi/pytesseract
- Tesseract brew formula 5.5.3 (Apache-2.0, Apple-silicon bottles):
  https://formulae.brew.sh/formula/tesseract
- pypdfium2 licensing/bundled binaries/text API:
  https://pypi.org/project/pypdfium2/ , https://pypi.org/project/pypdfium2/2.7.2/
- OCRmyPDF installation/requirements 17.x:
  https://ocrmypdf.readthedocs.io/en/latest/installation.html
- OCRmyPDF language packs (platform packaging incl. `tesseract-ocr-eng`,
  `brew install tesseract-lang`):
  https://github.com/ocrmypdf/OCRmyPDF/blob/main/docs/languages.md
- OCRmyPDF maintainer/packager dependency matrix:
  https://github.com/ocrmypdf/OCRmyPDF/blob/main/docs/maintainers.md

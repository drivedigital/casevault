# OCR-PLAN — implementation-ready local PDF/image extraction design

Date: 2026-09-12 · Session branch: `arena/01a097ea-casevault` (fresh session) · Status: DESIGN ONLY
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
  is "basic" — multi-column/unusual encodings can garble]. For
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
| 4 | mixed: page 1 text + page 2 image-only | `ocr_source` | `complete` | 2 rows; page 1 text present, page 2 `ocr_text` NULL/empty | page-level methods differ (`pdf_native_text` vs `none`) |
| 5 | blank valid PDF (no content streams with text) | `ocr_source` | `skipped` / `no_text_layer` | 0 rows | distinct from failed; `pages_with_text: 0` |
| 6 | corrupt: valid fixture byte-truncated / `%PDF` header garbage (mirrors current test style [S]) | both | `failed` / `parse_error` | **previous page state unchanged** (atomicity) | `processing_status='failed'` for ingest path; RQ job state vs payload asymmetry documented (§1.1.4) |
| 7 | encrypted (pypdf-supported cipher — RC4 natively; AES only if `cryptography` present [H]; random synthetic password) | `ocr_source` | `skipped` / `password_protected` | 0 rows | **not** `failed` |
| 8 | huge-by-count: synthetic PDF declared/crafted > `MAX_PAGES` (test override env, e.g. cap=2) | `ocr_source` | `skipped` / `page_limit_exceeded` | 0 rows; true page_count recorded | cap is env-overridable in tests |
| 9 | repeat reprocess ×2 on fixture 1 | `ocr_source` twice | `complete` both times | exactly 2 rows after each run (no duplicates) | identical text; new page UUIDs; `attempt` 1→2; `sources.sha256` unchanged; **original-byte equality**: `GET /sources/{id}/file` bytes hash == upload hash; excerpts (pre-created on page 1) still present |
| 10 | claim race: source already `running`, second `ocr_source` call | | second returns `already_running`, no second page rebuild | | guard regression test |

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

### 5.2 API/schema compatibility — no contract version bump required [H → confirm]

- Zero endpoint, response-shape, status-vocabulary, or queue-name changes
  (policy hard rule 6 surfaces untouched). `ReprocessOut`, `SourceOut`,
  `SourcePageOut` unchanged; job function signatures unchanged
  (`ocr_source(source_id, workspace_id, database_url)`); job payload may gain
  additive keys (`engine`, `pages_with_text`) — additive, existing keys
  stable. Metadata keys additive per §3.2. **If** the integrator prefers a
  formal additive note, a 1.x additive line in the new OCR contract covers it;
  nothing in `docs/contracts/sprint3_evidence.md` §5 is contradicted — it
  already prescribes exactly this optional-import shape [S].

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
dependency approval → OCR-IMPR fresh session → strict gate → review → merge →
OCR-VERIFY session → integrated proof → integrator full gate. Work packages
(bounded engineering effort, **not** calendar promises):

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

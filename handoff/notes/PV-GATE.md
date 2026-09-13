# PV-GATE — independent owner-preview verification (downloads, OCR job/payload/SQL/UI correlation, basic editing)

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (active closure contract);
assignment `handoff/kickoff/PV-GATE.md`; preview checklist `handoff/OWNER_PREVIEW.md`.
Session branch `arena/01a097ea-casevault`; PR into `arena/01a0899f-casevault`.
**No product, API, worker, contract, hub, dependency, CI or EU-V file was touched.**

Revision 2 (2026-09-12/13): answers the integrator review of `61da3b4`
(comment `5649551113`, restated in `handoff/BATCH_REVIEW_2026_09_12.md`) — bounded
async bridge, redacted child output, storage containment, corrected ledger rows,
exact commit identity and positively verified cleanup. §"Review response" maps
each requested item to its evidence; the three tests were rerun afterwards.

## What changed

Two new files, both inside the PV-GATE write set, plus this note:

| File | What it is |
|---|---|
| `tests/browser/pv-gate-preview.spec.mjs` | 3 focused Playwright tests: (1) real-browser upload of unique synthetic TXT/PDF/PNG → detail open with **no** unexpected download → explicit byte-exact download; (2) Reprocess OCR clicked **twice per type** with 202 `{queued, job_id}` → rq-decoded result → exact-ID SQL/pages → visible UI outcome; (3) minimal Status edit/save + reload persistence + return-to-list + include/exclude exclusivity smoke. |
| `tests/browser/pv-gate-bridge.mjs` | Ground-truth bridge: decodes an RQ job with **rq's own** `Job.fetch`/`get_status`/`result` (never raw redis byte parsing) and reads the exact `sources`/`source_pages`/`source_metadata` rows plus the sha256 of the stored original. Every read runs in a **bounded async child** (hard SIGKILL bound, AbortSignal cancellation, Postgres `connect_timeout`/`statement_timeout`/`lock_timeout`, redis socket timeouts); child output is redacted and length-capped; the stored-file read is containment-checked first. Requires `PV_GATE_DATABASE_URL`/`PV_GATE_REDIS_URL` explicitly — no default can silently point at a real case database. |

Read-only reuse, no modification: `tests/browser/eu-detail-fixtures.mjs` (synthetic
fixture bytes, imported). Isolated pinned tooling reused outside the repo
(`/tmp/pv-gate-browser-tools`; no manifest/lockfile change; only the git-ignored
`node_modules/` symlink, same pattern as `tests/browser/eu-detail-README.md`).

### Exact commit / tree identity (corrected)

| Object | SHA | Meaning |
|---|---|---|
| Product checkpoint | `a040e9f739ec3741cd28ee99756d256ea8b78d43` | the released checkpoint under test; ancestor of every tree below |
| First-run tree | `2b7381e59ac187eda038c8bb1b458798f5a3f534` + untracked PV test files | where run v1 executed (tests were untracked at that moment) |
| Test commit (v1 helper) | `319120e` | first commit containing the tests + note; spec `dafeb82b…c6d`, bridge `a459d123…c8` |
| Delivery note | `61da3b4` | v2 note revision (this file, pre-review-response) |
| **Rerun commit (v2 helper)** | `cb91e9e458a3acd5cadc7b99874a79df8d8c5c1d` (parent `ba93aac` → `61da3b4`) | spec `f65c61e8…24`, bridge `11bccbaf…2e`; run v2 executed on exactly these bytes (commit created after the run, then rebased onto the concurrent OCR-PLAN revision — same tree content) |
| Integration head at review | `fcaef0e` | integrator review commit (docs only) |

Product/test separation, stated precisely: `git diff --name-only a040e9f <tree> -- tests`
returns **only** `tests/browser/pv-gate-*.mjs` (this gate's own added files) for every tree
above; run v1 executed with those two files present in the working tree but untracked, and
`2b7381e` itself carries the unmodified EU-D/EU-L suites. Code paths under
`apps/`, `workers/`, `scripts/`, `packages/` are byte-identical to `a040e9f`; the only other
non-handoff differences are `README.md` and `.github/pull_request_template.md` (integration
documentation). So the tested product code **is** the released checkpoint, while "tests/ is
unchanged" would be wrong and is not claimed.

### Isolated disposable stack (owned by this session, inventory verified)

| Piece | Value | Isolation proved by |
|---|---|---|
| Postgres | own `pgserver` cluster `/tmp/pv-gate/pgdata`, database **`pv_gate`** created by this session | pre-start check: ports 8110/3110/6390 free and no uvicorn/worker/next/redis process existed; only `pv_gate` was migrated (`alembic` head `0004`); sibling `casevault`/`casevault_test` never used |
| Storage | `LOCAL_STORAGE_ROOT=/tmp/pv-gate/storage` | outside the repo; `data/` contains only its committed `README.md` after the run |
| Redis | redis-server 6.2.14 on `127.0.0.1:6390`, dir `/tmp/pv-gate/redis` | loopback-only, non-default port, owned PID |
| API / web | uvicorn `0.0.0.0:8110`, Next dev `0.0.0.0:3110`, `API_BASE_URL=http://127.0.0.1:8110` | ports were free before start; platform reported no preview warning |
| Worker | `python -m workers.run_worker`, same disposable `DATABASE_URL`/`REDIS_URL` | real RQ `Worker` (linux, all 7 queues); job log correlated below |

Migrations: `upgrade head` on `pv_gate` only. No `verify_all`, `pytest`, `make backup`,
downgrade, `collect_logs --push`, local-ops or EU-V script was run. Credentials are
disposable placeholders; env file lives at `/tmp/pv-gate/env.sh` (outside Git, never printed).

Tools: Python 3.11.2 · fastapi 0.141.1 · SQLAlchemy 2.0.52 · redis-py 7.4.1 · rq 2.12.0 ·
redis-server 6.2.14 · Node v22.22.3 · @playwright/test 1.63.0 · Chromium 152.0.7977.0
(`@sparticuz/chromium` + AL2023 nss libs; the Playwright CDN is blocked in the sandbox) ·
Next.js 14.2.15.

## Proof

Browser API URLs are relative: `apps/web/lib/api.ts` has `const BASE = "/api/v1"` and no
absolute `localhost`/`127.0.0.1` string exists under `apps/web/{app,lib,components}`; the
spec additionally reads list/detail data with **in-page relative** `fetch("/api/v1/…")`.

### Run ledger (retries 0, workers 1, every batch ≤5 min)

| Run | UTC start→end | Command (cwd `/tmp/pv-gate-browser-tools`) | Exit | Result |
|---|---|---|---|---|
| v1 full (pre-review) | 2026-09-12 23:24:58→23:25:28 | `node node_modules/@playwright/test/cli.js test -c pv-gate.playwright.config.mjs --reporter=list` | 0 | 3 passed (29.9s) |
| v1 b2 mid-run | 2026-09-12 23:24:04→23:24:15 | same, `--grep "PV-GATE 2"` | 1 | harness expectation defect (`page_count` is `NULL`, not `0`) — not a product failure, corrected, recorded |
| **v2 rerun (this revision)** | **2026-09-13 00:10:19→00:10:49** | same command on the v2 helper bytes | **0** | **3 passed (29.7s)**, raw log `/tmp/pv-gate-evidence/rerun.txt` |

v2 per-test times: test 1 `9.0s`, test 2 `17.1s`, test 3 `2.7s` (v2 helper is slower than v1
by design: each ground-truth read is now a bounded async child instead of a blocking exec).

### Helper-level guard checks (v2, not part of the 3-test gate)

| Check | Observed |
|---|---|
| Containment — `storage_path = ../../../../etc/passwd` | `outside_storage_root: true`, **no read**, no resolved path echoed |
| Containment — `storage_path = /etc/passwd` | `outside_storage_root: true`, **no read** |
| Redaction of `sanitize()` | `postgresql://***@10.0.0.9:5432/casevault password=*** Authorization=*** abcdef0123456789` |
| Hard timeout — black-hole DB host, 1500 ms bound | killed at **1506 ms**, `SIGKILL`, message "no partial result is reported", stderr `(none)` |

(Rows used for the containment check were synthetic guard rows inserted and then deleted in
the disposable DB before the rerun, so the tested database held only the run's fixtures.)

### Case table — real vs injected vs not run

| # | Case | Class | Result |
|---|---|---|---|
| 1a | Upload unique synthetic TXT + synthetic 2-page PDF + PNG through the real upload control; response IDs captured | real API + real worker + real browser | **PASS** (201 each; API-echoed `sha256`/size == fixture) |
| 1b | Detail page opens for each type with **no** download triggered (download listener, 1.5 s settle) | real | **PASS** (0 downloads for TXT/PDF/PNG) |
| 1c | Explicit "Download original" ×3 → saved bytes `Buffer.compare`==0, sha256 == uploaded fixture, filename preserved, exactly one download per click | real | **PASS** |
| 1d | Stored original bytes on disk == fixture after upload, behind the containment check | real (bridge) | **PASS** |
| 1e | Native inline PDF rendering (pixels) | — | **NOT RUN / not available**: `navigator.pdfViewerEnabled===false`; the labeled fallback path (`preview-unsupported`, no preview button, no fetch, explicit download) was asserted instead. **No native-render claim.** |
| 1f | Capability-injected preview mechanics | injected technique | **NOT RUN by design** (EU-D covers it; PV-GATE stays uninjected) |
| 2a | TXT Reprocess OCR ×2 (sequential, terminal wait between clicks) | real API + real Redis + real RQ worker | **PASS** |
| 2b | PDF Reprocess OCR ×2 (sequential) | real | **PASS** (skipped/stub — **no extraction claim**) |
| 2c | Per click: 202 `queued:true` + `job_id` → UI accepted-note carries that job id → rq `finished` + result payload → exact-ID SQL/pages | real + SQL/RQ ground truth | **PASS** (4/4) |
| 2d | Second run is a *new* write (fresh `source_pages.id` for TXT; advanced `ocr_reprocessed_at` for PDF) | real (bridge) | **PASS** |
| 2e | Original bytes unchanged by reprocessing | real (bridge) | **PASS** (sha256 unchanged) |
| 2f | UI end state matches DB (OCR tab page text vs rows; "No pages extracted yet" for PDF) | real | **PASS** |
| 2g | RQ FINISHED treated as success alone | — | **not accepted anywhere**: each claim is job result **and** SQL/pages **and** UI |
| 3a | Direct entry initializes title/status drafts; edit + save → `save-ok` → SQL persisted | real API + real browser + SQL | **PASS** |
| 3b | Reload: saved values return; drafts re-initialize; no dirty indicator | real | **PASS** |
| 3c | Return to list: row for the exact id shows the edited title | real | **PASS** |
| 3d | Include then Exclude stay exclusive in SQL | real | **PASS** |
| — | Duplicate warning after a deliberate duplicate | — | **NOT RUN** (EU-M checklist item, out of PV-GATE scope) |
| — | Real PDF/image extraction, native Mac proof, full EU-V acceptance | — | **NOT RUN** (not implemented in this build / out of scope) |

### Job/source correlation — v2 rerun (`RUN_STAMP=rv-1789258219`), fixture-only IDs

| Item | Source id | Job id (observed) | rq status | decoded `result` | SQL after | UI |
|---|---|---|---|---|---|---|
| TXT upload (`*uploads-text.txt`) | `b135d197-8ff9-45f4-bd2b-2c716418bc52` | **no job — inline ingest** (`source_metadata.ingest_method='inline_text'`) | — | — | `ocr=complete`, `page_count=1`, 1 row | list row + detail ok |
| PDF upload (`*uploads-document.pdf`) | `ef7af900-54c2-4a15-8918-ecdbe4249c5e` | ingest `aad85979-200f-4391-9628-cf7a1545362b` (`process_source`) | finished | — | `ocr=skipped`, `page_count=NULL`, 0 rows, `ingest_method='worker_stub'` | detail ok |
| PNG upload (`*uploads-image.png`) | `b59d0f03-4e09-43b0-921e-e4dfb76654ce` | ingest `6f95d44e-1545-4986-a6c5-2d4d1938320a` (`process_source`) | finished | — | `ocr=skipped`, `page_count=NULL`, `ocr.engine='stub'` | detail ok |
| TXT OCR #1 | `d1c5dbcb-a04a-4f98-8aaf-1e2b6878deca` | `e0032b60-801f-47e4-88db-bf054df4f2cb` (`ocr_source`) | finished | `{source_id: d1c5dbcb…, status: complete, ocr_status: complete, page_count: 1}` | `ocr=complete`, 1 page, text sha == fixture text | "Extraction finished successfully…" |
| TXT OCR #2 | same | `cbd632ca-6f57-4a49-83e0-f0c72d48f64e` | finished | same payload | `ocr=complete`, 1 page, **new page id** | same terminal note |
| PDF OCR #1 | `c9df68aa-b6e3-441a-b8e4-ef6423ab4b5e` | `90d177d6-6136-4714-9f71-8a8eb83479f8` | finished | `{source_id: c9df68aa…, status: complete, ocr_status: skipped, page_count: null}` | `ocr=skipped`, 0 rows, reason "No OCR engine wired…" | "The worker skipped OCR for this file type…" |
| PDF OCR #2 | same | `e6cd11a9-4d8f-447b-a791-71d0fd579144` | finished | same payload | same + advanced `ocr_reprocessed_at` | same terminal note |
| Edit/save | `37ff4e45-3e07-4007-bf2f-958a50ee6a9e` | — | — | — | `title="… edited rv-…"`, `source_status=public_record`, then `included=false, excluded=true` | `save-ok`; list row shows edited title |

Worker log for the same window: three real `ingest` jobs (`process_source`) for the PDF/PNG
uploads, four `ocr` jobs (`ocr_source`) for the four explicit clicks, each `Job OK`, 0
exceptions, worker alive afterwards, no crash artifact. **Correction to the previous
revision:** the earlier table marked the TXT upload row as an ingest job that "finished" —
wrong. Text sources are ingested **inline** during upload (`ingest_method='inline_text'`,
no RQ job), which is why no ingest job appears for either TXT source; PDF/PNG uploads are
the ones that create real ingest jobs. All four clicks returned `202 {queued:true, job_id}`
with distinct ids, each matching the id shown by the UI's accepted note; no auto-enqueue and
no retry on any path (the spec never re-clicks; a missing terminal state raises `UNCONFIRMED …`).

## Review response (integrator comment 5649551113)

| Requested | Status | Evidence |
|---|---|---|
| Bounded async child instead of `execFileSync`; DB/Redis connection/read limits; cancellation | **done** | `spawn` + hard SIGKILL bound (`PV_GATE_BRIDGE_TIMEOUT_MS`, default 20 s), AbortSignal from `afterEach`, `connect_timeout`/`statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout` on Postgres, redis `socket_connect_timeout`/`socket_timeout`; guard checks above (kill at 1506 ms with a 1500 ms bound) |
| Redact raw child stdout/stderr in errors | **done** | `sanitize()` redacts `scheme://user:pass@`, `password/secret/token/api_key/authorization=…`, collapses whitespace, caps at 240 chars; only sanitized excerpts are used in every error path |
| Validate stored-path containment before the disk read | **done** | resolved-root check (`Path.resolve()` + `relative_to`), `outside_storage_root: true` for `../../../../etc/passwd` and `/etc/passwd`, no bytes read, no resolved path echoed |
| Correct the TXT upload ledger row (inline ingest, no ingest job) | **done** | corrected table above; `ingest_method='inline_text'` verified in `source_metadata`, worker log contains no ingest job for TXT |
| Preserve exact tested commit vs test SHA; exclude added PV tests from code-tree claims | **done** | exact-identity table above with file sha256 and the `git diff --name-only … -- tests` statement |
| Replace the "teardown cannot disturb anything" claim with positive owned-resource checks | **done** | inventory + pre/post checks below; the previous session's services are explicitly **not** assumed alive (this workspace was re-cloned: no such processes/ports existed before the rerun) |
| Rerun only the 3 PV tests after the helper fix, ≤5 min, save measured results/cleanup | **done** | v2 rerun 3 passed (29.7 s), exit 0; log saved at `/tmp/pv-gate-evidence/rerun.txt`; cleanup verified below |

### Owned-resource inventory and cleanup (positively verified)

Owned: redis manager PID 1763 (server PID 1766, `127.0.0.1:6390`), API PID 1783
(`0.0.0.0:8110`), worker PID 1798 (RQ child 1799), web PID 1848 (`0.0.0.0:3110`),
Postgres cluster PID 1735 + database `pv_gate` + storage `/tmp/pv-gate/storage` +
redis dir `/tmp/pv-gate/redis`. Pre-start check: those ports were free and no
`uvicorn`/`workers.run_worker`/`next dev`/`redis-server` process existed, so nothing else
could be attributed to this gate. Nothing outside this list, and no other port, was touched.

Teardown, observed step by step: (1) stopped the four owned services → ports 8110/3110/6390
**closed** and `none running` for all four process patterns; (2) `agent_pg.py stop` →
`postgres stopped`, `status → not running`, no `pv-gate/pgdata` process; (3) removed
`/tmp/pv-gate` (cluster, storage, redis dir, downloads) → confirmed absent; (4) repo
`git status` clean apart from this revision's edits, `data/` still contains only its
committed `README.md`. Retained deliberately: `/tmp/pv-gate-evidence/rerun.txt` and
`/tmp/pv-gate-evidence/owned-resources.txt` (synthetic-only logs) plus the isolated tooling
dir `/tmp/pv-gate-browser-tools` (no case data). **No service is left running by this gate.**

## Contract gaps

None in the closure contract. Two measured, non-blocking observations for the integrator
(classification: **limitation**, not defect):

1. **`page_count` is `NULL`** (never `0`) for stub-skipped pdf/image rows, API included.
   Honest for "not determined", but any consumer that sums `page_count` must handle `null`
   (the list/detail badges use `ocr_status`). Worth a BACKLOG line.
2. The Status panel's "Current server state" line renders the **persisted** state, so when
   two consecutive runs end in the same outcome it reads identically before/after. Per-run
   UI attribution therefore comes from the accepted-note job id plus the RQ/SQL correlation,
   not from that line — a stated limitation of this gate, not a bug.

## Risks / follow-ups

- **Sandbox browser cannot render PDFs inline** (`navigator.pdfViewerEnabled=false`). The
  fallback is asserted; native rendering needs a PDF-capable browser — unchanged transfer to
  EU-V/EU-M/Mac. No claim made here.
- This gate is 3 focused tests on one disposable stack: **not** EU-V acceptance, not a
  full-suite rerun, not a substitute for the pending L2.5/L3.x list work or the detail/OCR
  proof owned by EU-V.
- PR/branch ownership: `arena/01a097ea-casevault` carries two workstreams — OCR-PLAN
  (note-only, its own review open) and PV-GATE. GitHub refuses a second PR from the same head
  branch, so the delivered PR (20) is the combined artifact and its title/body inventory is a
  shared-surface matter. **Observed during this revision: the OCR-PLAN session pushed
  `ba93aac` ("OCR-PLAN revision 2", `handoff/notes/OCR-PLAN.md` only) while PV was preparing
  its commit** — i.e. concurrent writers on the assigned branch, the risk the integrator
  flagged. PV's response was the minimum-conflict path: its single local commit was rebased
  onto `ba93aac` (no force-push, no rewriting of the other session's commits, no touch of
  OCR-PLAN files) and pushed as the fast-forward `ba93aac..cb91e9e`. This session wrote only
  `tests/browser/pv-gate-*` and `handoff/notes/PV-GATE.md`; it neither edited the OCR-PLAN
  note nor claims sole delivery ownership. **The integrator/owner should still name a single
  writer for PR20** (or split the deliveries), because the next concurrent push could require
  a conflict resolution that only one writer should own.
- Nothing under `data/`, no `.env*`, no credentials, no raw logs or downloaded bytes are in
  the diff (raw synthetic evidence stays in `/tmp`, outside Git).

## What the next agent must know

- **Recommendation: preview-SAFE WITH LIMITATIONS** (not blocked). On the exact released
  product code (`a040e9f`): uploads, detail open without unexpected downloads, explicit
  byte-exact downloads, the full OCR reprocess chain (202 → real job → decoded payload →
  SQL/pages → UI) and basic Status editing behaved correctly twice per run, with a surviving
  worker and no new crash. Limitations that must travel with any preview statement: no native
  PDF rendering in this browser (labeled fallback only), PDF/image are **stub-skipped** (no
  extraction), `page_count` is `NULL` for skipped sources, and no Mac/real-data/full-acceptance
  claim exists.
- Reproduce: set `WEB_BASE_URL`, `PV_GATE_DATABASE_URL`, `PV_GATE_REDIS_URL` (and
  `LOCAL_STORAGE_ROOT` for the contained-bytes check) on an owned disposable stack, then run
  `node node_modules/@playwright/test/cli.js test -c /tmp/pv-gate-browser-tools/pv-gate.playwright.config.mjs`
  from `/tmp/pv-gate-browser-tools`. `PV_GATE_OCR_TIMEOUT_MS` (default 60 s) bounds each
  per-click terminal wait; `PV_GATE_BRIDGE_TIMEOUT_MS` (default 20 s) bounds each ground-truth
  read. On timeout the test fails with `UNCONFIRMED`/`hard timeout … no partial result` and
  never enqueues a retry.
- Fixtures are the shared EU-D synthetic bytes plus a run-unique marker (TXT line, PDF
  trailing comment after `%%EOF`, PNG `tEXt` chunk), so every run's sha256 is unique and
  "downloaded bytes == uploaded bytes" is an exact per-run claim.
- Read-only reuse means EU-D fixtures/EU-L specs were not edited; this branch adds only
  `tests/browser/pv-gate-*` and this note. **Not merged, no force-push, no product fix.**

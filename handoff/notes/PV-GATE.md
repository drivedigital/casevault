# PV-GATE — independent owner-preview verification (downloads, OCR job/payload/SQL/UI correlation, basic editing)

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (active closure contract);
assignment `handoff/kickoff/PV-GATE.md`; preview checklist `handoff/OWNER_PREVIEW.md`.
Fresh session, own branch `arena/01a097ea-casevault`, PR into `arena/01a0899f-casevault`.
**No product, API, worker, contract, hub, dependency, CI or EU-V file was touched.**

## What changed

Two new files, both inside the PV-GATE write set:

| File | What it is |
|---|---|
| `tests/browser/pv-gate-preview.spec.mjs` | 3 focused Playwright tests: (1) real-browser upload of unique synthetic TXT/PDF/PNG → detail open with **no** unexpected download → explicit byte-exact download; (2) Reprocess OCR clicked **twice per type** with 202 `{queued, job_id}` → rq-decoded result → exact-ID SQL/pages → visible UI outcome; (3) minimal Status edit/save + reload persistence + return-to-list + include/exclude exclusivity smoke. |
| `tests/browser/pv-gate-bridge.mjs` | Ground-truth bridge (helper): decodes an RQ job with **rq's own** `Job.fetch`/`get_status`/`result` (never raw redis byte parsing) and reads the exact `sources`/`source_pages`/`source_metadata` rows plus the sha256 of the stored original. Requires `PV_GATE_DATABASE_URL`/`PV_GATE_REDIS_URL` explicitly — it has no default that could silently point at a real case database. |

Read-only reuse, no modification: `tests/browser/eu-detail-fixtures.mjs` (synthetic
fixture bytes, imported). Isolated pinned tooling reused outside the repo
(`/tmp/pv-gate-browser-tools`, no manifest/lockfile change; only the git-ignored
`node_modules/` symlink, same pattern as `tests/browser/eu-detail-README.md`).

### Tested tree and product identity

- Tested tree: `2b7381e59ac187eda038c8bb1b458798f5a3f534` (`arena/01a097ea-casevault`),
  working diff = the two new files above only (`git status --short` showed exactly
  `?? tests/browser/pv-gate-bridge.mjs`, `?? tests/browser/pv-gate-preview.spec.mjs`).
- Branch head note: the tests were executed at `2b7381e`; while this session ran, the
  parallel OCR-PLAN note (`handoff/notes/OCR-PLAN.md`, docs only) was pushed to the same
  session branch, and this commit was rebased (normal, no force-push) on top of it.
  The rebase added **no** product-path change (`apps/`, `workers/`, `scripts/`,
  `packages/`, `tests/` still identical to `a040e9f`), so the verification applies to the
  released product code unchanged.
- Product checkpoint `a040e9f739ec3741cd28ee99756d256ea8b78d43` is an **ancestor** of the
  tested tree (object fetched and verified this session).
- `git diff --stat a040e9f HEAD` over non-handoff paths = `README.md` and
  `.github/pull_request_template.md` only. `apps/`, `workers/`, `scripts/`,
  `packages/`, `tests/` are **byte-identical** to `a040e9f` — the tested product code
  IS the released checkpoint; later integration commits are documentation.

### Isolated disposable stack (explicitly owned by this session)

| Piece | Value | Isolation |
|---|---|---|
| Postgres | `pgserver` cluster `/tmp/pv-gate/pgdata`, database **`pv_gate`** created by this session | new cluster + new DB name; `casevault`/`casevault_test` in it were never used |
| Storage | `LOCAL_STORAGE_ROOT=/tmp/pv-gate/storage` | outside the repo; `data/` untouched |
| Redis | `redislite` redis-server 6.2.14 on `127.0.0.1:6390`, dir `/tmp/pv-gate/redis` | loopback-only, non-default port, no other instance existed |
| API / web | uvicorn `0.0.0.0:8110`, Next dev `0.0.0.0:3110`, `API_BASE_URL=http://127.0.0.1:8110` | unreserved ports; nothing else was listening; no other service was disturbed |
| Worker | `python -m workers.run_worker`, `DATABASE_URL`/`REDIS_URL` pointed at the disposable pair | real RQ `Worker` on Linux, all 7 queues |

No `verify_all`, `pytest`, `make backup`, downgrade, `collect_logs --push`, local-ops
or EU-V script was run. Migrations: `upgrade head` on `pv_gate` only (→ `0004`).
Credentials are disposable placeholders; nothing printed/published. Env file lives
at `/tmp/pv-gate/env.sh` (outside Git).

Tools: Python 3.11.2 · fastapi 0.141.1 · SQLAlchemy 2.0.52 · redis-py 7.4.1 · rq 2.12.0
· redis-server 6.2.14 · Node v22.22.3 · @playwright/test 1.63.0 · Chromium 152.0.7977.0
(`@sparticuz/chromium` binary + AL2023 nss libs, unpinned-playwright CDN is blocked in
the sandbox) · Next.js 14.2.15.

## Proof

Browser API URLs are relative: `apps/web/lib/api.ts` has `const BASE = "/api/v1"` and
no absolute `localhost`/`127.0.0.1` string exists anywhere under `apps/web/{app,lib,components}`.
The spec additionally reads list/detail data with **in-page relative** `fetch("/api/v1/…")`
so the Next proxy path itself is exercised. Platform reported no preview warning for 3110/8110.

### Run ledger (retries 0, workers 1, each batch ≤5 min)

| Batch | UTC start→end | Command (cwd `/tmp/pv-gate-browser-tools`, env from `/tmp/pv-gate/env.sh`) | Exit | Result |
|---|---|---|---|---|
| b1 (test 1) | 23:23:48→23:23:59 | `node node_modules/@playwright/test/cli.js test -c pv-gate.playwright.config.mjs --grep "PV-GATE 1"` | 0 | 1 passed (10.4s) |
| b2 (test 2) | 23:24:04→23:24:15 | same, `--grep "PV-GATE 2"` | **1** | **HARNESS DEFECT, see below** |
| b3 (test 2, corrected) | 23:24:29→23:24:48 | same, `--grep "PV-GATE 2"` | 0 | 1 passed (17.9s) |
| b4 (test 3) | 23:24:51→23:24:56 | same, `--grep "PV-GATE 3"` | 0 | 1 passed (4.5s) |
| full | 23:24:58→23:25:28 | same, all `pv-gate-*` | 0 | **3 passed (29.9s)** |

b2 failure was **my assertion, not the product**: I expected `page_count === 0` for the
stub-skipped PDF; the product writes `NULL` (measured: `page_count=None`, 0 page rows,
`source_metadata.ocr.engine='stub'`). The expectation was corrected to the measured
product behaviour and the run repeated once. Recorded here as a harness defect so it is
not mistaken for a product failure or a "retry".

Raw logs (outside Git): `/tmp/pv-gate/logs/batch{1,2,3,4,full}.txt`, downloads in
`/tmp/pv-gate/downloads/` (fixture-only, synthetic).

### Case table — real vs injected vs not run

| # | Case | Class | Result |
|---|---|---|---|
| 1a | Upload unique synthetic TXT + synthetic 2-page PDF + PNG through the real upload control; response IDs captured | real API + real worker + real browser | **PASS** (201 each, `sha256`/size echoed by API == fixture) |
| 1b | Detail page opens for each type with **no** download triggered (download listener, 1.5 s settle) | real | **PASS** (0 downloads for TXT/PDF/PNG) |
| 1c | Explicit "Download original" ×3 → saved bytes `Buffer.compare`==0 and sha256 == uploaded fixture; original filename preserved; exactly one download per click | real | **PASS** |
| 1d | Stored original bytes on disk == fixture after upload | real (bridge) | **PASS** |
| 1e | Native inline PDF rendering (pixels) | — | **NOT RUN / not available**: `navigator.pdfViewerEnabled===false` in this headless Chromium; the labeled fallback path (`preview-unsupported`, no preview button, no fetch, explicit download) was asserted instead. **No native-render claim.** |
| 1f | Capability-injected preview mechanics | injected technique | **NOT RUN by design** (EU-D already covers it; PV-GATE stays uninjected) |
| 2a | TXT Reprocess OCR ×2 (sequential, terminal wait between clicks) | real API + real Redis + real RQ worker | **PASS** |
| 2b | PDF Reprocess OCR ×2 (sequential) | real | **PASS** (skipped/stub — **no extraction claim**) |
| 2c | Per click: 202 `queued:true` + `job_id` → UI accepted-note carries that job id → rq `finished` + result payload → exact-ID SQL/pages | real + SQL/RQ ground truth | **PASS** (4/4) |
| 2d | Second run is a *new* write (fresh `source_pages.id` for TXT; advanced `ocr_reprocessed_at` for PDF) | real (bridge) | **PASS** |
| 2e | Original file bytes unchanged by reprocessing | real (bridge) | **PASS** (sha256 unchanged) |
| 2f | UI end state matches DB (OCR tab: page text head vs rows; "No pages extracted yet" for PDF) | real | **PASS** |
| 2g | RQ FINISHED treated as success alone | — | **not accepted anywhere**: every claim is job result **and** SQL/pages **and** UI |
| 3a | Direct entry initializes title/status drafts from server; edit + save → `save-ok` → SQL persisted | real API + real browser + SQL | **PASS** |
| 3b | Reload: saved values come back; drafts re-initialize; no dirty indicator | real | **PASS** |
| 3c | Return to list: row for the exact id shows the edited title | real | **PASS** |
| 3d | Include then Exclude stay exclusive in SQL | real | **PASS** |
| — | Duplicate warning after a deliberate duplicate | — | **NOT RUN** (EU-M checklist item, out of PV-GATE scope) |
| — | Real PDF/image extraction, native Mac proof, full EU-V acceptance | — | **NOT RUN** (not implemented in this build / out of scope) |

### Job/source correlation (full run, `RUN_STAMP=full-1789255498`) — fixture-only IDs

| Item | Source id | Job id (click) | rq status | decoded `result` | SQL after | UI |
|---|---|---|---|---|---|---|
| TXT upload | `a30148fc-e1f6-4c84-a22f-ffc0549d392b` | — (ingest) | finished | — | `ocr=complete`, `page_count=1`, 1 row | list row + detail ok |
| TXT OCR #1 | `70350490-1c4f-4b97-a044-7c9887e2dd53` | `6fae1ac8-b99b-48af-b637-de4426ff156a` | finished | `{source_id:70350490…, status:complete, ocr_status:complete, page_count:1}` | `ocr=complete`, 1 page, text sha == fixture text | "Extraction finished successfully…" |
| TXT OCR #2 | same | `e5d3c13b-3b95-4e63-b1f1-a7ad382d726f` | finished | same payload | `ocr=complete`, 1 page, **new page id** | same terminal note |
| PDF upload | `d44bf213-eb9f-4e1d-a0a2-7c421c113256` | — (ingest) | finished | — | `ocr=skipped`, `page_count=NULL`, 0 rows, `ocr.engine=stub` | list row + detail ok |
| PDF OCR #1 | `bed20449-c0a4-4d08-848a-a7b239d1886a` | `04df411e-8b99-4308-8390-d57fd4d8c06d` | finished | `{source_id:bed20449…, status:complete, ocr_status:skipped, page_count:null}` | `ocr=skipped`, 0 rows, reason "No OCR engine wired…" | "The worker skipped OCR for this file type…" |
| PDF OCR #2 | same | `6e11125b-119c-4db9-847d-25548910feff` | finished | same payload | same + advanced `ocr_reprocessed_at` | same terminal note |
| PNG upload | `00e34d28-b825-4c77-b88d-c6db0fa2cbc6` | — (ingest) | finished | — | `ocr=skipped`, `page_count=NULL`, `ocr.engine=stub` | — |
| Edit/save | `7ce875c6-7365-4ed8-9cea-6a3322095688` | — | — | — | `title="…edited full-…"`, `source_status=public_record`, then `included=false, excluded=true` | `save-ok`, list row shows edited title |

Worker process log for the same window: `ocr: … Job OK` for all four job ids,
0 exceptions, worker still alive afterwards; no crash artifact. All four clicks returned
`202 {queued:true, job_id:<uuid>}`, each distinct, and each job id was the one shown by
the UI's accepted note — no auto-enqueue and no retry on any path (the spec never
re-clicks; a missing terminal state raises `UNCONFIRMED …` and fails the test).

## Contract gaps

None in the closure contract. Two measured, non-blocking observations for the integrator
(classification: **limitation**, not defect):

1. **`page_count` is `NULL`** (never `0`) for stub-skipped pdf/image rows, API included.
   Honest for "not determined", but any consumer that sums `page_count` must handle
   `null` (the list/detail badges use `ocr_status`, not this field). Worth a BACKLOG line.
2. The Status panel's "Current server state" line renders the **persisted** state, so
   when two consecutive runs end in the same outcome it reads identically before/after.
   Per-run UI attribution therefore comes from the accepted-note job id plus the RQ/SQL
   correlation, not from that line — stated as a limitation of this gate, not a bug.

## Risks / follow-ups

- **Sandbox browser cannot render PDFs inline** (`navigator.pdfViewerEnabled=false`).
  The fallback is asserted; native rendering (and the opt-in preview pixels) still need
  a PDF-capable browser — unchanged transfer to EU-V/EU-M/Mac. No claim made here.
- This gate is 3 focused tests on one disposable stack, **not** EU-V acceptance, not a
  full-suite rerun and not a substitute for the pending L2.5/L3.x or detail/OCR work.
- The disposable stack (`/tmp/pv-gate/*`, ports 3110/8110/6390) was **left running** so
  the reviewer can inspect the synthetic rows and the live preview; teardown is
  `stop_process` on the four owned processes + `python scripts/agent_pg.py --data-dir
  /tmp/pv-gate/pgdata stop` + `rm -rf /tmp/pv-gate`. No repo `data/` or shared service
  was used, so teardown cannot disturb anything else. Compiled Next artifacts live under
  `apps/web/.next` (git-ignored).
- Nothing under `data/`, no `.env*`, no credentials, no raw logs or downloaded bytes are
  in the diff (raw evidence stays in `/tmp`, outside Git).

## What the next agent must know

- **Recommendation: preview-SAFE WITH LIMITATIONS** (not blocked). On the exact released
  product code (`a040e9f`): uploads, detail open without unexpected downloads, explicit
  byte-exact downloads, the full OCR reprocess chain (202 → real job → decoded payload →
  SQL/pages → UI) and basic Status editing all behaved correctly twice in a row, with a
  surviving worker and no new crash. Limitations that must travel with any preview
  statement: no native PDF rendering in this browser (labeled fallback only), PDF/image
  are **stub-skipped** (no extraction), `page_count` is `NULL` for skipped sources, and
  no Mac/real-data/full-acceptance claim exists.
- Reproduce with the commands in the run ledger: set `WEB_BASE_URL`, `PV_GATE_DATABASE_URL`,
  `PV_GATE_REDIS_URL` (and `LOCAL_STORAGE_ROOT` for the stored-bytes check) and run the
  isolated config `-c /tmp/pv-gate-browser-tools/pv-gate.playwright.config.mjs`.
  `PV_GATE_OCR_TIMEOUT_MS` (default 60 s) bounds each per-click terminal wait; on timeout
  the test fails with an `UNCONFIRMED` message and never enqueues a retry.
- The fixtures are the shared EU-D synthetic bytes plus a run-unique marker (TXT line,
  PDF trailing comment after `%%EOF`, PNG `tEXt` chunk), so every run's sha256 is unique
  and "downloaded bytes == uploaded bytes" is an exact per-run claim, not a shared-file
  coincidence.
- Read-only reuse means the EU-D fixtures/EU-L specs were not edited; this branch adds
  only `tests/browser/pv-gate-*` and this note. PR opened, **not** merged, no force-push,
  no product fix.

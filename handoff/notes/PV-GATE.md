# PV-GATE — independent owner-preview verification (downloads, OCR job/payload/SQL/UI correlation, basic editing)

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (active closure contract);
assignment `handoff/kickoff/PV-GATE.md`; preview checklist `handoff/OWNER_PREVIEW.md`.
Session branch `arena/01a097ea-casevault`; PR into `arena/01a0899f-casevault`.
**No product, API, worker, contract, hub, dependency, CI or EU-V file was touched.**

Revision 3 (2026-09-13): answers the integrator review of `d1a504f`
(comment `5649650869`). Public failures are now **fixed reason codes + bounded
numeric/OS status only** — the regex sanitizer and its excerpts are gone, and raw
child output is written only through an explicit local opt-in; accumulated
stdout/stderr is capped with a hard kill; a child **stdin error is a fixed failure**;
the `detached:false` "cannot outlive the runner" claim is deleted and replaced with
the exact guarantee; 7 synthetic negative checks cover JSON/parse, trace, overflow,
stdin, cancel, start-failure and missing-env paths. The 3 tests were rerun on the new
helper bytes: v4 failed once on a **real product first-boot race** (finding below);
v5, with the identity bootstrap already committed, passed 3/3. Revision 2
(2026-09-12/13) answered the earlier review (`5649551113`): bounded async bridge,
storage containment, corrected ledger rows, exact commit identity, positively
verified cleanup.

## What changed

Two new files, both inside the PV-GATE write set, plus this note:

| File | What it is |
|---|---|
| `tests/browser/pv-gate-preview.spec.mjs` | 3 focused Playwright tests: (1) real-browser upload of unique synthetic TXT/PDF/PNG → detail open with **no** unexpected download → explicit byte-exact download; (2) Reprocess OCR clicked **twice per type** with 202 `{queued, job_id}` → rq-decoded result → exact-ID SQL/pages → visible UI outcome; (3) minimal Status edit/save + reload persistence + return-to-list + include/exclude exclusivity smoke. |
| `tests/browser/pv-gate-bridge.mjs` | Ground-truth bridge: decodes an RQ job with **rq's own** `Job.fetch`/`get_status`/`result` (never raw redis byte parsing) and reads the exact `sources`/`source_pages`/`source_metadata` rows plus the sha256 of the stored original. Every read runs in a **bounded async child** (hard SIGKILL bound, AbortSignal cancellation, bounded stdout/stderr accumulation, Postgres `connect_timeout`/`statement_timeout`/`lock_timeout`, redis socket timeouts). Every failure is a fixed `PVGATE_BRIDGE_*` code plus bounded numeric/OS status — **never child output**, not even a redacted excerpt; `PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS=<file>` is an explicit, unset-by-default opt-in for raw local debugging. The stored-file read is containment-checked before any byte is read. Requires `PV_GATE_DATABASE_URL`/`PV_GATE_REDIS_URL` explicitly — no default can silently point at a real case database. |
| `tests/browser/pv-gate-negative-checks.mjs` | Harness-level negative checks for the fixed-code paths (not collected by Playwright: the config matches `pv-gate-*.spec.mjs`). Re-runnable: `timeout 240 node tests/browser/pv-gate-negative-checks.mjs`. |

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
| Rerun commit (v2 helper) | `cb91e9e458a3acd5cadc7b99874a79df8d8c5c1d` (parent `ba93aac` → `61da3b4`) | spec `f65c61e8…24`, bridge `11bccbaf…2e`; run v2 executed on exactly these bytes (commit created after the run, then rebased onto the concurrent OCR-PLAN revision — same tree content) |
| Integration head at review | `fcaef0e` | integrator review commit (docs only), then `d1a504f` (the bytes review `5649650869` inspected) |
| **Delivery commit (v3 helper)** | **tip of `arena/01a097ea-casevault` at delivery** (`git log -1`; the concrete SHA is reported in the PR #20 comment) — created after the v4/v5 runs below; this note is part of it | spec `f65c61e8a79c1461283bd610f4f3d58c821df609687c390c28cde6afbfc45c24` (v2 bytes, unchanged), bridge `8c65a6365c72da0fa84f9b7e2bf21e2a13bf1f97ccdca752f06891ccd5d28a47`, negative checks `9dac569338d16070511ad0f443229e1a7fcad66b127cf5b4e6863e3930670709` |

Product/test separation, stated precisely: `git diff --name-only a040e9f <tree> -- tests`
returns **only** `tests/browser/pv-gate-*.mjs` (this gate's own added files) for every tree
above; run v1 executed with those two files present in the working tree but untracked, and
`2b7381e` itself carries the unmodified EU-D/EU-L suites. Code paths under
`apps/`, `workers/`, `scripts/`, `packages/` are byte-identical to `a040e9f` (re-checked at
this revision's HEAD: no output); the only other non-handoff differences are `README.md` and
`.github/pull_request_template.md` (integration documentation). So the tested product code
**is** the released checkpoint, while "tests/ is unchanged" would be wrong and is not claimed.

### Isolated disposable stack (owned by this session, inventory verified)

| Piece | Value | Isolation proved by |
|---|---|---|
| Postgres | own `pgserver` cluster `/tmp/pv-gate/pgdata`, database **`pv_gate`** created by this session | pre-start check: ports 8110/3110/6390 free and no uvicorn/worker/next/redis process existed; only `pv_gate` was migrated (`alembic` head `0004`); sibling `casevault`/`casevault_test` never used. The throwaway `pv_gate_repro` used once for the reproduction attempt was dropped at teardown with the whole tree |
| Storage | `LOCAL_STORAGE_ROOT=/tmp/pv-gate/storage` | outside the repo; `data/` contains only its committed `README.md` after the run |
| Redis | redis-server 6.2.14 on `127.0.0.1:6390`, dir `/tmp/pv-gate/redis` | loopback-only, non-default port, owned PID |
| API / web | uvicorn `0.0.0.0:8110`, Next dev `0.0.0.0:3110`, `API_BASE_URL=http://127.0.0.1:8110` | ports were free before start; platform reported no preview warning |
| Worker | `python -m workers.run_worker`, same disposable `DATABASE_URL`/`REDIS_URL` | real RQ `Worker` (linux, all 7 queues); job log correlated below |

Migrations: `upgrade head` on `pv_gate` only. No `verify_all`, `pytest`, `make backup`,
downgrade, `collect_logs --push`, local-ops or EU-V script was run. Credentials are
disposable placeholders; the env file lived at `/tmp/pv-gate/env.sh` (outside Git, never
printed, removed with the tree at teardown).

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
| v2 rerun (revision 2) | 2026-09-13 00:10:19→00:10:49 | same command on the v2 helper bytes | **0** | **3 passed (29.7s)** |
| v4 rerun (v3 helper, first attempt, **brand-new empty database**) | 2026-09-13 02:19:55→02:20:55 | same command on the v3 helper bytes, `RUN_STAMP=v4-1789265995` | **1** | **1 failed / 2 passed (59.7s)** — tests 2 and 3 passed; test 1 failed because the product's first page load raced its own identity bootstrap (finding below), not because of the helper; raw runner log `/tmp/pv-gate/logs/rerun-v4.txt` was deleted with the disposable tree at teardown, the retained evidence is `/tmp/pv-gate-evidence/api-500-first-boot.txt` |
| **v5 rerun (v3 helper, this revision)** | **2026-09-13 02:28:28→02:28:56** | same command, `RUN_STAMP=v5-1789266508`; identity bootstrap already committed (one synthetic upload first) | **0** | **3 passed (28.0s)** — test 1 `7.9s`, test 2 `17.0s`, test 3 `2.6s`; raw log `/tmp/pv-gate-evidence/rerun-v3-helper.txt` |

Per-test times v5 are the v3 helper's: each ground-truth read is a bounded async child
instead of a blocking exec, so it is slower than v1 by design. Neither rerun retried a
timeout, neither re-clicked a button, and no run exceeded 5 minutes.

### Helper-level guard checks (v3, not part of the 3-test gate)

`tests/browser/pv-gate-negative-checks.mjs`, executed `2026-09-13` against the v3 helper
bytes: **7/7 PASS, exit 0**, `max_output_bytes=1048576`; every failure carried a fixed
code and bounded numeric/OS fields only, and the synthetic sentinel never appeared in any
message (`/tmp/pv-gate-evidence/negative-checks.txt`):

| Check | Observed |
|---|---|
| JSON/parse error | `PVGATE_BRIDGE_INVALID_JSON`, `stdout_bytes=99`, message 61 B — no payload echoed |
| Non-zero exit | `PVGATE_BRIDGE_CHILD_EXIT_NONZERO`, `exit_code=3`, numeric fields only, trace text absent (message 152 B) |
| stdout over cap | `PVGATE_BRIDGE_STDOUT_OVERFLOW`, `SIGKILL`, buffered `stdout_bytes=1048576` == cap, `stdout_total_bytes=1114112`, message 166 B (memory held at the cap, not the total) |
| stdin error on closed pipe | `PVGATE_BRIDGE_CHILD_STDIN_ERROR`, `os_code="EPIPE"` — fixed failure, not a hang or a pass |
| Pre-aborted signal | `PVGATE_BRIDGE_CANCELLED_BEFORE_START`, no child spawned |
| Unspawnable interpreter | `PVGATE_BRIDGE_CHILD_START_FAILED`, `os_code="ENOENT"` |
| Missing explicit env | `PVGATE_BRIDGE_ENV_MISSING_DB` — no fallback default exists |

Live timeout check on a real hang (black-hole DB host, `PV_GATE_BRIDGE_TIMEOUT_MS=1500`):
killed at **1510 ms** with fixed code `PVGATE_BRIDGE_CHILD_TIMEOUT` and `signal_name=SIGKILL`.
An earlier revision's containment check (`storage_path = ../../../../etc/passwd` and
`/etc/passwd`) is unchanged in v3: `outside_storage_root: true`, no read, no resolved path
echoed, synthetic guard rows inserted/deleted in the disposable DB only.

### Case table — real vs injected vs not run

The v5 rerun re-executed every row marked PASS below on the v3 helper bytes; the columns
say what the case proves, so they are not duplicated per run.

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

Kept as the reference correlation for a run whose data was not truncated afterwards; the
v5 rerun produced the same shape (`RUN_STAMP=v5-1789266508`, TXT runs
`8d731996-bb69-4ae8-978a-972ea65e2f01` / `838b70d4-8b0b-44b2-9e53-88f0cf152fc5`, PDF runs
`86364e2d-016d-4b8d-ad23-12612d6bde8b` / `0d5ab22e-76e0-442c-bf6d-a8bef22aab01`, all
`finished`, `ocr_status` `complete`/`skipped` matching SQL and the UI note).

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
exceptions, worker alive afterwards, no crash artifact. The v5 rerun's worker log shows the
same pattern (3 ingest + 4 ocr, all `Job OK`, 0 exceptions). **Correction carried from revision 2:** the
TXT upload has **no** RQ job — text sources are ingested **inline** during upload
(`ingest_method='inline_text'`); PDF/PNG uploads are the ones that create real ingest jobs.
All four clicks returned `202 {queued:true, job_id}` with distinct ids, each matching the id
shown by the UI's accepted note; no auto-enqueue and no retry on any path (the spec never
re-clicks; a missing terminal state raises `UNCONFIRMED …`).

## Finding — first-boot bootstrap race (measured, NOT fixed here)

The v4 rerun ran against a **brand-new empty database** (the realistic first-load state of a
fresh owner-preview deployment). While the first `/evidence` page load was in flight, the
page's two parallel requests raced the product's own identity bootstrap:

- `POST /api/v1/sources` → 201, then `GET /api/v1/matters` → **500** and
  `GET /api/v1/sources` → **500** (both `Internal Server Error`).
- Server traceback (twice, different request ids): `matters.py:30 resolve_workspace_id` →
  `identity_service.py:31 get_default_workspace` → `identity_service.py:23 get_local_user`
  `db.flush()` → `sqlalchemy.exc.IntegrityError: (psycopg2.errors.UniqueViolation) duplicate
  key value violates unique constraint "uq_users__email"`, `DETAIL: Key
  (lower(email::text))=(owner@casevault.local) already exists` — two concurrent requests each
  inserted the local owner (`605a0357-d3b9-47a4-9863-15c9a41226c3` /
  `b69ac15d-5f73-4a33-bc88-feaad604edfe`).
- UI consequence: "Couldn't load the evidence list. Reason: Internal Server Error." and
  "Couldn't load the matter list. Filtering by matter is unavailable right now — Internal
  Server Error." After the race, every later request in the same run returned 200.

Evidence: `/tmp/pv-gate-evidence/api-500-first-boot.txt` (access log, traceback key lines,
both ids, UI snapshot text). The Playwright `error-context` for that run was cleared by the
next run's `test-results/` cleanup, so the traceback capture is the retained artifact.

Reproduction attempt, reported honestly: after truncating the bootstrap tables, **two**
parallel `GET /sources` + `GET /matters` requests both returned 200 and left no rows —
the race was **not** reproduced that way, so this is recorded as an intermittent
first-boot race, not a deterministic one. A stronger reproduction would need more
concurrency/timing than this gate's budget allows.

Impact on this gate: it is a **product defect**, not a helper or harness defect (the same
helper bytes passed 3/3 once the bootstrap had committed, v5). It is outside this gate's
write set, so **no product fix was attempted here** — the integrator/owner must decide.
Preview impact: the very first page load of a brand-new empty install can show an error
state; a reload (or one warm-up request) resolves it. This belongs in any preview
instructions, together with the limitations below.

## Review response (integrator comment 5649650869)

| Requested | Status | Evidence |
|---|---|---|
| Public errors = fixed reason codes + bounded numeric exit/signal status only; **no** regex sanitizers/excerpts; raw diagnostics only via explicit local opt-in | **done** | `BRIDGE_CODES` (13 fixed `PVGATE_BRIDGE_*` codes); `BridgeError` filters detail to finite numbers and short `[A-Z0-9_]` status strings — child output is never passed in; the whole `sanitize()`/excerpt path is deleted; `PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS=<file>` writes raw output to a mode-0600 local file, unset by default and never set by the tests; negative checks assert the sentinel `SYNTHETIC_SENTINEL` appears in no message |
| Bound accumulated stdout/stderr; hard-kill/fail on cap | **done** | `MAX_OUTPUT_BYTES` (default `1 048 576`, per stream) accumulated per chunk; crossing it kills with `PVGATE_BRIDGE_STDOUT_OVERFLOW`/`STDERR_OVERFLOW` and reports cap + total; check observed child killed at buffered `1048576` with `stdout_total_bytes=1114112` |
| Child stdin errors are a fixed failure | **done** | both `child.stdin` `error` and `stdin.end()` callback paths kill and throw `PVGATE_BRIDGE_CHILD_STDIN_ERROR`; check observed `EPIPE` reported as that fixed code (never a hang or a pass) |
| Remove the `detached:false`-prevents-orphan claim | **done** | the v2 comments ("cannot outlive the runner as an orphan") are gone; v3 documents exactly what is guaranteed — SIGKILL on timeout/cancel/overflow/stdin-error, a best-effort kill in the `exit` handler, and server-side timeouts so an orphan cannot hold a DB/redis connection indefinitely — and states explicitly that no hard no-orphan guarantee is claimed or implied |
| Small synthetic negative checks for JSON/trace/parse-error/overflow paths | **done** | `tests/browser/pv-gate-negative-checks.mjs`: 7 checks (parse → fixed code; non-zero exit + trace text not echoed; stdout over cap; stdin error; pre-aborted cancel; unspawnable interpreter; missing env), **7/7 PASS exit 0**, log `/tmp/pv-gate-evidence/negative-checks.txt`; the file is not matched by the Playwright config (`pv-gate-*.spec.mjs`) so the 3-test gate stays 3 tests |
| Rerun only the 3 PV cases, ≤5 min, then save measured results and cleanup | **done** | v4 (empty DB) 1 failed/2 passed 59.7 s, v5 (bootstrapped DB) **3 passed 28.0 s exit 0**; both ≤5 min, retries 0, 1 worker; v4's failure is the product finding above; evidence in `/tmp/pv-gate-evidence/`; cleanup verified below |
| Push revised SHA + measured results to PR #20 | **done** | delivery commit = tip of `arena/01a097ea-casevault`, reported with its SHA in the PR #20 comment (spec `f65c61e8…c24`, bridge `8c65a636…a47`, checks `9dac5693…709`), pushed fast-forward; measured results posted as a PR #20 comment |

Earlier review (`5649551113`, revision 2) asked for a bounded async bridge,
storage containment before the disk read, the corrected TXT-ledger row, exact commit
identity and positively verified cleanup — all delivered in the `cb91e9e`/`d1a504f`
round and accepted; the containment checks, ledger correction and cleanup verification
remain in this note. One of its items is now **superseded**: the `sanitize()` redaction it
introduced was removed in v3 because a regex sanitizer cannot guarantee non-disclosure —
the replacement is fixed codes plus the explicit opt-in, exactly as the later review
required.

### Owned-resource inventory and cleanup (positively verified)

Owned for this revision: redis manager PID 1649 (server PID 1652, `127.0.0.1:6390`), API
PID 1669 (uvicorn server child 1670, `0.0.0.0:8110`), worker PID 1684 (RQ child 1685),
web PID 1728 (`0.0.0.0:3110`), Postgres cluster `/tmp/pv-gate/pgdata` (PID 1622) with
databases `pv_gate` (+ throwaway `pv_gate_repro`), storage `/tmp/pv-gate/storage`, redis dir
`/tmp/pv-gate/redis`. Pre-start check: those ports were free and no
`uvicorn`/`workers.run_worker`/`next dev`/`redis-server` process existed. Nothing outside
this list, and no other port, was touched.

Teardown, observed step by step: (1) stopped the services individually and then re-checked
**by pattern and by port**, which caught a real leak — the API's uvicorn server child (1670)
survived its process-manager stop and had to be `SIGKILL`ed before port 8110 was free; all
four ports 8110/8111/3110/6390 then showed no listener and `no stack processes`;
(2) `agent_pg.py stop` → `postgres stopped`, re-check: no stack process, no port;
(3) `rm -rf /tmp/pv-gate` (cluster, storage, redis dir, downloads) → confirmed absent;
(4) repo `git status` shows only this revision's PV files, `data/` still contains only its
committed `README.md`. Retained deliberately: `/tmp/pv-gate-evidence/` (`README.txt`,
`api-500-first-boot.txt`, `negative-checks.txt`, `rerun-v3-helper.txt`,
`downloads-listing.txt`, `storage-sample/`) plus the isolated tooling dir (no case data).
**No service is left running by this gate.**

## Contract gaps

None in the closure contract. Three measured observations for the integrator (the first is
a **defect** — see the finding section; the other two are limitations):

1. First boot on an empty database can 500 two list endpoints if concurrent requests race
   the identity bootstrap (`uq_users__email`). Not fixed here (out of write set).
2. **`page_count` is `NULL`** (never `0`) for stub-skipped pdf/image rows, API included.
   Honest for "not determined", but any consumer that sums `page_count` must handle `null`
   (the list/detail badges use `ocr_status`). Worth a BACKLOG line.
3. The Status panel's "Current server state" line renders the **persisted** state, so when
   two consecutive runs end in the same outcome it reads identically before/after. Per-run
   UI attribution therefore comes from the accepted-note job id plus the RQ/SQL correlation,
   not from that line — a stated limitation of this gate, not a bug.

## Risks / follow-ups

- **First-boot race** above: the only product defect this gate measured; recurrence risk is
  unknown (intermittent, not deterministically reproduced), so any preview statement should
  tell the owner to reload if the very first page load errors.
- **Sandbox browser cannot render PDFs inline** (`navigator.pdfViewerEnabled=false`). The
  fallback is asserted; native rendering needs a PDF-capable browser — unchanged transfer to
  EU-V/EU-M/Mac. No claim made here.
- This gate is 3 focused tests on one disposable stack: **not** EU-V acceptance, not a
  full-suite rerun, not a substitute for the pending L2.5/L3.x list work or the detail/OCR
  proof owned by EU-V.
- Public helper failures are safe to paste into a PR (fixed codes + numbers); raw child
  output exists only if someone deliberately sets `PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS` to a
  local file — never an automatic exception text, never in a test failure message.
- PR/branch ownership: `arena/01a097ea-casevault` carries two workstreams — OCR-PLAN
  (note-only, its own review open, now parked) and PV-GATE. GitHub refuses a second PR from
  the same head branch, so the delivered PR (20) is the combined artifact. Observed during
  revision 2: the OCR-PLAN session pushed `ba93aac` while PV was preparing its commit — the
  concurrent-writer risk the integrator flagged. PV's response was the minimum-conflict
  path: its single local commit was rebased onto `ba93aac` (no force-push, no rewriting of
  the other session's commits, no touch of OCR-PLAN files) and pushed fast-forward. The
  integrator has since named PV-GATE the sole remaining writer for this branch; this
  revision wrote only `tests/browser/pv-gate-*` and `handoff/notes/PV-GATE.md`.
- Nothing under `data/`, no `.env*`, no credentials, no raw logs or downloaded bytes are in
  the diff (raw synthetic evidence stays in `/tmp`, outside Git).

## What the next agent must know

- **Recommendation: preview-SAFE WITH LIMITATIONS** (not blocked). On the exact released
  product code (`a040e9f`): uploads, detail open without unexpected downloads, explicit
  byte-exact downloads, the full OCR reprocess chain (202 → real job → decoded payload →
  SQL/pages → UI) and basic Status editing behaved correctly on every run whose database
  was already bootstrapped (v1, v2, v5), with a surviving worker and no new crash.
  Limitations that must travel with any preview statement: **first load on a brand-new
  empty database can 500 if the identity bootstrap races — reload resolves it**; no native
  PDF rendering in this browser (labeled fallback only); PDF/image are **stub-skipped** (no
  extraction); `page_count` is `NULL` for skipped sources; and no Mac/real-data/full-acceptance
  claim exists.
- Reproduce: set `WEB_BASE_URL`, `PV_GATE_DATABASE_URL`, `PV_GATE_REDIS_URL` (and
  `LOCAL_STORAGE_ROOT` for the contained-bytes check) on an owned disposable stack, then run
  `node node_modules/@playwright/test/cli.js test -c /tmp/pv-gate-browser-tools/pv-gate.playwright.config.mjs`
  from `/tmp/pv-gate-browser-tools`. The harness-only negative checks run from the repo:
  `timeout 240 node tests/browser/pv-gate-negative-checks.mjs` (no DB/redis needed).
  `PV_GATE_OCR_TIMEOUT_MS` (default 60 s) bounds each per-click terminal wait;
  `PV_GATE_BRIDGE_TIMEOUT_MS` (default 20 s) bounds each ground-truth read;
  `PV_GATE_MAX_OUTPUT_BYTES` (default 1 MiB/stream) bounds child output. On timeout the
  test fails with a fixed code or `UNCONFIRMED` and never enqueues a retry.
- Fixtures are the shared EU-D synthetic bytes plus a run-unique marker (TXT line, PDF
  trailing comment after `%%EOF`, PNG `tEXt` chunk), so every run's sha256 is unique and
  "downloaded bytes == uploaded bytes" is an exact per-run claim.
- Read-only reuse means EU-D fixtures/EU-L specs were not edited; this branch adds only
  `tests/browser/pv-gate-*` and this note. **Not merged, no force-push, no product fix.**

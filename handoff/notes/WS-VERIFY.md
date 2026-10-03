# WS-VERIFY — Wave 3 End-to-End Verifier & Edge Smoke Gate

**Owner:** Wave 3 Verifier · **Date:** 2026-10-03
**Branch (actual):** `arena/01a100f2-casevault` (session-fixed; brief's
`feat/verifier-wave3` worktree was not used — see §0)
**Integration target:** `arena/01a0899f-casevault` (not present in this clone; verifier built merge-ready)
**Migration:** None
**Base commit:** `bfdaf22` ("Patch spec inconsistencies and model gaps")
**Verified through:** `6ec8fe2` — Run 2 covers `356c5db` (WS-AI-INTEL) +
`6ec8fe2` (WS-CLAIMS); Run 1 (§2, history) covers pre-merge baseline `ad2e911`.

## 0. Binding rules & assumptions

The brief cites `handoff/AGENT_POLICY.md` and `handoff/PARALLEL_PLAN.md` §4b.
Neither exists in this checkout: the repo at `bfdaf22` is planning-only
(`README.md` + 6 specs under `docs/specs/`, no `apps/`, `workers/`, `handoff/`,
tests, or scaffold files). The verifier was therefore built directly against:

- `Legal_Matter_Intelligence_Technical_Spec.md` (API surface §9.2, workers §10,
  OCR pipeline §15, MCP §14, AI guardrails §12.5, exports §19, audit §21)
- `Legal_Matter_Intelligence_PRD.md` (§9–10 domain/functional requirements)
- `Legal_Matter_Intelligence_Roadmap.md` (Sprints 3–5 ingestion/review chain)
- `Legal_Matter_Intelligence_Repo_Scaffold_Phase0_Plan.md` (expected layout,
  safety gates: `.gitignore`, `.env.example`)

Assumption: Wave 3 feature branches will land code at the spec-standard paths
(`apps/api`, `workers/pipeline`, `workers/edge|apps/edge`, `packages/*`). All
probes degrade to SKIP when a surface is absent, and to FAIL under strict-gate
mode (see §3), so this suite is safe to run before, during, and after merges.

## 1. Write set (exclusive) & invariant verdicts

| Owned file | Purpose | Lines |
|---|---|---:|
| `tests/integration/test_wave3_e2e.py` | E2E integration probes: harness self-checks, API health, ingest chain, **OCR dual-path invariant**, review/proof-graph, chronology/claims, search/connectors, AI guardrails, exports/audit, punch-list manifest | ~600 |
| `tests/integration/test_cloudflare_worker.py` | Edge gate: wrangler/entry contract, fetch+CORS+configurable-backend static checks, live worker probes (`/health`, proxy, preflight, 404 shape, security headers), edge manifest | ~330 |
| `scripts/wave3_smoke.py` | Fast (<60s, stdlib-only) smoke gate: 14 checks across structure/safety/ocr/api/edge/e2e; `--json`, `--strict`, `--offline`, `--api-url`, `--worker-url` | ~380 |
| `handoff/notes/WS-VERIFY.md` | This report (pass/fail counts per invariant 4) | — |

No shared helper modules / `conftest.py` were created on purpose: helpers are
duplicated inside the two test files so other workstreams' test infrastructure
cannot collide with (or be broken by) the verifier.

| # | Invariant | Verdict (as of Run 2) |
|---|---|---|
| 1 | Verifies E2E integration across merged branches | **PARTIALLY VERIFIED** — claims chain live (`/health`, `/api/v1/{health,matters,claim-instances,claim-templates}` all 200; burden/support models present); AI services present but router **unmounted** (finding F1); sources/events/proposals/search/exports/audit/connectors/edge unmerged. e2e: 14P/14S/0F default, 14P/14F strict |
| 2 | Checks OCR engine with digital PDF **and** scanned/image fallback | **HARNESS READY / NOT YET VERIFIED** — no OCR engine merged; all 6 OCR probes SKIP. Fixture self-checks PASS (digital marker extractable, scanned fixture image-only) |
| 3 | Does not write application or UI feature code | **HELD** — only the 4 files above (Run 2 probe-consistency fix touched the owned e2e file only); `git status` shows no other changes |
| 4 | Reports pass/fail counts explicitly here | **HELD** — Runs 1–2 below |

## 2. Verification runs (explicit counts)

### Run 2 — post WS-CLAIMS + WS-AI-INTEL, live API (2026-10-03, latest)

Verified commits `356c5db` + `6ec8fe2`. Environment: Run-1 sandbox plus API
stack (`fastapi 0.142.2`, `uvicorn 0.54.0`, `sqlalchemy 2.0.54`,
`pydantic 2.13.5`); API started locally from `apps/api` (SQLite fallback
`data/dev.sqlite`, git-ignored) at `http://localhost:8000`. Worker URL
`https://casevault-worker.dan-2eb.workers.dev` supplied for live edge probes.

Live endpoint map (curl, API up):

| Endpoint | HTTP | Verdict |
|---|---:|---|
| `/health`, `/api/v1/health` | 200 | PASS — scaffold health live |
| `/api/v1/matters` | 200 | PASS — bootstrap stub live |
| `/api/v1/claim-instances`, `/api/v1/claim-templates` | 200 | PASS — WS-CLAIMS live |
| `/api/ai/providers` | 404 | **FINDING F1** — ai router merged but not mounted in `main.py` |
| `/api/v1/proposals`, `/api/v1/events`, `/api/v1/search` | 404 | not yet built (punch-list) |

#### Run-2 pytest (44 tests)

| Mode | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|
| Default (punch-list) | **15** | **0** | **29** | 0 |
| Strict (merge gate) | **15** | **29** | **0** | 1 |

| File (default) | Passed | Skipped | Delta vs Run 1 |
|---|---:|---:|---|
| `test_wave3_e2e.py` (28) | 14 | 14 | **+8 passes** (see below) |
| `test_cloudflare_worker.py` (16) | 1 (manifest) | 15 (9 contract — no wrangler/entry in repo; 6 live — egress-blocked, see edge verdict) | unchanged |

The +8 e2e passes: `test_health_endpoint_answers`, `test_api_v1_health_shape`
(live API); `test_source_status_fields_present_in_models`,
`test_fact_support_links_modeled`, `test_claim_chart_surface_exists` (live 200),
`test_support_status_vocabulary_present` (WS-CLAIMS); and
`test_sharing_policy_vocabulary_present`, `test_agent_run_manifest_shape`
(WS-AI-INTEL). Remaining 14 e2e skips: 6 OCR, sources-live, proposals-live,
review-actions, events-live, search, connectors, exports, audit.

#### Run-2 smoke (14 checks)

| Mode | PASS | FAIL | SKIP | Gate | Exit |
|---|---:|---:|---:|---|---:|
| Default | **8** | **0** | **6** | **PASS** | 0 |
| `--strict` | 8 | 0 (+6 skips→fail) | 6 | **FAIL** | 1 |
| `--worker-url https://casevault-worker.dan-2eb.workers.dev` | 8 | 0 | 6 (`worker-live` SKIP: unreachable, TLS-EOF — graceful) | **PASS** | 0 |

Delta vs Run 1 (5/2/7 FAIL): `safety-gitignore` FAIL→PASS, `safety-env`
FAIL→PASS (scaffold landed), `api-health` SKIP→PASS (API up). Remaining 6
SKIPs: 2 OCR env deps, `ocr-engine`, `worker-config`, `worker-entry`,
`worker-live`.

#### Run-2 harness fix (owned file, transparent)

The first live-API run exposed a probe inconsistency: 3 surface probes
hard-asserted on live 404 (`3 failed / 14 passed / 11 skipped`) while sibling
probes SKIP on the same condition. Fixed `test_upload_route_exists_in_code_or_live`,
`test_proposals_surface_exists`, `test_events_surface_exists` to
`verify_or_skip`, matching the claims/search/exports probes and the documented
§3 semantics (default = punch-list, strict = gate). Before: 3F/14P/11S; after:
**0F/14P/14S**. No product code touched; strict mode still fails these 14 until
merged.

#### Run-2 integration findings

- **F1 (P1): ai router merged but not mounted.** `apps/api/app/routers/ai.py`
  exists (WS-AI-INTEL) but `apps/api/app/main.py` includes only
  health/matters/claims → every `/api/ai/*` returns 404 live. The ai module
  docstring assigns mounting to the owning API workstream; WS-CLAIMS (which
  owns the `main.py` scaffold) did not include it. Classic cross-branch miss —
  one-line fix on the API owner's side.
- **F2 (P2): AI route prefix `/api/ai` vs spec `/api/v1/agent-runs`.**
  WS-AI-INTEL mounts outside the Tech Spec §9.2 `/api/v1` namespace. Needs a
  recorded decision: adopt `/api/ai` + amend spec, or migrate to `/api/v1`.
- **F3 (info): unmerged surfaces.** sources/proposals/events/search/exports/
  audit/connectors/OCR/edge → remaining 14 e2e + 9 worker-contract skips.

#### Run-2 edge verdict (worker URL supplied)

Live probes: **6/6 SKIP** — `TLS/SSL connection has been closed (EOF)` /
curl `SSL_ERROR_SYSCALL`. Sandbox-egress evidence: `pypi.org`→200,
`github.com`→200, `workers.dev`→000, `cloudflare.com`→000 (TCP connects, TLS
reset = SNI-filtered egress). Worker health is **UNKNOWN from this sandbox** —
not a product fail; probes degrade correctly. Re-run from CI/local with open
egress:

```bash
CLOUDFLARE_WORKER_URL=https://casevault-worker.dan-2eb.workers.dev \
  python3 -m pytest tests/integration/test_cloudflare_worker.py -v
```

### Run 1 — pre-merge baseline (2026-10-03, history)

Environment: `python3.11.2`, `pytest 9.1.1`, repo root `/home/user/casevault`,
no API/worker running, no `CLOUDFLARE_WORKER_URL`, OCR libs absent (bare sandbox).

#### Run-1 pytest (44 tests)

| Mode | Command | Passed | Failed | Skipped | Total | Exit |
|---|---|---:|---:|---:|---:|---:|
| Default (punch-list) | `pytest tests/integration/ -q` | **7** | **0** | **37** | 44 | 0 |
| Strict (merge gate) | `WS_VERIFY_STRICT=1 pytest tests/integration/ -q` | **7** | **37** | **0** | 44 | 1 |

Per-file breakdown (default mode):

| File | Passed | Skipped | Notes |
|---|---:|---:|---|
| `test_wave3_e2e.py` (28 tests) | 6 (5 harness self-checks + manifest) | 22 (API/OCR/review/chronology/claims/search/AI/export probes — no product code merged) | 0 failed |
| `test_cloudflare_worker.py` (16 tests) | 1 (edge manifest) | 15 (9 contract + 6 live — no wrangler/entry/URL) | 0 failed |

The 7 passes prove the harness itself is sound (fixtures valid, manifest
well-formed); the 37 skips are the current integration punch-list, each with a
machine-readable reason (`pytest -v -rs`).

#### Run-1 smoke (14 checks)

| Mode | PASS | FAIL | SKIP | Gate | Exit |
|---|---|---:|---:|---:|---|
| Default | **5** | **2** | **7** | **FAIL** | 1 |
| `--strict` | 5 | 2 (+7 skips→fail) | 7 | **FAIL** | 1 |
| `--offline` | 5 | 2 | 7 | **FAIL** | 1 |
| `--json` | same counts, `gate: "FAIL"` | | | | |

Per-check results (default):

| Status | Check | Detail |
|---|---|---|
| PASS | `struct-specs` | 6 spec docs present |
| PASS | `struct-verifier` | 3/3 WS-VERIFY owned files present |
| **FAIL** | `safety-gitignore` | `.gitignore` missing — Phase 0 gate: scaffold before feature merges (`data/`, `.env*`) |
| **FAIL** | `safety-env` | `.env.example` missing — Phase 0 gate: ports, `DATABASE_URL`, `REDIS_URL`, AI keys |
| SKIP | `ocr-pydeps` | no pypdf/PyMuPDF/pdfplumber/PIL/ocrmypdf installed (env-dependent, CI installs) |
| SKIP | `ocr-binaries` | tesseract/ocrmypdf/gs not on PATH (env-dependent) |
| PASS | `ocr-digital-fixture` | 610-byte PDF, marker embedded as text |
| PASS | `ocr-scanned-fixture` | 708-byte PDF, raster XObject, no text stream |
| SKIP | `ocr-engine` | no OCR module merged (`workers/pipeline/ocr*`, Tech Spec §15) |
| SKIP | `api-health` | `http://localhost:8000` not reachable |
| SKIP | `worker-config` | no wrangler config merged |
| SKIP | `worker-entry` | no worker entry merged |
| SKIP | `worker-live` | `CLOUDFLARE_WORKER_URL` not set |
| PASS | `e2e-collect` | 44 tests collected |

The 2 FAILs are deliberate hard gates, not skips: Phase 0 safety files are
preconditions for *any* feature merge per the scaffold plan, so the smoke gate
stays red until the scaffold workstream lands them. Everything Wave 3-specific
is SKIP (punch-list) rather than FAIL in default mode.

### 2c. How to re-run

```bash
pip install pytest            # one-time; smoke itself needs stdlib only
python scripts/wave3_smoke.py [-v] [--json] [--offline]
python scripts/wave3_smoke.py --strict          # merge gate: skips fail
pytest tests/integration/ -q                    # punch-list mode
WS_VERIFY_STRICT=1 pytest tests/integration/ -q # merge gate
CASEVAULT_API_URL=http://localhost:8000 CLOUDFLARE_WORKER_URL=https://<worker> \
  pytest tests/integration/ -q                  # full live run post-merge
```

## 3. Gate semantics (dual mode, both suites + smoke)

- **Default mode** = punch-list: missing integrations SKIP with reasons;
  `pytest` exits 0 (harness green), smoke exits 1 only on hard FAILs (none
  currently — Phase-0 safety files landed in Run 2).
- **Strict mode** (`WS_VERIFY_STRICT=1` / `smoke --strict`) = merge gate: every
  SKIP becomes a FAIL. Red by design until fully merged (Run 1: 37 pytest
  fails; Run 2: 29 fails with API live); post-merge it must be fully green
  before the integration target accepts.

## 4. Blockers & next steps

1. **Phase 0 scaffold — DONE (Run 2).** `.gitignore`, `.env.example`, health
   routes landed via the `356c5db`/`6ec8fe2` bootstraps; smoke safety checks
   PASS. Residual: two bootstrap authors — confirm single scaffold ownership
   (see WS-CLAIMS / WS-AI-INTEL reconciliation notes).
2. **F1 (P1): mount the ai router.** One-line `main.py` include (+ F2 prefix
   decision). Owner: API scaffold owner / WS-CLAIMS in agreement with
   WS-AI-INTEL. Until then `/api/ai/*` is dead surface.
3. **OCR engine missing** (invariant 2): expected at `workers/pipeline/ocr*.py`
   (or `apps/api/app/integrations/ocr*`) exposing an `extract_text`-family
   callable; must show both digital-extraction and tesseract/ocrmypdf-fallback
   markers. The verifier auto-discovers common module/function names and call
   conventions — no verifier change needed when it lands.
4. **Unmerged surfaces (F3):** sources/proposals/events/search/exports/audit/
   connectors/edge → 14 e2e + 9 worker-contract skips remain.
5. **Edge live re-run off-sandbox:** `workers.dev` egress is blocked here;
   re-run the Run-2 edge command from CI/local with open egress for a live
   worker verdict.
6. **Re-verify on integration target**: after further Wave 3 merges, run the
   strict commands in §2c; post-merge target is **44 passed / 0 failed**
   (pytest strict) and **14 PASS / 0 FAIL / 0 SKIP** (smoke, with services up)
   — current strict standing: **15 passed / 29 failed** (pytest),
   smoke strict FAIL (6 skips).

## 5. F1/F2 patch proposal for owning workstream (2026-10-03, proposal only)

Scope note: the fix below was requested of WS-VERIFY but **not applied** —
invariant 3 bars the verifier from writing application code, and the
assignment's endpoint targets don't exist in code or spec (see D2). Owner:
WS-AI-INTEL + API scaffold owner (WS-CLAIMS owns `main.py`). WS-VERIFY will
re-run the gate after the owning workstream lands the fix. Baseline before any
change: `tests/workers/test_ai_pipeline.py` = **57 passed** (run 2026-10-03).

### Decisions required (blocking)

- **D1 — mount prefix.** Options: (a) `/api/v1/ai/*` (consistent with
  claims/matters routers + Tech Spec §9.2 `/api/v1` namespace; recommended);
  (b) keep `/api/ai/*` (zero test churn, perpetuates F2 spec deviation).
- **D2 — endpoint inventory mismatch.** The review asked for
  `POST /api/v1/ai/proposals/generate` and `POST /api/v1/ai/stream` → 200, but
  merged `ai.py` (356c5db) provides `POST /proposals/runs` (202),
  `GET /proposals`, `POST /agent-runs` (201), `GET /agent-runs/{id}`,
  `POST /agent-runs/{id}/steps/{step_id}/proposals`, `GET /providers[/health]`
  — no `/proposals/generate`, no `/stream`, and 202/201 (not 200) on the POSTs
  by design. Decide: rename, alias, or new endpoints + spec amendment. The
  verifier cannot invent API surface.
- **D3 — success-code bar.** Recommend "2xx" (202 accepted / 201 created are
  REST-correct for async-run and create endpoints), not literal 200.

### Proposed diff (option D1a: `/api/v1/ai/*`)

`apps/api/app/routers/ai.py` — internal prefix `/api/ai` → `/ai` (matches the
claims/matters pattern of prefix-less routers), and update the module
docstring's mount instructions + endpoint list accordingly:

```diff
-router = APIRouter(prefix="/api/ai", tags=["ai"])
+router = APIRouter(prefix="/ai", tags=["ai"])
```

`apps/api/app/main.py` — mount alongside the other routers:

```diff
-from app.routers import claims, health, matters
+from app.routers import ai, claims, health, matters
 ...
 app.include_router(health.router)
 app.include_router(matters.router, prefix="/api/v1")
 app.include_router(claims.router, prefix="/api/v1")
+app.include_router(ai.router, prefix="/api/v1")
```

Resulting live surface: `/api/v1/ai/providers[/health]`,
`/api/v1/ai/proposals/runs`, `/api/v1/ai/proposals`,
`/api/v1/ai/agent-runs[/{id}...]`.

### Required test updates (same commit, no exceptions)

`tests/workers/test_ai_pipeline.py::TestHttpSurface` hardcodes 8 `/api/ai/*`
paths (lines ~829–914); every one must move to `/api/v1/ai/*` or the suite
goes red on a correct fix. No other in-repo `/api/ai` consumers exist
(verified by grep 2026-10-03).

### Acceptance checklist (WS-VERIFY re-run gates on these)

1. `GET /api/v1/ai/providers` → 200 live (proves F1 mount fixed).
2. `POST /api/v1/ai/proposals/runs` → 202, `POST /api/v1/ai/agent-runs` → 201
   live (or per D2/D3 replacements).
3. `pytest tests/workers/test_ai_pipeline.py -q` → 57 passed.
4. `python scripts/wave3_smoke.py` → still GATE PASS; e2e AI/review probes
   improve (currently SKIP on live 404s).
5. Decision record for D1/D2/D3 in `handoff/DECISIONS.md` (or owning
   workstream's notes) so the spec deviation is tracked, not silent.

## Appendix — probe inventory

- Env vars: `CASEVAULT_API_URL`/`API_BASE_URL` (default `http://localhost:8000`),
  `CLOUDFLARE_WORKER_URL`/`WORKER_URL`, `WS_VERIFY_STRICT`, `WS_VERIFY_TIMEOUT`
  (default 3s pytest-e2e / 5s worker), `WS_VERIFY_LATENCY_BUDGET_MS` (3000).
- OCR discovery: modules `workers.pipeline.{ocr,ocr_engine,ocr_service,parsing}`,
  `apps.api.{app.}integrations.{ocr,ocr_engine}`; callables `extract_text`,
  `extract_pdf_text`, `ocr_{pdf,image,page,source}`, `process_{source,pdf}`,
  `run_ocr`, plus `OcrEngine`-family classes; call conventions tried:
  `(path)`, `(str)`, `(bytes)`, `pdf_path=/path=/file_path=/data=/image_path=`.
- Worker discovery: `wrangler.{toml,json,jsonc}` at root or `workers/edge`,
  `apps/edge`, `edge/`, `cloudflare/`; entries matching
  `(worker|edge|proxy).(ts|js|mjs)` or `src/(index|worker).(ts|js)`.
- Fixtures: stdlib-generated xref-correct digital PDF (text marker), image-only
  scanned PDF (raster XObject; PIL-rendered text when PIL available, else gray
  raster + structure-only assertions), minimal valid grayscale PNG.

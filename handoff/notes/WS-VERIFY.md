# WS-VERIFY — Wave 3 End-to-End Verifier & Edge Smoke Gate

**Owner:** Wave 3 Verifier · **Date:** 2026-10-03
**Branch (actual):** `arena/01a100f2-casevault` (session-fixed; brief's
`feat/verifier-wave3` worktree was not used — see §0)
**Integration target:** `arena/01a0899f-casevault` (not present in this clone; verifier built merge-ready)
**Migration:** None
**Base commit:** `bfdaf22` ("Patch spec inconsistencies and model gaps")

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

| # | Invariant | Verdict |
|---|---|---|
| 1 | Verifies E2E integration across merged branches | **HARNESS READY / NOT YET VERIFIED** — no Wave 3 branches merged in this checkout; all integration probes SKIP (default) / FAIL (strict gate) as designed |
| 2 | Checks OCR engine with digital PDF **and** scanned/image fallback | **HARNESS READY / NOT YET VERIFIED** — dual-path probes + static dual-marker check + structured-failure check written; blocked on OCR engine merge. Fixture self-checks PASS (digital marker extractable, scanned fixture image-only) |
| 3 | Does not write application or UI feature code | **HELD** — only the 4 files above; `git status` shows no other changes |
| 4 | Reports pass/fail counts explicitly here | **HELD** — see §2 |

## 2. Verification runs (explicit counts)

Environment: `python3.11.2`, `pytest 9.1.1`, repo root `/home/user/casevault`,
no API/worker running, no `CLOUDFLARE_WORKER_URL`, OCR libs absent (bare sandbox).

### 2a. `pytest tests/integration/test_wave3_e2e.py tests/integration/test_cloudflare_worker.py`

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

### 2b. `python scripts/wave3_smoke.py` (14 checks)

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
  `pytest` exits 0 (harness green), smoke exits 1 only on hard FAILs (currently
  the 2 Phase-0 safety files).
- **Strict mode** (`WS_VERIFY_STRICT=1` / `smoke --strict`) = merge gate: every
  SKIP becomes a FAIL. Pre-merge this is red by design (37 pytest fails now);
  post-merge it must be fully green before the integration target accepts.

## 4. Blockers & next steps for `arena/01a0899f-casevault`

1. **Phase 0 scaffold missing** (blocks everything): `.gitignore`, `.env.example`,
   `apps/api` health routes, `handoff/` workflow files. Smoke FAILs on the first
   two until landed. Owner: scaffold workstream, not WS-VERIFY.
2. **OCR engine missing** (invariant 2): expected at `workers/pipeline/ocr*.py`
   (or `apps/api/app/integrations/ocr*`) exposing an `extract_text`-family
   callable; must show both digital-extraction and tesseract/ocrmypdf-fallback
   markers. The verifier auto-discovers common module/function names and call
   conventions — no verifier change needed when it lands.
3. **API + worker missing**: bring up `GET /health`, `/api/v1/*` per Tech Spec
   §9.2 and the worker (`wrangler.toml` + fetch handler + `/health` + CORS +
   env-configured backend); then set `CASEVAULT_API_URL` / `CLOUDFLARE_WORKER_URL`
   and re-run §2c for a live verdict.
4. **Re-verify on integration target**: after merging Wave 3 branches into
   `arena/01a0899f-casevault`, run the strict commands in §2c; expected post-merge
   target is **44 passed / 0 failed** (pytest strict) and **14 PASS / 0 FAIL /
   0 SKIP** (smoke, with services up) — or an explicit, smaller skip list with
   per-item justification appended to this note.

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

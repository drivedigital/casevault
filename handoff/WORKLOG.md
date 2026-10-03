# WORKLOG

## 2026-10-03 · Wave 3 · WS-CLAIMS — Legal Claims Matrix & Burden-of-Proof Mapping

**Branch:** `arena/01a100f2-casevault` (session-pinned branch; the brief's
`feat/claims-matrix` worktree at `../casevault-claims` did not exist in this
environment, so work landed directly on the session branch — see
`handoff/notes/WS-CLAIMS.md` for the full deviation log.)

- Implemented the claims matrix end-to-end: `apps/api/app/routers/claims.py`
  (templates, matrix list with burden rollups, chart, link/unlink, recompute,
  support-candidates), burden engine in `apps/api/app/services/claim_burden.py`,
  web UI in `apps/web/app/claims/**` + `apps/web/components/claims/**`, typed
  client section in `apps/web/lib/api.ts`.
- Bootstrapped the missing Phase-0 scaffold (root workspaces, `.gitignore`,
  `.env.example`, docker-compose, FastAPI app core, base models per DB schema
  draft, alembic init, seed script, Next.js app shell + placeholder routes).
- `tests/api/test_claims.py`: 23 tests, all passing.
- `npm run build --workspace=web`: passing (14 routes).
- Next: Wave 1/2 must reconcile the bootstrap (matters stub, seed script,
  proposals/facts routers) and add the claims tables to real migrations.

**Test locally:** README “Run” section (uvicorn + seed_dev + `next start`/`dev`), then open `/claims`.

**Post-merge update:** rebased onto sibling waves `ad2e911` (WS-VERIFY) +
`356c5db` (WS-AI-INTEL); resolved `.gitignore`/`.env.example`/README overlaps
(see `handoff/notes/WS-CLAIMS.md` §7), retired `pytest.ini` in favour of the
unified `pyproject.toml` pytest config (`apps/api/requirements.txt` kept for
runtime installs). Full suite: 95 passed / 29 skipped / 0 failed; web build green.

---

## 2026-10-03 — WS-AI-INTEL: F1/F2 patch applied (WS-VERIFY Run-2 proposal §5)

- **F1 fixed:** ai router mounted in `apps/api/app/main.py` with
  `prefix="/api/v1"` (WS-VERIFY's exact proposed diff; cross-workstream edit
  coordinated via the verifier's §5 proposal).
- **F2 fixed:** router internal prefix `/api/ai` → `/ai`; live surface is now
  `/api/v1/ai/*` (Tech Spec §9.2 namespace). Old prefix verified 404 live.
- Tests: 8 hardcoded paths in `tests/workers/test_ai_pipeline.py` moved to
  `/api/v1/ai/*`; suite still **57 passed**; full repo suite 95 passed /
  29 skipped / 0 failed; `scripts/wave3_smoke.py` GATE PASS (8P/0F/6S) with
  API live.
- Live acceptance (real `app.main` + local stub provider): GET
  `/api/v1/ai/providers` 200 · POST `/api/v1/ai/proposals/runs` 202 · POST
  `/api/v1/ai/agent-runs` 201 · all created proposals `review_state=proposed`.
- Decisions D1/D2/D3 recorded as D-005..D-007 in `handoff/DECISIONS.md`.

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

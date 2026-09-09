# Worklog

Per-turn implementation summary. Newest entries at the top.
Fields: Date / Branch / What changed / Why / Files affected / What needs local testing / Blockers & feedback needed.

---

## 2026-09-08 — Phase 0 repo scaffold

**Branch:** `arena/01a08429-casevault`

### What changed
- Blueprint fix-up pass applied to all six `docs/specs/` documents
  (AI-sharing defaults aligned to `no_ai` opt-in; `proposed` review-state
  floor for facts/events; `casevault` naming; roadmap sprint-math fix;
  `evidence_review_status` field alignment; UX typo).
- Phase 0 scaffold created per `Legal_Matter_Intelligence_Repo_Scaffold_Phase0_Plan.md`:
  - Safety: `.gitignore` (evidence/env/log protection), `.env.example`,
    `data/README.md` warning (only committed file under `data/`).
  - Infra: `docker-compose.yml` (postgres 16 + redis 7, localhost-bound ports).
  - API: `apps/api` FastAPI scaffold — `/health`, `/api/v1/health`, config
    loader, lazy DB engine, Alembic initialized (no domain models yet).
  - Web: `apps/web` Next.js 14 + TS + Tailwind scaffold — nav shell, React
    Query provider, `/api/v1` rewrite to the API, placeholder routes for all
    11 nav modules.
  - Workers: `workers/` RQ scaffold — queue names per Technical Spec §10.1,
    `ping`/`health_check` jobs, redis-free direct run (`make ping-job`).
  - Ops scripts: `check_env.py`, `collect_logs.py` (redaction + `-logs`
    branch flow), `backup_workspace.py`, `handoff_finish.py`,
    `seed_dev_data.py` (stub), `setup_local.sh` / `setup_local.ps1`.
  - Workflow: `Makefile`, root `package.json` (npm workspaces),
    `.github/workflows/ci.yml` (python tests, web build, gitleaks).
  - Handoff files seeded: this file, `BACKLOG.md`, `TESTING.md`,
    `KNOWN_ISSUES.md`, `DECISIONS.md`.

### Why
Phase 0 exists to make local testing with real evidence safe before any
feature code lands (safety + workflow before app code).

### What needs local testing
1. `bash scripts/setup_local.sh`
2. `make infra-up` (requires docker)
3. `make api` → `curl http://localhost:8000/health` and `:8000/api/v1/health`
4. `make web` → open http://localhost:3000, click through all nav routes
5. `make worker` (with redis up) and/or `make ping-job` (no redis)
6. `scripts/collect_logs.py --note "phase0 smoke test"` (bundle creation; no --push yet)
7. `make check-env`, `make lint`, `make test`

### Builder verification (sandbox, 2026-09-08)
- [x] `pytest` — 4 passed (API + worker smoke tests)
- [x] `ruff check apps workers scripts tests` — clean
- [x] `uvicorn` boot — `/health` and `/api/v1/health` both return `status: ok`
- [x] `python -m workers.run_ping` — ok without redis
- [x] `check_env.py` — FAIL without `.env.local` (correct), OK after
      `cp .env.example .env.local` (correct)
- [x] `collect_logs.py` bundle — secrets show `<REDACTED>` in config summary
- [x] `git check-ignore data/uploads .env.local data/diagnostics` — all ignored
- [x] `npm install` (workspaces; produced `package-lock.json` for CI `npm ci`)
- [x] web `lint` — clean; `typecheck` — clean; `next build` — 14 routes static
- [x] live boot: web :3000 serves the shell; `/api/v1/health` proxied through
      :3000 → api :8000 returns ok
- [ ] docker / `make infra-up` / real postgres+redis connectivity (not
      available in sandbox — first local test)

### Blockers / risks
- Docker not available in the build sandbox, so `infra-up` and
  DB-connectivity were NOT verified here — first thing to test locally.
- See `handoff/KNOWN_ISSUES.md` and open decisions in `handoff/DECISIONS.md`.

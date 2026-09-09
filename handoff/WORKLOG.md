# Worklog

Per-turn implementation summary. Newest entries at the top.
Fields: Date / Branch / What changed / Why / Files affected / What needs local testing / Blockers & feedback needed.

---

## 2026-09-08 — Local-run helper: `make test-db` + runbook refresh

**Branch:** `arena/01a08429-casevault`

Added `make test-db` (idempotent creation of `casevault_test` in the
compose Postgres) so `make test` works first try on a fresh local clone,
and refreshed `handoff/TESTING.md` start-the-stack steps and README
quickstart accordingly (includes `make env-create` + `make migrate`).

---

## 2026-09-08 — Port conflict fix: API default 8000 → 8100

**Branch:** `arena/01a08429-casevault`

### What changed
Default API port moved from 8000 to **8100** everywhere: `.env.example`,
`apps/api/app/config.py`, `apps/web/next.config.mjs` (proxy fallback),
`Makefile`, `scripts/setup_local.sh` / `.ps1`, `docs/specs` Phase 0 plan
.env block, `README.md`, `handoff/TESTING.md`, this worklog. Overrides
remain env-driven (`APP_PORT_API` / `API_BASE_URL`).

### Why
The local test machine already uses 8000 for oMLX and 4000/8080 for
LiteLLM; starting `make api` there would have collided or, worse, silently
talked to the wrong service. Decision recorded in `handoff/DECISIONS.md`.
Note: the earlier local-agent instruction block referenced :8000 — use
:8100 wherever that block said :8000.

### Verification
Live in sandbox: API on :8100, web on :3000 proxying `/api/v1` to :8100 —
health checks and matter/actor flows confirmed.

### Local note
Existing `.env.local` files should update `APP_PORT_API` / `API_BASE_URL`
to 8100 (or just delete `.env.local` and re-copy from `.env.example`).

---

## 2026-09-08 — Phase 1: workspace, matters, overlay links, actor registry

**Branch:** `arena/01a08429-casevault` · Roadmap Sprints 1–2

### What changed
- **Decision applied:** local identity mode (DECISIONS.md) — one implicit
  `Local Owner` user + default `CaseVault Workspace`, bootstrapped by
  `GET /api/v1/workspaces/current`. No login surface.
- **Backend (apps/api):** SQLAlchemy models for Groups A–C of the schema
  draft (users, workspaces, memberships, settings, matters, matter_links,
  actors, actor_aliases, matter_actor_roles); Alembic migrations
  **0001** (foundation) and **0002** (actors), verified upgrade/downgrade on
  real Postgres. Routers + services + Pydantic schemas for workspaces,
  matters (CRUD, filter, archive w/ timestamp), matter links (both
  directions, 409 on duplicates, 422 on self-link), actors (registry,
  search, aliases, dossier), matter role assignment (unique per
  matter/actor/role).
- **Frontend (apps/web):** real pages replace placeholders for Workspace
  Home (dashboard + counts), Matters (index w/ filters, new, detail w/
  linked-matters and actor-roles panels, edit), Actors (registry + create,
  dossier w/ aliases + matter roles). TanStack Query + typed API client;
  relative `/api/v1` paths proxied by Next dev server.
- **Nav:** added global "Actors" entry (dossier needs an entry point; noted
  in DECISIONS).
- **CI:** python job now runs on a postgres:16 service and applies
  `alembic upgrade head` against a fresh DB before pytest.

### Schema decisions recorded (see DECISIONS.md)
- `users.email` uses `String(320)` + functional unique index `lower(email)`
  instead of CITEXT, and pgcrypto was dropped (client-side UUIDs) — both
  CITEXT and pgcrypto require contrib modules missing from some Postgres
  distributions. pgvector extension deliberately deferred (stock
  postgres:16 lacks it; embedding decision pending).

### Builder verification (sandbox, real Postgres via pgserver)
- [x] `alembic upgrade 0001` → autogen 0002 → `upgrade head` →
      `downgrade base` → re-upgrade: all clean
- [x] `pytest` — 8 passed (identity/bootstrap, matter CRUD, two-direction
      links, actor registry + roles)
- [x] `ruff` clean; web ESLint + tsc clean; `next build` 15 routes
- [x] Live E2E on real DB: bootstrap → 2 matters → overlay link → actor →
      role → dossier (curl); web proxies `/api/v1` and renders all new pages

### What needs local testing
1. `git pull origin arena/01a08429-casevault && bash scripts/setup_local.sh`
2. `make infra-up`, then `cd apps/api && ../../.venv/bin/alembic upgrade head`
3. `make api` + `make web` — walk: create matter, mark one as `proceeding`,
   link it as `overlays`, register actor, assign role on matter page, check
   dossier at /actors
4. `make test` (needs infra up) and `make lint`

### Blockers / risks
- None known. Docker-based `alembic upgrade head` is the one step the
  sandbox could not run with the production compose path specifically.

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
3. `make api` → `curl http://localhost:8100/health` and `:8100/api/v1/health`
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
      :3000 → api :8100 returns ok
- [ ] docker / `make infra-up` / real postgres+redis connectivity (not
      available in sandbox — first local test)

### Blockers / risks
- Docker not available in the build sandbox, so `infra-up` and
  DB-connectivity were NOT verified here — first thing to test locally.
- See `handoff/KNOWN_ISSUES.md` and open decisions in `handoff/DECISIONS.md`.

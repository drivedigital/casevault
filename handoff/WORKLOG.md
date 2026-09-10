# Worklog

Per-turn implementation summary. Newest entries at the top.
Fields: Date / Branch / What changed / Why / Files affected / What needs local testing / Blockers & feedback needed.

---

## 2026-09-09 — Local verification round: fixes from the macOS run + CI flake repair

**Branch:** `arena/01a08429-casevault`

### What changed
- **Actor search now matches aliases** (`actor_service.list_actors`):
  matches display_name, normalized_name, OR any `ActorAlias.alias_text`
  (EXISTS subquery). Regression test added — search `q=dg` for the alias
  "DG" of actor "Dana Grove", which does not substring-match any name.
  Previously the "alias search" test only exercised the display name
  (found by the local agent's code read, 2026-09-09).
- **`make test-db` no longer hardcodes `-U casevault`.** It now uses the
  container's own `$POSTGRES_USER`/`$POSTGRES_DB`, so it works against a
  fresh compose container (default superuser `postgres`) without manually
  creating a role — the exact failure the local agent hit on a fresh clone.
- **Added the missing `make migrate` target** (documented last turn but
  never implemented — the local agent had to run alembic manually). To
  make it runnable from the repo root, `apps/api/alembic.ini` now uses
  `%(here)s`-relative `script_location`/`prepend_sys_path`; the CI-style
  invocation (`cd apps/api && alembic upgrade head`) still works.
- **CI secrets-job flake fixed** (run 34319692071 failed with no leak
  present): `gitleaks/gitleaks-action@v2` now receives `GITHUB_TOKEN`.
  Root cause: without a token its owner-type lookup runs unauthenticated;
  on rate-limited shared runner IPs it fails, flipping the action into
  license enforcement (`exit 1`) even though this owner is a personal
  account. Due diligence before concluding "no leak": ported gitleaks
  8.24.3 (the action's pinned default version) rule engine to Python and
  scanned every commit diff on the branch — zero findings. Also added
  `workflow_dispatch` so CI can be re-run manually.
- **Local-agent run reports are now archived** on orphan branch
  `arena/01a08429-casevault-logs` (redacted machine/user details), starting
  with today's Phase 0/1 verification report. See DECISIONS.md.

### Why
The user's local agent executed the full Phase 0/1 runbook on macOS
(ARM, Python 3.14, Node 26, Docker Desktop): everything green — 8/8 tests,
lint, `next build` (15 routes), all Phase 1 flows — and reported the two
defects above plus the CI failure that needed diagnosis.

### Verification
pytest 8/8 (incl. the new alias-search regression), ruff/eslint/tsc/
`next build` clean, `make migrate` verified from repo root AND from
`apps/api` against the sandbox Postgres, CI green after push.

### Local testing needed
`git pull`, then on a fresh clone: `make infra-up && make migrate &&
make test-db` should now work with zero manual SQL. macOS with Homebrew
PostgreSQL: stop it first (`brew services stop postgresql@18`) — port 5432
accepts only one listener.

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

---

## 2026-09-10 — Parallel-build coordination (Wave 0: plan + contract freeze)

**Branch:** `arena/01a0899f-casevault` · Roadmap Sprints 3–5 planning

### What changed
- `handoff/PARALLEL_PLAN.md` (new): workstream decomposition for multi-agent
  parallel work — ownership map, merge protocol, definition of done, kickoff
  prompt template, Wave 2 preview.
- `docs/contracts/sprint3_evidence.md` (new, v1.0-proposed): frozen interface
  contract for Sprint 3 (migration 0003 schema, REST endpoints, storage keys,
  worker job payloads, web routes/types) — the coordination artifact that lets
  WS-A/B/C/D build without blocking on each other.
- `scripts/agent_pg.py` (new): embedded-Postgres harness for agent sandboxes
  with no Docker (`start | env | status | psql | stop`), using the git-ignored
  `data/pgdata/` cluster; `pgserver` stays an on-demand install, not a
  requirements entry.
- `handoff/notes/README.md` (new): per-workstream note convention so parallel
  branches don't conflict on `WORKLOG.md`.

### Builder verification (sandbox, embedded Postgres 16)
- [x] `python scripts/agent_pg.py start` → `casevault` + `casevault_test` created
- [x] `alembic upgrade head` on a fresh DB → 0001 + 0002 applied
- [x] `pytest` — 8 passed; `ruff check apps workers scripts tests` — clean
- [x] `npm ci` (workspaces) — clean install
- [x] Baseline confirmed against the contract's assumptions: `/evidence` has no
      page yet (nav links to it — logged in KNOWN_ISSUES); pgvector deferred;
      workers importable without redis.

### Needs confirmation before Wave 1 starts
1. Agent topology (separate Arena sessions vs. local agents vs. sequential).
2. Whether this session coordinates only, or also implements WS-A.
3. First parallel wave: Sprint 3 (roadmap order) vs. tester-first modules.


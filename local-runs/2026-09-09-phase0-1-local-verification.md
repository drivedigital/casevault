# Local verification run — Phase 0 + Phase 1 (2026-09-09)

Machine: macOS (Darwin 24.6.0 arm64) · Python 3.14.7 (venv) · Node
v26.8.1 / npm 11.8.0 · Docker Desktop 29.7.2 · repo at
`/Users/<redacted>/Documents/GitHub/casevault`, branch
`arena/01a08429-casevault` @ `a58b033`.

## Result: PASS (all checklist items)

1. API health: PASS (`{"status": "ok", "service": "casevault-api", "version": "0.1.0"}`)
2. API v1 health: PASS (`{"status": "ok"}`)
3. Web shell & proxy: PASS (`http://localhost:3000` renders dashboard, proxies `/api/v1`)
4. All routes: PASS (`npm run build --workspace=web` generates all 15 routes cleanly)
5. Env validation: PASS (`make check-env` reports OK; `git check-ignore data/uploads .env.local` confirms both ignored)
6. Ping job: PASS (`make ping-job` prints `{"job": "ping", "status": "ok"}`)
7. Migrations: PASS (0001 foundation + 0002 actors applied)
8. Test suite: PASS (`make test` → 8 passed in 0.65s)
9. Linters: PASS (`make lint` → ruff clean, next lint clean)
10. Phase 1 flows: PASS (workspace bootstrap, matter CRUD, overlay link
    bidirectional visibility, actor dossier + aliases, matter role
    assignment, archive timestamp)

Services at time of report: API `:8100`, web `:3000`,
`casevault-postgres` (:5432, healthy), `casevault-redis` (:6379, healthy).

## Setup notes from the run

- Stopped local Homebrew `postgresql@18` so `casevault-postgres` could
  bind :5432.
- Recreated `.env.local` from `.env.example` (API port 8100).

## Issues found (both fixed on the working branch in 631b85a)

1. **`make test-db` hardcoded `-U casevault`** — failed on a fresh compose
   container (default superuser is `postgres`). Local workaround was a
   manual `CREATE ROLE casevault`. Fixed: the target now uses the
   container's own `$POSTGRES_USER`.
2. **Actor search did not match aliases** —
   `apps/api/app/services/actor_service.py:list_actors` filtered only
   `display_name` / `normalized_name`, never `ActorAlias.alias_text` (the
   pre-existing test only exercised display-name matches). Fixed with an
   EXISTS subquery + regression test.
3. **`make migrate` did not exist** (documented but unimplemented) — the
   run had to invoke alembic manually from `apps/api`. Fixed: target added;
   `alembic.ini` made cwd-independent via `%(here)s`.

## Verbatim paste-ready report (as sent, redacted)

```text
OS / Python / Node / Docker versions:
  - macOS (Darwin 24.6.0 arm64)
  - Python 3.14.7 (venv)
  - Node v26.8.1 / npm 11.8.0
  - Docker Desktop 29.7.2 (build a7dcaa6)

Checklist results (Phase 0 & Phase 1):
  1. API health: PASS ({"status": "ok", "service": "casevault-api", "version": "0.1.0"})
  2. API v1 health: PASS ({"status": "ok"})
  3. Web shell & proxy: PASS (http://localhost:3000 renders dashboard, proxies /api/v1)
  4. All routes: PASS (npm run build --workspace=web generates all 15 routes cleanly)
  5. Env validation: PASS (make check-env reports OK, git-ignore confirms data/uploads and .env.local)
  6. Ping job: PASS (make ping-job prints {"job": "ping", "status": "ok"})
  7. Migrations: PASS (0001 foundation + 0002 actors applied)
  8. Test suite: PASS (make test -> 8 passed in 0.65s)
  9. Linters: PASS (make lint -> ruff clean, next lint clean)
  10. Phase 1 flows: PASS (workspace bootstrap, matter CRUD, overlay link bidirectional visibility, actor dossier + aliases, matter role assignment, archive timestamp)

Unexpected behavior / notes:
  - make test-db: hardcoded `-U casevault` failed on fresh compose container where POSTGRES_USER=postgres. Created `casevault` role to unblock.
  - actor search: actor_service.py list_actors filters by display_name and normalized_name, but does not join on ActorAlias.alias_text.
```

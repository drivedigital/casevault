# CaseVault

**Legal Matter Intelligence Workspace** — a New York-first, local-first web
application that connects evidence, facts, chronology, claim elements, and
relief through a **reviewed proof graph**, with collaborator review,
multi-agent analysis, and strict confidentiality defaults.

> **⚠️ Local-first evidence warning.** This app is designed to hold real,
> legally sensitive evidence on your machine. Everything under `data/`
> (uploads, OCR output, exports, logs, diagnostics, backups) is **git-ignored
> and must never be committed**. API keys live in `.env.local` only. The
> default AI-sharing policy is `no_ai` — no case material leaves this machine
> unless you explicitly opt in per matter. See `data/README.md`.

**Status: Phase 1.** Workspace bootstrap (local identity mode), matter
CRUD with overlay proceeding links, actor registry with aliases/dossiers,
and matter role assignment are live on real Postgres-backed pages. Evidence,
chronology, claims, and the other analytical modules remain planned
placeholders — see `handoff/BACKLOG.md` and the spec stack in `docs/specs/`.

Database migrations run with Alembic: after `make infra-up`,
`cd apps/api && ../../.venv/bin/python -m alembic upgrade head`.

## Stack

| Layer    | Technology |
|----------|------------|
| Web      | Next.js 14, TypeScript, Tailwind, TanStack Query/Table, React Hook Form, Zod |
| API      | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Workers  | Python + RQ (redis) — OCR, extraction, embeddings, agents, connectors |
| Database | PostgreSQL 16 (pgvector in later sprints) |
| Storage  | Local filesystem under `data/` (S3-compatible abstraction later) |

## Prerequisites

- Python 3.11+
- Node 18.17+ and npm 9+
- Docker + Docker Compose (for Postgres and Redis)

## Setup

```bash
bash scripts/setup_local.sh      # Linux/macOS (idempotent)
# or: powershell -ExecutionPolicy Bypass -File scripts/setup_local.ps1
```

This creates the venv, installs dependencies, creates the git-ignored `data/`
directories, and copies `.env.example` → `.env.local` if missing.
**Review `.env.local` before continuing.**

## Run

```bash
make infra-up        # postgres :5432 + redis :6379 (localhost-only)
make migrate         # apply Alembic migrations
make api             # FastAPI on :8100
make web             # Next.js on :3000
make worker          # RQ worker (needs redis) — or `make ping-job` without redis
```

Verify:

```bash
curl http://localhost:8100/health            # {"status":"ok",...}
curl http://localhost:8100/api/v1/health     # {"status":"ok",...}
make check-env                               # validates .env.local
make test-db                                # create casevault_test once (needs make infra-up)
make test && make lint                       # smoke tests + linters
```

Single-node setup works: `make web` + `make api` + `make ping-job` prove the
scaffold even before Docker is running.

## Workflow (remote agent ⇄ local tester)

Branches: `main` (stable) · `feature/<topic>` (development) ·
`feature/<topic>-logs` (locally-generated diagnostics).

- The remote agent ends every turn by updating `handoff/WORKLOG.md`,
  `BACKLOG.md`, `TESTING.md`, committing, pushing, and listing what to test.
- The local tester runs the app with real evidence and reports results.
- To send diagnostics, run `python scripts/collect_logs.py --note "..."`;
  with `--push` it creates the `<feature>-logs` branch (secrets redacted,
  warnings if a file looks like evidence text). Details: `handoff/TESTING.md`.
- Backups: `make backup` (Postgres dump + `data/` archive into
  `data/backups/`). Backups contain real evidence — handle accordingly.

## Repository layout

`apps/web` (Next.js) · `apps/api` (FastAPI + Alembic) · `workers/` (RQ jobs:
pipeline, ai, connectors) · `packages/` (ui/types/prompts/schemas/config
placeholders) · `scripts/` (setup, diagnostics, backup, handoff) · `handoff/`
(worklog, backlog, testing, issues, decisions) · `docs/specs/` (planning
stack) · `tests/` · `infra/` · `data/` (**local only, git-ignored**)

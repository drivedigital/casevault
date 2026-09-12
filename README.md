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
> unless you explicitly opt in per matter. See `handoff/RECOVERY.md`.

**Status: integrated evidence + intake core; evidence UI acceptance pending.**
Workspace/matters/actors, evidence upload/viewer/linking, ledger CRUD/CSV and
proposal review/trusted-facts UI are implemented. PDF/image OCR remains a stub;
chronology, claims and advanced intelligence are future work.

**Start here:** [current status and tasks](handoff/STATUS.md),
[agent policy](handoff/AGENT_POLICY.md), [recovery runbook](handoff/RECOVERY.md),
[verification workflows](handoff/VERIFICATION_WORKFLOWS.md).
**EU-M/local integration testing is on hold** until a renewed exact checkpoint,
checklist and go-ahead. Setup below describes the product, not a testing release.

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
make process-jobs    # process queued evidence ingests directly (no redis)
```

Verify:

```bash
curl http://localhost:8100/health            # {"status":"ok",...}
curl http://localhost:8100/api/v1/health     # {"status":"ok",...}
make check-env                               # validates .env.local
make test-db                                # create casevault_test once (needs make infra-up)
# Tests require explicit, verified disposable targets; see handoff/TESTING.md.
make lint                                   # linters only
```

Single-node setup works: `make web` + `make api` + `make ping-job` prove the
scaffold even before Docker is running.

## Workflow (remote agent ⇄ local tester)

- PRs target `arena/01a0899f-casevault`; `main` is not a release target for this wave.
- Arena agents work/push only their own assigned branch and authorized write set.
  Integrator reviews/merges; no self-merge. Closed sessions export notes; new
  sessions use their own branches, never take over retired ones.
- Current tasks/holds live in `handoff/STATUS.md`. Historical notes are not fresh
  assignments or proof of current acceptance.
- Use synthetic fixtures and isolated DB/storage/queues. No real-case tests or
  backup/restore operations without explicit owner authorization.
- Review/redact diagnostic reports before approved transfer. Do not use the
  collector's automatic `--push`/branch-creation path; never commit `data/`.
- **Backup warning:** the integrated script still exposes full database URLs
  and can report completion without a dump. Do not rely on `make backup` as
  validated recovery or send its output to shared logs. Proposed local-ops
  hardening is unmerged. See `handoff/RECOVERY.md`.

## Repository layout

`apps/web` (Next.js) · `apps/api` (FastAPI + Alembic) · `workers/` (RQ jobs:
pipeline, ai, connectors) · `packages/` (ui/types/prompts/schemas/config
placeholders) · `scripts/` (setup, diagnostics, backup, handoff) · `handoff/`
(worklog, backlog, testing, issues, decisions) · `docs/specs/` (planning
stack) · `tests/` · `infra/` · `data/` (**local only, git-ignored**)

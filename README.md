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

**Status: Live Edge Deployment & Proof Graph Active**
The workspace is fully deployed to **Cloudflare Pages** at [casevault-web.pages.dev](https://casevault-web.pages.dev/) with an edge gateway on **Cloudflare Workers** at [casevault-worker.dan-2eb.workers.dev/api/v1](https://casevault-worker.dan-2eb.workers.dev/api/v1).

The system currently manages the **510W42 Legal Matter Workspace** populated with 404 real discovery documents across three interconnected proceedings:
1. **230 CPS** — 2F Bedroom C lockout (RPAPL 768, RPAPL 853, Chattel Conversion).
2. **510 W 42** — Hotel operations & property (Civil Rights Law § 51, Conversion, Quantum Meruit).
3. **Part 19** — Supreme Court MHL Article 81 Guardianship (Index No. 153243/2026, Andre K. Cizmarik as property guardian for Ian Reisner).

### Core Capabilities Operational:
- **Legal Claims Matrix & Burden Evaluator (`/claims`, `/claims/[id]`)**: Element-by-element burden health (`proven`, `partially_supported`, `unsupported`), fact-element linking with polarities (`support`, `adverse`, `context`), and conflict warnings.
- **Chronology Timeline (`/chronology`)**: Multi-precision dating (`exact`, `range`, `approximate`, `unknown`), significance tagging, fact-evidence backlinks, and strict review floors.
- **Evidence Review & Ingestion Queue (`/evidence`, `/evidence/[id]`)**: 404 exhibits, SHA-256 deduplication, native inline PDF/image rendering, OCR text transcription, and review triage.
- **AI Proposal Review Inbox (`/ai-review`)**: Triage candidate facts with strict human-in-the-loop review state gates (`proposed` $\to$ `accepted`).
- **Actors & Witness Network (`/actors`)**: Normalized entities, aliases, and matter role affiliations.
- **Cryptographic Audit Ledger (`/ledger`)**: Immutable transaction log tracking all state mutations and evidentiary links.

## Stack

| Layer | Local Development | Cloud Edge Production |
|---|---|---|
| **Web Frontend** | Next.js 14, React 18, Tailwind, TanStack Query/Table, Zod | Cloudflare Pages (`casevault-web.pages.dev`) |
| **API Gateway** | FastAPI, Uvicorn, SQLAlchemy 2, Pydantic v2 | Cloudflare Worker (`casevault-worker.dan-2eb.workers.dev`) |
| **Data Store** | PostgreSQL 16 (with Alembic migrations) | Cloudflare KV (`CASEVAULT_KV`) persistent edge store |
| **Task Queue** | Python + RQ (Redis 7) — OCR & Ingest pipelines | Cloudflare Worker async routes + future E2B sandboxes |
| **Binary Exhibits**| Local filesystem (`./data/`) | Supabase Storage + Cloudflare KV byte serving |

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

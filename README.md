# CaseVault — Legal Matter Intelligence Workspace

New York-first, local-first workspace that turns raw evidence into a **reviewed proof
graph**: evidence sources → accepted facts → chronology → claim elements → relief.
AI assists; it never silently alters the trusted factual record.

> ⚠️ **Local-first evidence warning.** `data/` (uploads, OCR, exports, logs, DB files)
> holds sensitive client evidence. It is git-ignored and **must never be committed**.
> The `.gitignore` in this repo enforces that by default; double-check before sharing bundles.

## Stack

- **apps/web** — Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · TanStack Query
- **apps/api** — FastAPI · SQLAlchemy 2 · Pydantic v2 · Alembic
- **Infra** — Docker Compose (postgres + redis) is optional; the API falls back to a
  local SQLite file so the app runs with zero infra.

## Prerequisites

- Node 20+ · Python 3.11+ · (optional) Docker

## Setup

```bash
cp .env.example .env.local          # adjust if needed; defaults work out of the box
npm install                         # web workspace
python3 -m venv .venv
.venv/bin/pip install -r apps/api/requirements.txt
```

## Run

```bash
# 1. API (creates ./data/dev.sqlite automatically)
cd apps/api && ../../.venv/bin/uvicorn app.main:app --port 8000

# 2. Demo data (one-time) — a small NY matter whose claims cover every burden state
cd apps/api && ../../.venv/bin/python -m app.seed_dev

# 3. Web (proxies /api/v1/* to the API — see next.config.mjs)
npm run dev --workspace=web         # or: npm run build --workspace=web && npm run start --workspace=web

# Optional infra: docker compose up -d  (then set DATABASE_URL in .env.local)
```

Open http://localhost:3000/claims for the **Legal Claims Matrix** (WS-CLAIMS).

## Tests

```bash
.venv/bin/pytest tests/api          # API suite incl. WS-CLAIMS (no DB infra needed)
npm run build --workspace=web       # frontend type-check + production build
```

## Module status

| Module | State |
|---|---|
| **Claims matrix & burden of proof** (`/claims`) | **Live** (Wave 3, WS-CLAIMS) |
| Matters, Evidence, Chronology, Relief, Research, Drafting, AI Review, Tasks | Route placeholders per Phase 0; land with their own waves |

Bootstrap note: this checkout received only Wave 3 (WS-CLAIMS); a minimal Phase-0
scaffold (config loader, health routes, base models, matters read-stub, alembic
bootstrap) was created so the claims workstream is runnable. See
`handoff/notes/WS-CLAIMS.md` for the integration contract for Wave 1/2.

## Handoff workflow

`handoff/` is versioned and updated every coding turn:
`WORKLOG.md` (what/why/how-to-test) · `BACKLOG.md` · `TESTING.md` ·
`KNOWN_ISSUES.md` · `DECISIONS.md` · notes per workstream in `handoff/notes/` ·
sanitized bundles in `handoff/diagnostic_bundles/` (shared via `-logs` branches).

Branch conventions: `main` = stable · `feature/<topic>` = build · `feature/<topic>-logs` = diagnostics.

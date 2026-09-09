# Decisions Log

Short, durable records of architectural/product decisions so context
survives across turns. Newest first.

## 2026-09-08

- **Stack.** Next.js 14 + TypeScript + Tailwind (web); FastAPI + SQLAlchemy
  2 + Alembic (api); RQ + redis (workers); Postgres 16 (+pgvector later).
  Per Technical Spec §2/§5.
- **Monorepo tooling.** npm workspaces for JS (single Next app today);
  Python via per-component `requirements.txt` aggregated by root
  `requirements-dev.txt` — no root `pyproject.toml` yet, to avoid implying
  an installable root package. Revisit if a shared Python package emerges.
- **Naming.** Product is **CaseVault** (repo `drivedigital/casevault`);
  "Legal Matter Intelligence Workspace" remains the descriptive series title
  in specs. Updated during the blueprint fix-up pass.
- **AI-sharing default is `no_ai`.** External AI sharing is exclusive opt-in
  per PRD §12; schema defaults were corrected accordingly (workspace and
  matter level; fix-up pass, 2026-09-08).
- **Review-state floor is `proposed`.** Facts and events created anywhere in
  the system start unreviewed; only an explicit approval action sets
  `accepted`. (Blueprint fix-up pass, 2026-09-08.)
- **Local network exposure.** Postgres/redis bind to localhost only
  (docker-compose). Exposing any service to LAN requires a decision entry
  here first.
- **Evidence in Git.** Nothing under `data/` is committed, ever; the only
  exception is a redacted diagnostics bundle on a `feature/<topic>-logs`
  branch via `scripts/collect_logs.py --push`.

## 2026-09-08 (Phase 1)

- **Local identity mode: DECIDED.** Exactly one `User` row
  (`owner@casevault.local`, display "Local Owner") plus one default
  workspace are bootstrapped by `GET /api/v1/workspaces/current`. No login,
  no session, no password surface. Users/memberships stay in the schema so
  collaboration is additive later. Revisit when invites land.
- **CITEXT dropped; pgcrypto dropped.** `users.email` is `String(320)` with
  a functional unique index on `lower(email)` (migration 0001); row UUIDs
  are client-side `uuid4`. Both CITEXT and pgcrypto require Postgres
  contrib modules that some distributions (e.g. embedded Postgres for
  local/testing) lack; `lower()` and client-side UUIDs have identical
  practical behavior here. Overrides Schema Draft §3.1/§6.1 accordingly.
- **pgvector intentionally not enabled in 0001.** The stock `postgres:16`
  compose image lacks pgvector. When the embedding decision lands (Sprint
  3/10), expect the compose image to move to `pgvector/pgvector:pg16` and a
  migration to `CREATE EXTENSION vector`.
- **"Actors" added to the global nav.** The UX spec's nav lists no Actors
  entry, but the actor dossier (Sprint 2 deliverable) needs a reachable
  home. Placed after Matters; revisit in a UX pass.
- **Single-workspace bootstrap.** `GET /api/v1/workspaces/current` returns
  the first workspace (creating it if absent). A real workspace switcher is
  deliberately deferred — matters list without an explicit workspace_id
  always resolves through it.
- **FastAPI B008 ignore** in ruff per-file config: `Depends()`/`Query()`
  in argument defaults is the intended FastAPI idiom.

## Open decisions (deliberately deferred from the 2026-09-08 blueprint review)

- **Auth mode for local-first.** Schema ships users/memberships in Migration
  001, but no auth mechanism is specified. Candidate: "local identity" mode
  (single implicit owner, no login) until collaboration lands. DECIDE before
  Phase 1 router work.
- **Embedding storage.** `VECTOR(1536)` column on `source_pages` vs.
  dedicated embedding tables (provider-agnostic). Schema draft flags it;
  choose before Sprint 3 pipelines.
- **Rollback depth.** PRD promises rollback of mistaken proposal acceptance;
  mechanism (audit-log restore vs. fact versioning rows) is undecided.
- **Polymorphic comments/approvals FKs.** Accept orphan risk + cleanup job,
  or typed nullable FKs. Decide at Migration 008 (now 010 range).
- **Confidence vs. strength enum.** Ledger confidence currently reuses
  `strength_label_enum`; split if UI copy diverges.

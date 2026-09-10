# Decisions Log

Short, durable records of architectural/product decisions so context
survives across turns. Newest first.

## 2026-09-10 (Wave 2 planning)

- **Coordination is now governed by `handoff/AGENT_POLICY.md`.** Division of
  labor (one workstream = one session = one branch = one PR), hub-file
  ownership per wave, append-only shared files, contract change control,
  verification/handoff/communication protocols, hard rules, and an escalation
  ladder. `PARALLEL_PLAN.md` is the plan; the policy is the rulebook.
- **Review-state floor, interpreted concretely (contract §4.1).** Saving a
  proposal (`accept` / `accept_with_edits`), generating proposals, and manual
  `POST /facts` all create facts with `review_state = proposed`. Only
  `POST /facts/{id}/approve` produces `accepted` (stamping
  `approved_by_user_id` / `approved_at`). Clients can never set `review_state`,
  `approved_*`, `supersedes_fact_id`, or `created_from_proposal_id`; those
  fields are rejected (422), not ignored. `GET /facts?review_state=accepted` is
  the trusted set that chronology and claims will read.
- **Migration 0004 is reserved to workstream W2-E; 0005/0006 to Wave 3.** One
  migration per wave, one owner — the single structural rule that keeps parallel
  branches mergeable.
- **`ledger_entries.tags_json` (JSONB, default `'[]'`) is a deliberate
  extension** to the schema draft: its ledger table has no tag column, but PRD
  §10.4 requires tag filters and bulk tagging. Stored as a JSON array of short
  strings, validated in the service layer.
- **Import is partial-success by design.** A CSV row that fails validation is
  reported and skipped; the import continues, `dry_run` writes nothing, and a
  malformed header is a 422 with the expected column list. Bulk review actions
  follow the same per-id-result contract.
- **No response-shape changes during a wave.** The evidence module's
  `GET /sources` keeps its bare-array shape until the integrator schedules
  pagination (backlog); new list endpoints in Wave 2 use the
  `{items,total,limit,offset}` envelope from the start.

## 2026-09-10 (Wave 1 integration)

- **Storage adapter shape as shipped (supersedes contract §4).**
  `app/services/storage.py` provides `LocalStorage` with
  `save/read/open_path/delete`, keys under
  `uploads/{workspace_id}/{YYYY}/{MM}/{uuid}__{sanitized-filename}`, sha256 on
  save, and containment-checked resolution. Chosen over the contract's
  `app/integrations/storage/` + `StorageService` ABC because it shipped first
  and is tested; the ABC/S3 seam is a refactor to do when the S3-compatible
  adapter lands (BACKLOG), not a rewrite now. `sources.storage_path` always
  stores the relative key.
- **Duplicate evidence is kept, not rejected.** Same sha256 inside a workspace
  → the record is still created (provenance is evidence), flagged
  `evidence_review_status=duplicate` with a `duplicate_of` pointer in
  `source_metadata.metadata_json`, surfaced as `SourceOut.duplicate_of` and in
  the UI. Deleting evidence automatically is never acceptable in this product.
- **Upload guard is 100 MB, in-memory.** `max_upload_bytes` (env
  `MAX_UPLOAD_BYTES`) caps a single upload; the file is read into memory
  before the size check. Fine for local-first single-user use; streaming to a
  temp file is a BACKLOG improvement, not a blocker.
- **`users.email` index bug and its repair.** Migration 0002's original
  upgrade silently dropped `uq_users__email` (autogenerate artifact; the index
  was absent from model metadata), so real databases enforced no uniqueness on
  `lower(email)`. Fixed in three places: the index is declared on the `User`
  model, 0002's upgrade no longer drops it, and 0003 heals existing databases
  with `CREATE UNIQUE INDEX IF NOT EXISTS`. The integrator additionally
  removed 0003's `DROP INDEX` from the downgrade path — the index is part of
  the 0001 baseline, so dropping it on the way down would reintroduce the bug
  for anyone stopping at revision 0002.
  *Operator note:* the heal fails loudly if a database already contains
  case-insensitive duplicate emails; local identity mode has one user, so this
  is only a risk for hand-seeded data.
- **Contract discipline (process).** A frozen contract only coordinates
  sessions that start after it exists. Sprint 3 was built by a session already
  in flight, so the integrator aligned the contract to the shipped code
  (see the delta table in `docs/contracts/sprint3_evidence.md`) rather than
  forcing a rewrite of tested code. Wave 2 contracts get frozen **before**
  sessions are spawned, and deviation still requires the §8 change path.

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

- **API default port is 8100** (changed from 8000, 2026-09-08). The local
  test machine runs oMLX on 8000 and LiteLLM on 4000/8080; Ollama uses
  11434. Defaults in `.env.example`, `config.py`, `next.config.mjs`,
  Makefile, setup scripts, and docs updated; the value stays
  env-overridable via `APP_PORT_API`.

- **Local-agent run reports go on `arena/01a08429-casevault-logs`**
  (2026-09-09). Orphan branch, one markdown file per report under
  `local-runs/`, machine identifiers redacted (usernames, home-dir paths)
  before committing. Never merged into the working branch; it extends the
  existing `<branch>-logs` diagnostics convention to structured run
  reports so local results survive chat loss.
- **Actor search matches aliases, not just names** (2026-09-09).
  `GET /api/v1/actors?q=` hits `display_name`, `normalized_name`, and
  `ActorAlias.alias_text`. Found by local-agent code read; fixed with a
  regression test.
- **`make migrate` exists and `alembic.ini` is cwd-independent**
  (2026-09-09): `script_location`/`prepend_sys_path` use `%(here)s`, so
  migrations run from repo root (`make migrate`) or `apps/api` (CI) alike.
- **`make test-db` uses the container's own `$POSTGRES_USER`** (2026-09-09).
  Repo convention is superuser `postgres` everywhere (compose default,
  `.env.example` DATABASE_URL, CI); the target had hardcoded `-U
  casevault`, which broke fresh clones. Compose stays env-overridable.
- **CI secrets job passes `GITHUB_TOKEN` to gitleaks-action** (2026-09-09).
  Unauthenticated owner-lookup + rate-limited runner IPs → spurious
  license-enforcement failures. No leak was present (verified by a local
  port of the gitleaks 8.24.3 rule engine over every commit diff).

## Decisions added with Phase 2 / Sprint 3 (evidence ingestion, 2026-09-10)

- **VECTOR(1536) columns deferred out of Migration 0003** (acts on the open
  embedding decision): source_pages/source_excerpts ship without vector
  columns; adding pgvector later is an additive migration and keeps Phase 2
  free of an extension dependency (sandbox Postgres lacks contrib).
- **Duplicate-upload policy**: same sha256 within a workspace does NOT
  reject the upload. The duplicate is stored as its own record (evidence
  provenance: as-received copy) with `evidence_review_status=duplicate`
  and a `duplicate_of {id,title}` pointer in source_metadata. Cross-
  workspace duplicates are allowed by design.
- **Text evidence ingests inline at upload** (no worker round-trip):
  text/markdown/email/note sources get their extracted-text page written
  synchronously; only binary types (pdf/image/spreadsheet/other) enqueue
  onto the `ingest` queue — best-effort, so an upload never fails when
  redis is down (source simply stays `queued` until `make worker` /
  `make process-jobs`).
- **OCR/VLM are explicit stubs in Sprint 3**: `process_source` marks
  pdf/image sources `ocr_status=skipped` with the reason recorded in
  source_metadata; `describe_image` is a registered VLM stub. Real
  Tesseract/OCRmyPDF integration is its own backlog item.
- **Storage layout**: `data/uploads/<workspace_id>/<yyyy>/<mm>/<uuid>__
  <sanitized-filename>`; DB stores only the relative posix path; all reads
  re-resolve inside LOCAL_STORAGE_ROOT with containment checks.
- **Upload size guard**: `MAX_UPLOAD_BYTES` (default 100 MB, env-
  overridable) enforced before reading into memory → 413.
- **uq_users__email is now declared on the User model** (functional
  lower(email) unique index). It was migration-only before, which is why
  0002's autogenerate dropped it as "extra" — 0003 heals affected DBs with
  `CREATE UNIQUE INDEX IF NOT EXISTS`, and all downgrades now drop their
  enum types so downgrade→re-upgrade works on one database.

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

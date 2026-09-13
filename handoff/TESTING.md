# Testing

**Current: limited synthetic owner preview released via OWNER_PREVIEW.md.**
Mandatory isolation preflight; full acceptance/real-data and backup work remain held.
Read [STATUS.md](STATUS.md), [VERIFICATION_WORKFLOWS.md](VERIFICATION_WORKFLOWS.md)
and [RECOVERY.md](RECOVERY.md). The phase checklists below are historical reference;
old counts and Python versions are not current acceptance. Full gate and pytest
can delete data; explicitly verify disposable targets before any authorized run.
The unmerged local-ops guard is NOT protecting the integrated scripts.

## Prerequisites

- python 3.11+, node 18.17+ / npm 9+, docker + docker compose
- `bash scripts/setup_local.sh` (idempotent)

## Start the stack

```bash
make env-create   # one-time: create .env.local from .env.example (API port 8100)
make infra-up     # postgres :5432, redis :6379 (localhost-only)
make migrate      # Alembic upgrade head
make test-db      # one-time: create the casevault_test database (idempotent)
make api          # FastAPI  :8100
make web          # Next.js  :3000
make worker       # RQ worker (or: make ping-job — no redis needed)
```

## Phase 0 test checklist

- [ ] `curl http://localhost:8100/health` returns `"status": "ok"`
- [ ] `curl http://localhost:8100/api/v1/health` returns `"status": "ok"`
- [ ] http://localhost:3000 shows the CaseVault nav shell
- [ ] Historical Phase0 check only: nav routes rendered placeholders (not the current UI)
- [ ] `make ping-job` prints `{"job": "ping", "status": "ok", ...}`
- [ ] `make worker` connects to redis and lists the 7 queues
- [ ] `make test-db` once, then `make test` passes (API + worker smoke tests)
- [ ] `make check-env` reports OK; `make lint` clean
- [ ] `git check-ignore data/uploads .env.local` confirms both are ignored

## Capturing failures safely

Preserve exact command, SHA, case IDs, timings, exit and redacted output. Use only
synthetic fixtures; inspect logs/screenshots for private content. Keep raw artifacts
outside Git and checkpoint compact redacted summaries. Do NOT use collector --push
or force-add diagnostics: automatic branch creation and evidence publication violate
current workflow. See RECOVERY.md for delivery when a session closes or logs vanish.

## Phase 1 test checklist

Run after `git pull`, `scripts/setup_local.sh`, and `make infra-up`.

```bash
make migrate      # Alembic upgrade head (0001 + 0002)
```

- [ ] `curl http://localhost:8100/api/v1/workspaces/current` →
      `CaseVault Workspace`, `ai_sharing_default: no_ai`
- [ ] Home (:3000) shows the workspace dashboard with count cards
- [ ] Create a matter at /matters/new → slug auto-generated; create a second
      matter with type `proceeding`
- [ ] On the proceeding's page, add link type `overlays` → the merits
      matter; confirm it appears on BOTH matter pages (→ outgoing / ← incoming)
- [ ] Duplicate link attempt shows "already exists"; self-link is impossible
- [ ] /actors: register an actor with aliases; search finds it by an alias
      that is NOT part of the display name (e.g. initials "DG" for
      "Dana Grove")
- [ ] On a matter page assign the actor a role (`plaintiff`); assigning the
      same role twice shows a conflict message
- [ ] /actors/<id> dossier lists the matter role; removing the role on the
      matter page empties the dossier row list
- [ ] Edit matter → status `archived` → `archived_at` timestamp shows on the
      matter page header footer
- [ ] `make test` — 8 passing (requires `make infra-up`)
- [ ] `make lint` clean

## Phase 2 test checklist (evidence ingestion, 2026-09-10)

Run after `git pull && make migrate` (Migration 0003) with the stack up.

```bash
make api    # :8100
make web    # :3000
```

- [ ] `/evidence` page loads (was a dangling nav link before Sprint 3)
- [ ] Upload a .txt file with a title → appears in the list as `text`,
      review status `uploaded`, OCR `complete`, 1 page
- [ ] Open the source detail page → extracted text shows under
      "Extracted text"; "Open stored file" downloads the original bytes
- [ ] Upload the SAME file again → flagged `duplicate` with a "dup of"
      pointer in the list and a banner on the detail page
- [ ] Upload a real PDF → stays `queued`/`not_started`; run
      `make process-jobs` (no redis needed) → pipeline `complete`,
      OCR `skipped` (stub — engine integration is a later sprint)
- [ ] With redis up (`make infra-up`): upload a PDF → the RQ worker
      (`make worker`) picks it up from the `ingest` queue
- [ ] On a source: change proof classification and review status → saves;
      set both included AND excluded → conflict message (409)
- [ ] Link a source to a matter (from /evidence upload form or the matter
      page's Evidence sources card) → visible on BOTH sides; unlink works
- [ ] Filter the list by type/review status; search by title
- [ ] `git check-ignore data/uploads` still ignored; uploaded files land
      under `data/uploads/<workspace>/<yyyy>/<mm>/`
- [ ] `make test` — 17 passing
- [ ] `make lint` clean

## Agent-side strict gate

Use the reviewed disposable-target procedure and strict flags in
[VERIFICATION_WORKFLOWS.md](VERIFICATION_WORKFLOWS.md). Do not copy old unqualified
`bash scripts/verify_all.sh` commands into a configured application environment.
Tests/gate may use DATABASE_URL fallback; name alone does not establish ownership.

## macOS notes (from the 2026-09-09 local run)

- Historical port conflict on5432: inspect ownership before planning isolated
  ports. Do not stop existing Homebrew/system services to make a test run fit.
- `make test-db` uses the container's own superuser — no manual
  `CREATE ROLE` needed any more (the 2026-09-09 run had to create role
  `casevault` by hand; fixed).
- Verified green on macOS ARM: Python 3.14.7 venv, Node 26, Docker Desktop
  29.x — 8/8 tests, lint, `next build` (15 routes), all Phase 1 flows.

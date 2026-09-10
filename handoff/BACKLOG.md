# Backlog

Prioritized feature/bug/debt list. Buckets per PRD §16; sprint mapping per
the Roadmap. Update priorities every turn.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

## P0 — Foundations (Sprint 0)

- [x] local-safe `.gitignore`
- [x] env strategy + `.env.example` (secrets local-only)
- [x] handoff docs seeded
- [x] diagnostic collection script (`scripts/collect_logs.py`)
- [x] branch conventions documented (README §Workflow)
- [x] evidence-storage directory strategy (`data/`, git-ignored)
- [x] CI workflow + secret scanning (`.github/workflows/ci.yml`)
- [x] workspace backup script (`scripts/backup_workspace.py`)
- [x] Docker infra verified on the local machine (macOS run 2026-09-09 — all green)
- [x] Alembic baseline migration — landed as 0001 + 0002 in Phase 1

## P1 — Core product value (Sprints 1–6)

- [x] workspace shell (dashboard + current-workspace bootstrap, Phase 1)
- [x] matter CRUD (Migration 0001 + API + UI incl. archive)
- [x] proceeding/overlay matter model (matter_type + two-direction links)
- [x] actor registry (Migration 0002 + API + UI: search, aliases, dossier, roles)
- [ ] workspace switcher UI (multi-workspace; deferred — single workspace today)
- [ ] collaborator invitations / auth surface (deferred — local identity mode)
- [x] source upload + local storage service (Migration 003, Sprint 3)
- [~] OCR worker — pipeline + job states done; Tesseract/OCRmyPDF engine integration remains
- [x] VLM description worker (stub registered; provider wiring later)
- [x] sha256 duplicate detection (flagged `duplicate` + duplicate_of pointer)
- [x] evidence repository + source viewer pages (/evidence, /evidence/[id])
- [x] source ↔ matter linking (both directions in UI)
- [ ] source ledger UI (Migration 004 `ledger_entries`)
- [ ] proposal review inbox (Migration 004 `proposals`, `fact_assertions`)
- [ ] chronology table + event model (Migration 005)
- [ ] claim chart v1 (Migration 006)

## P2 — Intelligence (Sprints 7–14)

- [ ] proof-graph link tables + side panel
- [ ] claim template library (NY-first)
- [ ] gap detection v1 (rule-based, explainable)
- [ ] hybrid search (Postgres FTS + pgvector)
- [ ] contradiction detection
- [ ] relief matrix
- [ ] research library + authority linking
- [ ] multi-agent review (AI council)
- [ ] MCP connector framework + first adapter

## P3 — Leverage and polish (Sprints 15+)

- [ ] PDF export (chronology, claim chart)
- [ ] drafting studio + paragraph support inspector
- [ ] graph view improvements
- [ ] performance tuning
- [ ] collaboration refinement (invitations surface, per-object approvals)
- [ ] advanced filters and bulk actions

## Bugs

- (none logged yet — see KNOWN_ISSUES.md for scaffold limitations)

## Open product decisions

Tracked in `handoff/DECISIONS.md` (auth mode, embedding table design,
rollback depth, polymorphic comment FKs, confidence/strength enum split).

## Sprint 3 follow-ups (from the Wave 1 integration review, 2026-09-10)

- [x] Sprint 3 evidence ingestion integrated (`2e440d6`) — sources API, local
      storage, dedupe, `/evidence` + source viewer, pipeline stubs (17 tests)
- [ ] Independent end-to-end verification of the merged evidence flow
      (`scripts/pipeline_smoke.py` + CI job) — the shipped tests are the
      author's own; this is the WS-D role
- [ ] Pagination on `GET /sources` (currently returns a plain array; large
      matters will need limit/offset + total)
- [ ] `source_excerpts` API (table exists since 0003; Sprint 4/5 need the
      create/list endpoints) and `PUT /sources/{id}/metadata`
- [ ] Per-source `POST /sources/{id}/reprocess` (today: `make process-jobs`
      or the RQ `ingest` queue drains everything queued)
- [ ] Streaming uploads: read to `data/temp/` in chunks instead of buffering
      up to 100 MB in memory
- [ ] Storage refactor to the interface first promised in the contract
      (`integrations/storage` + ABC) when the S3-compatible adapter lands
- [ ] Filter parity on `GET /sources`: source_status, ocr_status,
      included/excluded (list currently filters q + matter + type + review
      status)

## Wave 2 — intake core (Sprints 4 + 5, in progress from 2026-09-10)

- [ ] W2-E spine: migration `0004` + models + router stubs (**critical path, unstarted**)
- [ ] W2-F ledger API (CRUD, filters, CSV import/export, bulk ops)
- [ ] W2-G intake API (proposal review, trusted facts, links, generation job)
- [ ] W2-H `/ledger` UI (+ nav entry)
- [ ] W2-I `/ai-review` inbox + accepted-facts tab
- [ ] W2-J end-to-end verification + CI intake job
- [x] W2-EV evidence follow-ups (excerpts API, per-source reprocess) — merged 2026-09-10
- [ ] W2 integration by the integrator: merge order E → F → G → J, gate after
      each merge, contract/backlog/handoff consolidation
- [ ] After W2: scheduler for `verification_task` proposals, ledger→claims
      linking, pagination for `GET /sources`

## Coordination (added 2026-09-10)

- [x] parallel-build plan + Sprint 3 interface freeze (`handoff/PARALLEL_PLAN.md`,
      `docs/contracts/sprint3_evidence.md`) — contract later aligned to the
      shipped code (see the delta table in that doc)
- [x] agent sandbox Postgres harness (`scripts/agent_pg.py`, no Docker needed)
- [x] wave gate (`scripts/verify_all.sh`) — migrations up/down/up + pytest +
      ruff + web on a fresh database
- [~] Wave 1: Sprint 3 delivered by the other session, integrated here; the
      A/B/C fan-out for it is superseded
- [ ] Wave 2 fan-out (Sprint 4 ledger `0004`, Sprint 5 proposals/facts
      `0005`) — freeze both contracts before spawning sessions

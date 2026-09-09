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
- [ ] Docker infra verified on the local machine (tester)
- [ ] Alembic baseline migration (extensions only) — fold into Phase 1

## P1 — Core product value (Sprints 1–6)

- [ ] workspace shell (app shell done at scaffold level; real data in Phase 1)
- [ ] matter CRUD (Migration 001 tables + API + UI)
- [ ] proceeding/overlay matter model
- [ ] actor registry (Migration 002)
- [ ] source upload + local storage service (Migration 003)
- [ ] OCR worker (Tesseract/OCRmyPDF path)
- [ ] VLM description worker
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

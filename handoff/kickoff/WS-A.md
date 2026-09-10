<!-- Brief + paste-ready prompt for one parallel agent session.
     Raise changes through the integrator; see handoff/kickoff/README.md. -->

# WS-A — Sprint 3 · sources core — migration 0003 + sources API

**Owner:** one agent session · **Branch:** your session branch, base = `arena/01a0899f-casevault`
**Contract:** `docs/contracts/sprint3_evidence.md` v1.0 (frozen) · **Plan:** `handoff/PARALLEL_PLAN.md`

---

## Paste this into the agent session

```
Part of the parallel Wave 1 build (see `handoff/PARALLEL_PLAN.md`). Contract: **`docs/contracts/sprint3_evidence.md` v1.0 (frozen)** — implement §2–§3 as written.

## Deliverable
Migration `0003` + sources core API.

- Models: `sources`, `source_matter_links`, `source_metadata`, `source_pages`, `source_excerpts`; enums `source_type_enum`, `source_status_enum`, `evidence_review_status_enum` in `models/enums.py`.
- Router `apps/api/app/routers/sources.py` registered in `app/main.py`, mounted at `/api/v1`, with the single-workspace `resolve_workspace_id` pattern.
- Endpoints: `POST /sources` (multipart upload: file, title, source_type, matter_ids, source_status), `GET /sources` (filters q/matter_id/source_type/source_status/evidence_review_status/ocr_status/included/excluded + limit/offset, envelope `{items,total,limit,offset}`), `GET /sources/{id}` (`SourceDetailOut`), `GET|PATCH` per contract, `GET /sources/{id}/pages`, `GET /sources/{id}/pages/{n}`, `GET /sources/{id}/file`, `PUT /sources/{id}/metadata`, `POST /sources/{id}/reprocess` (202, graceful `queued:false` without redis), `POST|GET /sources/{id}/matter-links`, `DELETE /source-matter-links/{link_id}`, `POST|GET /sources/{id}/excerpts`.
- Duplicate detection: same workspace + same sha256 → 201 with `SourceOut.duplicate_of = {id,title}`.
- Storage access only through `from app.integrations.storage import get_storage` (owned by WS-B; interface frozen in contract §4 — code against it even if the merge order puts WS-B second).
- Tests: `tests/api/test_sources.py`.

## Write set (do not edit anything else)
`apps/api/app/models/source.py`, `models/enums.py` (append source enums), `models/__init__.py`, `schemas/source.py`, `services/source_service.py`, `routers/sources.py`, `app/main.py` (router registration), `apps/api/alembic/versions/0003_*.py`, `tests/api/test_sources.py`.

## Proof required in the PR
`bash scripts/verify_all.sh --no-web` (fresh DB: upgrade head → downgrade base → upgrade head, pytest, ruff) plus the source-flow test output.

## Notes / constraints
- Migration id `0003`, `down_revision = '0002'`; one migration per wave — you own it.
- Do **not** add `embedding_vector` columns, FTS indexes, `duplicate_of_source_id`, or `DELETE /sources` (contract §2 "deferred", §3 "no delete in v1").
- `/evidence` UI is WS-C; `/evidence` currently 404s (KNOWN_ISSUES) — you only supply the API.
- Note the autogenerate hazards already documented in migrations 0001/0002: never commit a regenerated version of them, and hand-check `downgrade()` in 0003 (enum type drops, no stray index creates).
- Write `handoff/notes/WS-A.md` and open the PR against `arena/01a0899f-casevault` (not `main`).
```

---

*Read `handoff/kickoff/README.md` first — step 0 (base branch) and the
environment setup are mandatory, and the integrator merges in the order
A → B → C → D.*

<!-- Brief + paste-ready prompt for one parallel agent session.
     Raise changes through the integrator; see handoff/kickoff/README.md. -->

# WS-B — Sprint 3 · storage service + ingest/OCR worker pipeline

**Owner:** one agent session · **Branch:** your session branch, base = `arena/01a0899f-casevault`
**Contract:** `docs/contracts/sprint3_evidence.md` v1.0 (frozen) · **Plan:** `handoff/PARALLEL_PLAN.md`

---

## Paste this into the agent session

```
Part of the parallel Wave 1 build (see `handoff/PARALLEL_PLAN.md`). Contract: **`docs/contracts/sprint3_evidence.md` v1.0 (frozen)** — implement §4–§5 as written.

## Deliverable
Storage service + ingest/OCR pipeline.

- `apps/api/app/integrations/storage/base.py`: `StorageService` ABC + `StoredObject` + `StorageKeyError` exactly as in contract §4.1.
- `apps/api/app/integrations/storage/local.py`: `LocalFileStorage` (streaming writes, sha256, size, traversal guard, atomic move from `data/temp/`).
- `apps/api/app/integrations/storage/__init__.py`: `get_storage()` factory (cached, rooted at `settings.local_storage_root`).
- Key layout exactly per contract §4.2 (`uploads/{workspace_id}/{source_id}/original{ext}`, …).
- Classification map per contract §4.3; `MAX_UPLOAD_MB` setting (default 200) added to `app/config.py` + `.env.example`… *(config.py only; `.env.example` is integrator-owned — list it as a follow-up in your note instead of editing it)*.
- `workers/pipeline/source_jobs.py`: `ingest_source`, `ocr_source` per contract §5 (idempotent, own DB session, never raise, statuses/notes in `source_metadata.metadata_json`).
- `workers/pipeline/enqueue.py`: `enqueue_ingest` / `enqueue_ocr` returning `{queued, job_id, reason}` and degrading gracefully with no redis/rq installed.
- `workers/requirements-ocr.txt` (optional heavy deps; guarded imports only — `requirements-dev.txt` and CI must keep passing without them).
- Tests: `tests/workers/test_source_jobs.py` (storage round-trip, traversal guard, sha256, text-file OCR path, no-redis enqueue).

## Write set (do not edit anything else)
`apps/api/app/integrations/storage/**`, `app/config.py` (`MAX_UPLOAD_MB` only), `workers/pipeline/source_jobs.py`, `workers/pipeline/enqueue.py`, `workers/requirements-ocr.txt`, `tests/workers/test_source_jobs.py`.

## Proof required in the PR
`bash scripts/verify_all.sh --no-web` plus your storage/job test output; explicitly show the no-redis enqueue path and a `data/temp/` → final-key move.

## Notes / constraints
- WS-A owns `models/enums.py`, `main.py`, migration `0003` and the `sources` model — import from them, never edit them.
- No new mandatory dependency: OCR/PDF libs must be optional imports.
- Worker jobs run against the same `DATABASE_URL`; use `app.db.session.get_session_factory()`.
- Write `handoff/notes/WS-B.md` and open the PR against `arena/01a0899f-casevault` (not `main`).
```

---

*Read `handoff/kickoff/README.md` first — step 0 (base branch) and the
environment setup are mandatory, and the integrator merges in the order
A → B → C → D.*

# WS-B — storage service + ingest/OCR worker pipeline

Contract: `docs/contracts/sprint3_evidence.md` — header says **v1.0, superseded
2026-09-10** (as-shipped delta); implemented the frozen **§4–§5 interfaces as
written**. Session branch `arena/01a089ce-casevault`, based on the integration
tip `adcb1b8` (= `FETCH_HEAD` of `arena/01a0899f-casevault`).

## What changed

All inside the WS-B write set; zero edits elsewhere (verified with
`git status --porcelain`).

| File | Content |
|---|---|
| `apps/api/app/integrations/storage/base.py` | §4.1 trio: `StoredObject` (frozen dataclass: `key/size_bytes/sha256`), `StorageService` ABC (`save_upload/get_path/read_bytes/write_derived/delete/exists`), `StorageKeyError(ValueError)`. Plus the backend-agnostic §4 pieces: §4.2 key builders (`original_key`, `processed_key`, `ocr_page_key`, `thumbnail_key`) and §4.3 `classify_source_type` (extension map, lower-cased, unmapped → `other`). |
| `apps/api/app/integrations/storage/local.py` | `LocalFileStorage`: chunked streaming writes (1 MiB), sha256+size computed while streaming, writes staged in `<root>/temp/` then `os.replace`\\ d into the final key (atomic, same filesystem), traversal guard raising `StorageKeyError` before any I/O, mid-stream `MAX_UPLOAD_MB` abort that removes the temp file, idempotent `delete`. |
| `apps/api/app/integrations/storage/__init__.py` | `get_storage()` — `lru_cache`\\ d factory from `settings.storage_mode` + `settings.local_storage_root` (default `./data`); non-`local` modes raise with a clear "S3 lands later" message. Re-exports the §4 surface. |
| `apps/api/app/config.py` | **One line**: `max_upload_mb: int = 200` (§4.4). `max_upload_bytes` (as-shipped) untouched. |
| `workers/pipeline/source_jobs.py` | `ingest_source(source_id, workspace_id)` + `ocr_source(source_id, workspace_id)` per §5: idempotent, own session via `app.db.session.get_session_factory()` (same `DATABASE_URL` as the API), never raise, statuses/notes in `source_metadata.metadata_json` (`ingest_error` / `ocr_note` / `ocr_error`). Ingest recomputes sha256/size when missing, sets `mime_type`, `page_count` (PDF via optional `pypdf`), re-classifies only `other`. OCR: text/markdown/csv/email/note → page 1 verbatim text; PDF via optional `pypdf` (+ scanned-page fallback via `pdf2image`+`pytesseract` when binaries present); image via `pytesseract`+`tesseract`; else `ocr_status=skipped` + `ocr_note`. PDF page sidecars written to the §4.2 `ocr/{ws}/{src}/pages/{n}.json` key (best-effort). |
| `workers/pipeline/enqueue.py` | `enqueue_ingest` / `enqueue_ocr` → `{queued, job_id, reason}`; guarded `redis`/`rq` imports; 2 s connect/ping timeouts; degrades without raising when the libs are missing or redis is unreachable. Queue names from frozen `workers/queues.py`. |
| `workers/requirements-ocr.txt` | Optional heavy deps (`pypdf`, `Pillow`, `pytesseract`, `pdf2image`) + the system-binary note (`tesseract-ocr`, `poppler-utils`). Not referenced by `requirements-dev.txt`; all imports guarded. |
| `tests/workers/test_source_jobs.py` | 48 tests: §4.2 key layout, §4.3 classification map (20 cases), round-trip/sha256/size, `data/temp/`→final-key move + no temp debris, over-limit abort, traversal guard (7 bad-key shapes × all methods, nothing written outside root), `get_storage()` cached + settings-rooted, and on real Postgres: ingest complete/recompute/reclassify/idempotent/failed-not-found, OCR text path, csv-as-text path, skipped-with-note, failed-with-ocr_error, `not_found`, enqueue shape + both no-redis degrades. |

## Proof

Environment: sandbox without Docker — embedded Postgres 16 via
`bash scripts/setup_local.sh` + `.venv/bin/pip install pgserver` +
`python scripts/agent_pg.py start` (per `PARALLEL_PLAN.md` §6). Baseline gate
on `adcb1b8` was green before any change.

Wave gate (`bash scripts/verify_all.sh --no-web`), fresh `casevault_test`,
migrations `upgrade head → downgrade base → upgrade head`:

```
==> pytest (real Postgres)
65 passed, 2 warnings in 1.53s        # 17 baseline + 48 WS-B
==> ruff
All checks passed!
GATE GREEN — python, migrations, lint and web all pass.
```

Workstream tests: `.venv/bin/python -m pytest tests/workers/test_source_jobs.py -q`
→ `48 passed in 0.65s`.

PROOF 1 — no-redis enqueue (both degrade modes, from a clean interpreter):

```
=== rq AND redis not installed (blocked via sys.modules) ===
enqueue_ingest: {'queued': False, 'job_id': None, 'reason': 'redis/rq not installed (redis); job not queued — install workers/requirements.txt or run `make process-jobs`'}
enqueue_ocr:   {'queued': False, 'job_id': None, 'reason': 'redis/rq not installed (redis); job not queued — install workers/requirements.txt or run `make process-jobs`'}

=== rq installed, redis unreachable (dead endpoint) ===
enqueue_ingest: {'queued': False, 'job_id': None, 'reason': 'redis unavailable at redis://127.0.0.1:1/0: Error 111 connecting to 127.0.0.1:1. Connection refused.'}
enqueue_ocr:   {'queued': False, 'job_id': None, 'reason': 'redis unavailable at redis://127.0.0.1:1/0: Error 111 connecting to 127.0.0.1:1. Connection refused.'}
```

PROOF 2 — `data/temp/` → final-key move (synthetic bytes, spy on `os.replace`,
temp dir snapshotted mid-stream, cleaned up afterwards; `data/` stayed
git-clean):

```
root:          /home/user/casevault/data
final key:     uploads/1b941acd-9321-476e-82ff-723e3525162b/f6eac5a0-407d-4cbb-a456-cf4c976cddbf/original.txt
temp before:   empty
mid-write:     data/temp holds [PosixPath('/home/user/casevault/data/temp/upload-vkfthsym.part')]
ATOMIC MOVE:   /home/user/casevault/data/temp/upload-vkfthsym.part -> /home/user/casevault/data/uploads/1b941acd-9321-476e-82ff-723e3525162b/f6eac5a0-407d-4cbb-a456-cf4c976cddbf/original.txt
stored:        size=37 sha256=78f96a2f1efdcb8e...
sha matches:   True
read back OK:  True
temp after:    empty
cleaned up:    final key exists=False, temp empty=True
```

## Contract gaps

1. **§4.4 size-limit ownership (additive, no divergence).** §4.4 assigns the
   413 to WS-A "while streaming to storage"; the storage service is the
   component actually streaming, so `save_upload` also aborts past
   `settings.max_upload_mb` via a new `StorageLimitError(ValueError)`.
   `StorageLimitError` is additive to §4.1's trio (same `ValueError` family),
   and WS-A can keep its own check — belt and braces, no signature changes.
2. **Two upload-limit settings now coexist.** As-shipped code uses
   `MAX_UPLOAD_BYTES` (100 MB); the contract names `MAX_UPLOAD_MB` (200). This
   PR adds only `max_upload_mb` and touches neither the old setting nor
   `.env.example` (integrator-owned). **Requested from integrator:** add
   `MAX_UPLOAD_MB=200` to `.env.example`, and schedule the consolidation of
   the two limits as a contract change (I did not remove or repurpose
   `max_upload_bytes`).
3. **§5 "text/markdown/csv" interpretation.** `.csv` classifies as
   `spreadsheet` (§4.3), so `ocr_source`'s plain-text path keys off
   `source_type ∈ {text, markdown, email, note}` **or** extension
   ∈ {`.txt .log .rtf .md .markdown .eml .msg .csv`}. `email`/`note` are
   included because they are plain-text by nature (same set the as-shipped
   `process_source` treats as text). Minimum change needed: none — recorded
   here so the vocabulary is explicit.
4. **Status quo on the as-shipped side is untouched by design.**
   `routers/sources.py` + `pipeline/jobs.py` still use
   `app/services/storage.py::LocalStorage` and `process_source`; the new
   package coexists and nothing imports it yet. Wiring the reprocess endpoint
   (or `run_worker`/`run_process`) to `enqueue_ingest`/`enqueue_ocr` is
   integrator-owned follow-up work, not silently done here.

## Risks / follow-ups

- On a machine **with** redis running, `enqueue_*` will genuinely enqueue —
  that is the contract; the tests only assert the degrade paths and the result
  shape, so they stay green either way.
- Scanned-PDF rasterisation uses `dpi=150` (speed/quality trade-off) and only
  fires for pages where `pypdf` found no text.
- OCR page sidecar JSONs (§4.2 `ocr/…` keys) are best-effort: a sidecar write
  failure logs a warning and never fails the job (the `source_pages` row is
  the deliverable).
- With `pypdf` installed, a corrupt PDF fails ingest (recorded in
  `ingest_error`) rather than silently completing — intended, worth knowing.
- `get_storage()` raises for `storage_mode != "local"`; the S3 adapter slots
  in behind the same ABC (contract §4.1 / Technical Spec §8.1).

## What the next agent must know

- Import only `from app.integrations.storage import get_storage, StoredObject`
  (contract §4.1) — never instantiate `LocalFileStorage` in feature code.
- §4.2 key builders (`original_key(workspace_id, source_id, ext)`, …) live in
  the same package; use them instead of hand-building keys.
- Keys are opaque relative posix paths: files uploaded through the as-shipped
  route (`uploads/{ws}/{YYYY}/{MM}/{uuid}__name`) resolve fine through the new
  service too; only uploads that go through `save_upload` get §4.2 keys.
- `StoredObject` deliberately has no absolute path — that keeps the ABC
  S3-compatible; use `get_path(key)` only at the local serving boundary.
- Jobs short-circuit with `already_complete` only when the corresponding
  status is already `complete`; a reprocess flow that sets statuses to
  `queued` before enqueueing will re-execute, as intended.
- Tests pin `DATABASE_URL=TEST_DATABASE_URL` and a scratch
  `LOCAL_STORAGE_ROOT` at module import (mirrors `tests/api/conftest.py`);
  running the file standalone against the embedded Postgres works.

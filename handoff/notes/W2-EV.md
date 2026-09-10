# W2-EV — Evidence follow-ups
Contract: docs/contracts/wave2_intake_core.md v1.0

## What changed
- Appended `SourceExcerptCreate`, `SourceExcerptOut`, `ReprocessRequest`, and `ReprocessOut` to `apps/api/app/schemas/source.py`.
- Added workspace-scoped excerpt create/list/delete service operations to `apps/api/app/services/source_service.py`.
- Added `POST /api/v1/sources/{id}/excerpts`, `GET /api/v1/sources/{id}/excerpts`, and `DELETE /api/v1/source-excerpts/{id}`.
- Added `POST /api/v1/sources/{id}/reprocess` with default `stages=["ocr"]`; it sets requested source statuses to `queued` and returns the frozen `{queued, job_id, reason}` shape.
- Added per-stage RQ enqueue targets and OCR reprocessing entry point to `workers/pipeline/jobs.py`; Redis/RQ failures degrade to a 202 response.
- Added `tests/api/test_source_excerpts.py` for round-trip CRUD, workspace scoping, default stage behavior, and the no-Redis response.

## Proof
- `bash scripts/verify_all.sh --no-web`
  - migration upgrade → downgrade → upgrade completed
  - `21 passed, 2 warnings in 1.67s`
  - `ruff`: `All checks passed!`
  - `GATE GREEN — python, migrations, lint and web all pass.`
- `eval "$(.venv/bin/python scripts/agent_pg.py env)" && export DATABASE_URL="$TEST_DATABASE_URL" TEST_DATABASE_URL="$TEST_DATABASE_URL" && .venv/bin/pytest -q -s tests/api/test_source_excerpts.py`
  - `4 passed, 2 warnings in 0.31s`
  - queued:false reprocess response:
    ```json
    {"queued": false, "job_id": null, "reason": "ingest queue unavailable: Error 111 connecting to 127.0.0.1:6399. Connection refused.; ocr queue unavailable: Error 111 connecting to 127.0.0.1:6399. Connection refused."}
    ```

## Contract gaps
None observed. `GET /sources` and all existing response shapes remain unchanged; no pagination was added.

## Risks / follow-ups
- With no Redis/RQ available, requested statuses remain `queued` as required but no worker job is created; the response carries the enqueue reason.
- The existing `source_excerpts` table/model from Sprint 3 is reused; no migration was needed.
- `fact_source_links.excerpt_id` remains optional/`SET NULL`, so W2-G is not blocked.

## What the next agent must know
- This work is on `arena/01a089cb-casevault`; merge it into `arena/01a0899f-casevault` when green.
- The integration tip used for this session was the checked-out evidence-module tree; the remote integration ref was not separately available in this checkout.

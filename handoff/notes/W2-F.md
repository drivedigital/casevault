# WS-F — source ledger API, filters, CSV import/export, bulk ops
Contract: docs/contracts/wave2_intake_core.md v1.0

## What changed
- Added `apps/api/app/schemas/ledger.py` with create/update/output/page, bulk, link-source, and import contracts.
- Added `apps/api/app/services/ledger_service.py` with workspace-scoped CRUD, all ledger filters, partial bulk patching, duplicate handling, and source linking.
- Added `apps/api/app/services/ledger_csv.py` with RFC 4180 UTF-8/CRLF export, ISO date values, semicolon tags, header-matched import, row validation, duplicate detection, and dry-run support.
- Added `apps/api/app/routers/ledger.py` for list/create/detail/patch/delete, source linking, bulk, export, and multipart/JSON import endpoints.
- Added `tests/api/test_ledger.py` covering CRUD/filtering, workspace isolation, CSV round-trip, malformed rows, dry-run, bulk partial success, source linking, and duplicate external IDs.

## Proof
- `bash scripts/verify_all.sh --no-web`
  - Migrations `upgrade head -> downgrade base -> upgrade head`: passed for the current base.
  - Existing suite: `17 passed`; the five new ledger tests cannot run against the current base because W2-E has not landed: the app has no `ledger_entries` migration/model/router registration, so the ledger endpoints return 404.
- `PYTHONPATH=apps/api .venv/bin/pytest tests/api/test_ledger.py -q`
  - `5 failed` at the same W2-E prerequisite: routes are not registered on `app.main` and the base has no intake schema.
- `.venv/bin/ruff check apps/api/app/schemas/ledger.py apps/api/app/services/ledger_csv.py apps/api/app/services/ledger_service.py apps/api/app/routers/ledger.py tests/api/test_ledger.py`
  - `All checks passed!`
- Pure CSV round-trip harness using synthetic values:
  - RFC 4180 export emitted the frozen 16-column header, CRLF rows, ISO dates, quoted commas, and `synthetic;round-trip` tags.
  - Re-parsed row normalized to `2025-01-02 | ['synthetic', 'round-trip'] | SourceStatus.primary`.
  - Result: `CSV PURE ROUND-TRIP GREEN`.
- A temporary validation worktree combining the current integration tip with the W2-E PR branch ran the real Migration 0004 plus `pytest tests/api/test_ledger.py tests/api/test_intake_schema.py -q`: `13 passed, 2 warnings`. This worktree was not merged into the W2-F write set; it verifies the F implementation against the actual E model/migration/router contract.
- In that same W2-E + W2-F validation worktree, `bash scripts/verify_all.sh --no-web` completed with `34 passed, 2 warnings`, `ruff: All checks passed!`, and `GATE GREEN — python, migrations, lint and web all pass.`
- A smaller temporary in-process intake-model harness also exercised create, list envelope, export, duplicate import skip, and bulk partial success against embedded Postgres; all assertions passed.

Synthetic CSV sample:
```csv
external_ledger_id,date_start,date_end,date_text_raw,fact_short_name,fact_statement,claim_use_text,relief_use_text,source_path_text,source_locator_text,source_status,authentication_or_witness,confidence_level,verification_task_text,restrictions_or_notes,tags
SYN-001,2025-01-02,2025-01-03,"January 2-3, 2025",Synthetic fact,"Synthetic statement, with comma",Synthetic claim,Synthetic relief,synthetic/source.txt,p. 2,primary,Synthetic witness,high,Synthetic task,Synthetic notes,synthetic;round-trip
```

## Contract gaps
- The requested W2-F base dependency is not present on `arena/01a0899f-casevault` at this session tip (`adcb1b8`): there is no `app.models.intake`, Migration 0004, `StrengthLabel`, or registered ledger stub. Per AGENT_POLICY §4.1 and the brief's write set, this session did not modify W2-E-owned models, migration, `models/__init__.py`, `main.py`, or shared test fixtures. The integrator must merge W2-E, then rerun the ledger test file and full gate.

## Risks / follow-ups
- `updated` and `skipped` in the bulk response are UUID lists, and `errors` contains `{id, error}` records, matching the brief's per-ID partial-success requirement.
- The current branch cannot provide a green API test result until W2-E is merged and its `StrengthLabel` enum/model/table/router registration are available.

## What the next agent must know
- After W2-E lands, rebase/merge this workstream in the fixed order, run `bash scripts/verify_all.sh --no-web`, and rerun `PYTHONPATH=apps/api .venv/bin/pytest tests/api/test_ledger.py -q`.
- The ledger router is designed for W2-E's existing `resolve_workspace_id` convention and expects `app.models.intake.LedgerEntry` with the contract §2 column names.

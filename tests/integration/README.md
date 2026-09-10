# Evidence integration verification (WS-D)

`test_evidence_e2e.py` wraps **the same** `scripts/pipeline_smoke.py` flow as the
standalone command. It starts real Uvicorn HTTP servers and a private Redis,
and runs real subprocess workers against PostgreSQL. No TestClient, API
fixture overrides, ORM `create_all`, or fake storage/queues are used.

## Prerequisites and run

```bash
bash scripts/setup_local.sh
source .venv/bin/activate
# Start PostgreSQL 16 via make infra-up, or use the sandbox harness:
pip install pgserver                  # sandbox only; not a product dependency
python scripts/agent_pg.py start
eval "$(python scripts/agent_pg.py env)"
# redis-server must be installed (e.g. apt-get install redis-server / brew install redis).
# Alternatively: export REDIS_SERVER=/absolute/path/to/redis-server

python scripts/pipeline_smoke.py
EVIDENCE_REQUIRE_DEPS=1 python -m pytest -q -rA -s tests/integration/test_evidence_e2e.py
bash scripts/verify_all.sh
```

The database URL is selected from `TEST_DATABASE_URL`, then `DATABASE_URL`, then
the usual local `casevault_test` URL. A database must already exist and its role
must have `CREATE SCHEMA` permission. A failed DB connection, permission error,
migration, API request or worker assertion **fails**, never skips.

The only permissible pytest skips are a missing `redis-server` binary or
unavailable scratch storage; each includes an explicit reason. Set
`EVIDENCE_REQUIRE_DEPS=1` to turn even these into failures. The appended CI
`evidence` job installs Redis, uses `postgres:16`, and sets that flag, so it
cannot go green by skipping the end-to-end test. Optional OCR libraries are
not prerequisites for the as-shipped stub; the stub assertions always run.

## What green means

The Sprint 3 contract now **supersedes original v1.0 with its 2026-09-10
as-shipped override**. Default green verifies that override, not the original
unimplemented endpoints/OCR engines. Every observed original-v1 difference
is emitted as `GAP` with section, endpoint, expected and observed behavior.

- `python scripts/pipeline_smoke.py --strict-v1`: run both scenarios, then fail
  on *any* reported original-v1 difference (currently expected to be red).
- `python scripts/pipeline_smoke.py --require-reprocess`: require the WS-EV
  per-source endpoint. Pytest equivalent: `EVIDENCE_REQUIRE_REPROCESS=1`.
- If `/reprocess` is registered, its 202 response, real job ID/queued flag,
  status transitions, worker execution and repeated extraction are tested
  automatically in both Redis modes. A registered endpoint returning 404 is
  a failure, **not** the deferred-route fallback. The integrator should pin
  `EVIDENCE_REQUIRE_REPROCESS=1` after merging WS-EV, to catch route removal.
- If the endpoint is not yet registered, the verifier actually POSTs it in
  both modes, records its 404 as a deferred gap, and verifies the shipped
  direct/RQ repeat-processing paths. It never claims those are HTTP reprocess.

Coverage: bootstrap; distinct text/PDF/image uploads and duplicate provenance;
SQL source/metadata/page rows; independent sha256/size/storage checks; exact
UTF-8 text extraction; explicit binary OCR stub reasons; lifecycle conflict
rollback and valid transitions; matter link/unlink and duplicate link rejection;
supported filters and workspace isolation; direct/RQ processing and idempotency;
all original download bytes, content types and attachment filenames.

Fixtures are generated from tiny Python text: a valid two-page PDF with real
xref offsets, a CRC-valid RGB PNG checkerboard (not pretend OCR text), and a
UTF-8/CRLF text file. Fixture structure and strict-mode fail-closed behavior have
additional tests. There is no claim of browser-interaction coverage; the full
wave gate separately lints, typechecks and builds the integrated evidence UI.

## Isolation and artifacts

- Each run migrates a UUID-named PostgreSQL schema. `PGOPTIONS` gives **only**
  that schema to migrations, API and workers (no fallback to `public`). Only
  that generated schema is removed in `finally`; no existing schema, evidence
  row, workspace, queue or app storage is cleared. The CI job also explicitly
  applies migrations to its fresh service DB before running the test.
- Redis is private, with a Unix socket, no TCP port and no persistence. Offline
  mode uses a different nonexistent socket, so it cannot accidentally reach a
  developer's Redis. Subprocess groups have readiness/runtime timeouts and
  are terminated and reaped on success and failure.
- Standalone logs and generated fixtures remain under a fresh **git-ignored**
  `data/temp/evidence-smoke-*` directory. Pytest uses its own short scratch
  root, ignoring `LOCAL_STORAGE_ROOT` and never using the real `data/` tree
  (per the newer `handoff/AGENT_POLICY.md` §4.3).
- CI publishes **only** the console proof log and JUnit XML from ignored
  `data/diagnostics/`; it never uploads storage/fixture directories or env files.

CLI exit codes: **0** as-shipped verified, **1** assertion/setup/strict-contract
failure, **2** unavailable storage/binary prerequisite. Product defects belong
to their owning workstream; record the failing assertion in `handoff/notes/WS-D.md`
and the PR, rather than modifying product code here.

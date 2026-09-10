"""Wave 2 intake end-to-end (W2-J): pytest wrapper around scripts/intake_smoke.py.

Runs the full contract flow (generate -> review/accept -> approve -> links ->
ledger CSV round-trip -> supersede) against the real API (TestClient) and a real
Postgres. Self-contained: fixtures live in this file (the W2-J write set owns no
conftest.py).

Paths are found by repository marker (pytest.ini + scripts/intake_smoke.py), not
by counting `Path.parents`, so `pytest tests/integration/test_intake_e2e.py`
works standalone from any working directory with no PYTHONPATH.

Fail-closed policy (handoff/AGENT_POLICY.md 4.3) — a green run must mean the
intake surface was verified, never that it was missing:

  * no explicitly configured disposable target      -> FAIL (never falls back to
    the application DATABASE_URL)
  * target unusable/empty/unparseable/unreachable   -> FAIL
  * intake tables/routers missing                   -> FAIL when INTAKE_REQUIRE=1
    (CI and merged-tip verification), otherwise skip with an explicit reason
  * anything else (wrong status/state/envelope)      -> FAIL with endpoint,
    expected vs observed and the contract section

The migrated schema is verified as-is: this test never calls
`Base.metadata.create_all()`, because creating missing tables would hide a
defective migration.

Generation shape: with `INTAKE_E2E_QUEUED=1` the flow exercises the real queued
path (needs Redis + an RQ worker on 'extract'); otherwise REDIS_URL is pinned
unreachable so the deterministic inline path runs. Both shapes assert the same
contract floor from committed state.
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import warnings
from pathlib import Path


def _repo_root() -> Path:
    """Repository root by marker file, independent of this file's depth."""
    start = Path(__file__).resolve()
    for candidate in (start.parent, *start.parents):
        if (candidate / "pytest.ini").is_file() and (
            candidate / "scripts" / "intake_smoke.py"
        ).is_file():
            return candidate
    raise RuntimeError(
        "cannot locate the repository root (expected pytest.ini and "
        f"scripts/intake_smoke.py above {start})"
    )


REPO_ROOT = _repo_root()
sys.path.insert(0, str(REPO_ROOT / "scripts"))

# Scratch evidence storage BEFORE any app import (mirrors tests/api/conftest.py).
_SCRATCH_STORAGE = Path(tempfile.mkdtemp(prefix="casevault-intake-e2e-"))
os.environ["LOCAL_STORAGE_ROOT"] = str(_SCRATCH_STORAGE)

import intake_smoke
import pytest

# CI and merged-tip verification set INTAKE_REQUIRE=1: a missing intake surface
# is then a failure, not a skip.
REQUIRED = intake_smoke.require_intake()

# Proposal generation is asynchronous when Redis answers (W2-G KNOWN_ISSUES:
# `created/skipped=0` are placeholders). CI must be deterministic and has no
# worker, so the inline path is pinned unless the queued path is explicitly
# requested; the queued path is proved by `scripts/intake_smoke.py` against a
# real Redis + a real RQ worker (handoff/notes/W2-J.md, "queued generation").
_QUEUED = (os.environ.get("INTAKE_E2E_QUEUED") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_UNREACHABLE_REDIS = "redis://127.0.0.1:1/0"


@pytest.fixture(scope="module", autouse=True)
def _scratch_storage_cleanup():
    yield
    shutil.rmtree(_SCRATCH_STORAGE, ignore_errors=True)


@pytest.fixture(scope="module", autouse=True)
def _pin_generation_mode():
    """Make the generation shape deterministic for this module.

    Without this, a developer machine with Redis on the default port would take
    the queued branch and wait for an RQ worker that the test does not start.
    """
    before = os.environ.get("REDIS_URL")
    if not _QUEUED:
        os.environ["REDIS_URL"] = _UNREACHABLE_REDIS
    try:
        yield
    finally:
        if before is None:
            os.environ.pop("REDIS_URL", None)
        else:
            os.environ["REDIS_URL"] = before


@pytest.fixture(scope="module")
def e2e_target():
    """(TestClient, redacted db url) on real Postgres; fails rather than hides."""
    from sqlalchemy import create_engine
    from sqlalchemy import inspect as sa_inspect

    try:
        db_url, source, target_warning = intake_smoke.resolve_database_url(None)
    except intake_smoke.ConfigurationError as exc:
        pytest.fail(f"verification database not configured: {exc}")
    if target_warning:
        warnings.warn(target_warning, stacklevel=2)

    try:
        exchange = create_engine(db_url, pool_pre_ping=True)
        with exchange.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception as exc:  # noqa: BLE001 - a configured target must be reachable
        pytest.fail(
            f"database configured via {source} is unreachable at "
            f"{intake_smoke.redact_url(db_url)}: {intake_smoke.redact(exc)}"
        )

    present = set(sa_inspect(exchange).get_table_names())
    missing = [t for t in intake_smoke.INTAKE_TABLES if t not in present]
    if missing:
        reason = (
            f"intake tables missing ({', '.join(missing)}): migration 0004 is not "
            "applied (or W2-E is not merged on this branch)"
        )
        if REQUIRED:
            pytest.fail(f"{reason} — INTAKE_REQUIRE=1 forbids skipping")
        pytest.skip(reason)

    # Late app import: registers all models (incl. intake) and covers any drift
    # between the migrated schema and model metadata. NOTE: no create_all() —
    # the migrated schema is what must be verified.
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.db.session import get_db
    from app.main import app

    factory = sessionmaker(bind=exchange, autoflush=False, expire_on_commit=False)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app), db_url, exchange
    finally:
        app.dependency_overrides.clear()
        exchange.dispose()


def test_intake_e2e_full_flow(e2e_target):
    """upload -> generate -> accept (proposed) -> approve (accepted) -> links ->
    ledger CSV round-trip + dry_run -> supersede. See scripts/intake_smoke.py."""
    client, db_url, _exchange = e2e_target
    log = intake_smoke.FlowLog()
    fixtures: dict = {}
    cleanup_error: str | None = None
    try:
        try:
            intake_smoke.probe_intake_routers(client, log, required=REQUIRED)
            intake_smoke.run_flow(client, log, fixtures)
        except intake_smoke.DependencyAbsent as exc:
            if REQUIRED:
                pytest.fail(
                    f"intake dependency absent while verification is required "
                    f"(INTAKE_REQUIRE=1): {exc}"
                )
            pytest.skip(f"intake dependency absent: {exc}")
        except intake_smoke.ConfigurationError as exc:
            pytest.fail(f"verification configuration error: {exc}")
        except intake_smoke.SmokeFailure as exc:
            pytest.fail(
                f"DEVIATION [{exc.step}] {exc.endpoint}: expected {intake_smoke.redact(exc.expected)}, "
                f"observed {intake_smoke.redact(exc.observed)} (contract {exc.contract})"
            )
        else:
            assert fixtures["fact_id"] and fixtures["superseding_fact_id"]
            generation = fixtures.get("generation") or {}
            mode = generation.get("mode")
            print(f"\n[e2e] generation shape exercised: {mode}")
            if _QUEUED:
                assert mode == "queued", (
                    "INTAKE_E2E_QUEUED=1 asked for the real queue, but the API "
                    f"answered inline ({generation!r})"
                )
                assert any(w.get("total", 0) >= 3 for w in generation.get("waits", [])), (
                    f"queued run recorded no committed proposals: {generation!r}"
                )
            else:
                assert mode == "inline", (
                    f"expected the pinned inline path (unreachable REDIS_URL), got {mode}"
                )
    finally:
        # Always remove the synthetic rows this run created, even after a
        # deviation or a partial flow.
        cleanup_error = intake_smoke.cleanup_after_run(client, db_url, fixtures, False, log)

    if cleanup_error and REQUIRED:
        # A previously green run must not stay green when the rows it created
        # survived (integrator caveat on the integrated verifier, 2026-09-10).
        pytest.fail(f"fixture cleanup failed: {cleanup_error}")
    if cleanup_error:
        warnings.warn(
            f"synthetic rows may remain in the target database: {cleanup_error}",
            stacklevel=2,
        )

#!/usr/bin/env python
"""Wave 2 end-to-end intake verification (W2-J) — headless, real API + real Postgres.

Exercises the frozen contract `docs/contracts/wave2_intake_core.md` v1.0 as an
independent verifier (falsify, don't agree):

  0. bootstrap workspace + two matters + one actor (Phase 1 APIs)
  1. upload a synthetic text source (inline-ingested page, no worker needed)
  2. POST /proposals/generate, then re-run for idempotency (contract section 4.4).
     Both shapes are verified: inline (`queued=false`, real created/skipped) and
     queued (`queued=true` with Redis reachable — created/skipped are placeholders
     per W2-G KNOWN_ISSUES, so the proof is the proposals committed by a real RQ
     worker, waited for up to INTAKE_GENERATION_WAIT seconds)
  3. list proposals (envelope) and pick a candidate
  4. review/accept -> the new fact MUST be `proposed` (review-state floor, 4.1);
     re-reviewing the proposal MUST be 409 (4.2)
  5. forbidden-field probes (create/patch with `review_state`) MUST be 422 (4.1);
     POST /facts creates a `proposed` fact
  5b. POST /proposals/bulk-review MUST be partial-success: one already-reviewed
      id answers ok=false without rolling back the good ids, and the accept
      path MUST only ever create `proposed` facts (4.1/4.2). Bulk accept on
      matter-less generated proposals is noted, not failed — see the contract
      tension recorded in handoff/notes/W2-J.md. `created_facts` is asserted on
      read-back because 4.2 leaves the element type unspecified
  5c. forbidden acceptance paths on proposals MUST be 422: `review_state` in
      POST /proposals and PATCH /proposals/{id}, an unknown field on the review
      body, and an accept with no matter for the fact to live in (4.1/4.2, 2)
  6. POST /facts/{id}/approve -> `accepted` + `approved_at`; re-approve 409;
     the trusted set (GET /facts?review_state=accepted) contains it (4.1)
  7. source link 201, duplicate 409 (4.3)
  8. actor link 201, duplicate 409 (4.3)
  9. ledger: create two rows, export CSV, `dry_run` import (MUST write nothing),
     bad-row + malformed-header probes, real import into matter B, per-field
     round-trip equality, identical re-import -> `skipped` (3.1)
  10. supersede -> old `superseded`, new `proposed` + `supersedes_fact_id`;
      re-transitioning the old fact 409; `accepted` via /review-state 409 (4.3)
  11. cleanup: delete the ledger rows (204), remove the scratch upload dir

Usage:
    python scripts/intake_smoke.py [--database-url URL] [--require-intake]
                                   [--generation-wait SECONDS] [--keep-uploads]

Environment:
    TEST_DATABASE_URL        disposable target (required; DATABASE_URL is never
                             used as a fallback)
    INTAKE_REQUIRE=1         a missing intake surface FAILS instead of parking
    INTAKE_ALLOW_APP_DB=1    acknowledge that the target equals DATABASE_URL
    INTAKE_GENERATION_WAIT   seconds to wait for queued generation (default 90)
    REDIS_URL                queue endpoint; when reachable the run exercises the
                             real RQ path and needs a worker on 'extract'

The script runs `alembic upgrade head` first so the *migrated* schema (WS-E's
migration 0004) is what gets verified, not a create_all approximation.
Uploads land in a scratch dir under the git-ignored `data/` tree and are
removed afterwards unless --keep-uploads is given. All fixtures are synthetic
and uid-suffixed, so reruns never collide (no wiping of user data, ever).

Exit codes: 0 = green; 1 = verification failure (see DEVIATION lines);
2 = dependency absent (postgres unreachable, or the intake tables/routers
from W2-E/F/G are not merged yet).

Contract assumptions (places v1.0 is silent; recorded in handoff/notes/W2-J.md):
  A1. CSV import targets a matter via the `matter_id` query param (by analogy
      with the documented `dry_run` query/body flag, section 3.1).
  A2. Action endpoints whose status is unpinned (generate/review/approve/
      review-state/supersede/import) return 200 (201 tolerated, logged).
  A3. `accept` may carry `edits.matter_id` (section 4.2 resolves the new fact's
      matter as "proposal's, or edits.matter_id" for both accept actions).
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

APP_DB_ENV = "DATABASE_URL"
TEST_DB_ENV = "TEST_DATABASE_URL"
ALLOW_APP_DB_ENV = "INTAKE_ALLOW_APP_DB"
REQUIRE_ENV = "INTAKE_REQUIRE"
GENERATION_WAIT_ENV = "INTAKE_GENERATION_WAIT"
DEFAULT_GENERATION_WAIT = 90.0
REPO_MARKERS = ("pytest.ini", "scripts/intake_smoke.py")

# Terminal RQ job states (rq.job.Job.get_status); anything else keeps waiting.
TERMINAL_JOB_STATES = {"finished", "failed", "stopped", "canceled"}
POLL_INTERVAL = 0.5
# A just-finished job needs a beat before the count is trusted as settled.
GENERATION_STABLE_SECONDS = 1.0


def find_repo_root(start: Path) -> Path:
    """Locate the repository root by marker files, not by counting parents.

    Works for an installed checkout, a scratch worktree, or an invocation from
    any working directory (the previous `parents[N]` arithmetic depended on the
    file's depth in the tree).
    """
    for candidate in (start, *start.parents):
        if all((candidate / marker).exists() for marker in REPO_MARKERS):
            return candidate
    raise ConfigurationError(
        f"cannot locate the repository root from {start} (looked for {REPO_MARKERS})"
    )


class ConfigurationError(RuntimeError):
    """The verifier is misconfigured: fail loudly rather than skip."""


def redact(text: str) -> str:
    """Strip credentials from anything we print (URLs, driver diagnostics)."""
    return re.sub(r"(?P<scheme>[a-z][a-z0-9+.-]*://)[^\s/@]*@", r"\g<scheme>***@", str(text))


def redact_url(url: str) -> str:
    """Human-safe form of a database URL: scheme, host and database only."""
    try:
        parsed = make_url(url)
    except Exception:  # noqa: BLE001 - never echo an unparseable URL verbatim
        return redact(url)
    host = parsed.host or "local-socket"
    if parsed.password:
        return redact(
            f"{parsed.drivername}://{parsed.username or 'user'}:<redacted>@{host}/{parsed.database or ''}"
        )
    return f"{parsed.drivername}://{host}/{parsed.database or ''}"


def _enabled(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def require_intake(cli_flag: bool = False) -> bool:
    """True when a missing intake surface must fail instead of exiting absent.

    CI and merged-tip verification run with INTAKE_REQUIRE=1 (or
    --require-intake): a green run must then mean the surfaces were verified,
    never that they were missing.
    """
    return bool(cli_flag) or _enabled(REQUIRE_ENV)


def resolve_database_url(cli_url: str | None) -> tuple[str, str, str | None]:
    """Resolve the disposable verification database.

    Explicit opt-in only: `--database-url` or TEST_DATABASE_URL. The application
    DATABASE_URL is never used as a fallback — migrating and mutating it would
    risk a real case database.

    Returns (url, source, warning). The warning is set when the explicit target
    is byte-identical to DATABASE_URL: `scripts/verify_all.sh` intentionally
    exports both to the same throwaway database, so this cannot be a hard
    refusal without breaking the wave gate — but it must never be silent either.
    """
    if (cli_url or "").strip():
        url, source = cli_url.strip(), "--database-url"
    elif (os.environ.get(TEST_DB_ENV) or "").strip():
        url, source = os.environ[TEST_DB_ENV].strip(), TEST_DB_ENV
    else:
        raise ConfigurationError(
            "no disposable test database configured: pass --database-url or set "
            f"{TEST_DB_ENV}. {APP_DB_ENV} is deliberately not used as a fallback — it "
            "points at the application database."
        )
    try:
        make_url(url)
    except ArgumentError as exc:
        raise ConfigurationError(f"{source} is not a usable database URL: {exc}") from exc
    warning = None
    app_url = (os.environ.get(APP_DB_ENV) or "").strip()
    if app_url and url == app_url and not _enabled(ALLOW_APP_DB_ENV):
        warning = (
            f"{source} is identical to {APP_DB_ENV}. The verifier migrates this "
            "database and writes synthetic rows (deleted afterwards) — use a "
            f"disposable target, or set {ALLOW_APP_DB_ENV}=1 to acknowledge it "
            "(the CI job does this for its ephemeral postgres service)."
        )
    return url, source, warning


def missing_surface(detail: str, required: bool) -> Exception:
    """Missing intake tables/routers: a failure when verification is required."""
    if required:
        return SmokeFailure(
            "dependency",
            "intake surface",
            "migrated intake tables and routers present (required mode)",
            detail,
            "wave2_intake_core 1",
        )
    return DependencyAbsent(detail)


REPO_ROOT = find_repo_root(Path(__file__).resolve().parent)
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

EXIT_OK = 0
EXIT_FAIL = 1
EXIT_ABSENT = 2  # intake surface absent and not required (pre-merge park only)

API = "/api/v1"

# Contract section 3.1: CSV columns, export order (import matches by header).
CSV_COLUMNS = [
    "external_ledger_id",
    "date_start",
    "date_end",
    "date_text_raw",
    "fact_short_name",
    "fact_statement",
    "claim_use_text",
    "relief_use_text",
    "source_path_text",
    "source_locator_text",
    "source_status",
    "authentication_or_witness",
    "confidence_level",
    "verification_task_text",
    "restrictions_or_notes",
    "tags",
]

# Fields compared for CSV round-trip equality (matter B import vs matter A row).
ROUNDTRIP_FIELDS = [c for c in CSV_COLUMNS if c != "external_ledger_id"]

INTAKE_TABLES = (
    "ledger_entries",
    "proposals",
    "fact_assertions",
    "fact_source_links",
    "fact_actor_links",
)


class DependencyAbsent(Exception):
    """A genuine prerequisite is missing (postgres / unmerged workstream)."""


class SmokeFailure(AssertionError):
    """A verification step failed: endpoint, expected vs observed, contract ref."""

    def __init__(self, step: str, endpoint: str, expected: str, observed: str, contract: str):
        self.step = step
        self.endpoint = endpoint
        self.expected = expected
        self.observed = observed
        self.contract = contract
        super().__init__(
            f"[{step}] {endpoint}: expected {expected}, observed {observed} (contract {contract})"
        )


@dataclass
class FlowLog:
    lines: list[str] = field(default_factory=list)

    def step(self, text: str) -> None:
        line = f"STEP: {redact(text)}"
        self.lines.append(line)
        print(line, flush=True)

    def ok(self, text: str) -> None:
        line = f"  PASS: {redact(text)}"
        self.lines.append(line)
        print(line, flush=True)

    def note(self, text: str) -> None:
        line = f"  NOTE: {redact(text)}"
        self.lines.append(line)
        print(line, flush=True)


def check(step: str, endpoint: str, expected: str, observed: str, contract: str) -> None:
    raise SmokeFailure(step, endpoint, expected, observed, contract)


def require_status(
    step: str, endpoint: str, resp, allowed: set[int], contract: str, log: FlowLog
) -> None:
    if resp.status_code not in allowed:
        body = _short_body(resp)
        check(
            step,
            endpoint,
            f"status {sorted(allowed)}",
            f"status {resp.status_code} body={body}",
            contract,
        )
    if len(allowed) > 1:
        log.note(
            f"{endpoint} -> {resp.status_code} (contract unpinned; accepted {sorted(allowed)})"
        )


def _short_body(resp, limit: int = 500) -> str:
    try:
        text = resp.text
    except Exception:  # noqa: BLE001 - diagnostics only
        return "<unreadable body>"
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "..."


def fact_ref(value) -> tuple[str, str | None]:
    """Normalise a bulk `created_facts` element.

    Contract 4.2 does not pin the element type ("created_facts" with no element
    schema), so this accepts either a UUID string or a FactOut object and
    returns (id, review_state-or-None). The floor is asserted on the read-back
    (GET /facts/{id}), never on this shape.
    """
    if isinstance(value, str):
        return value, None
    if isinstance(value, dict) and value.get("id"):
        return str(value["id"]), value.get("review_state")
    check(
        "bulk-review",
        "POST /proposals/bulk-review",
        "created_facts elements are fact ids or FactOut objects",
        f"{value!r}"[:200],
        "4.2",
    )
    raise AssertionError("unreachable")


def require_envelope(step: str, endpoint: str, payload, contract: str) -> dict:
    if not isinstance(payload, dict) or not {"items", "total", "limit", "offset"} <= set(payload):
        check(step, endpoint, "envelope {items,total,limit,offset}", f"{payload!r}"[:300], contract)
    assert isinstance(payload, dict)  # for type narrowing after check() raises
    return payload


def generation_wait_seconds(cli_value: float | None = None) -> float:
    """How long to wait for a queued generation job before failing.

    `INTAKE_GENERATION_WAIT` (or `--generation-wait`) exists because the queued
    path is asynchronous: with Redis reachable, POST /proposals/generate answers
    `queued=true` with placeholder `created=0/skipped=0` and the real work lands
    later. 0 disables the wait (placeholder counters are then reported as an
    explicit deviation).
    """
    if cli_value is not None:
        return max(0.0, float(cli_value))
    raw = (os.environ.get(GENERATION_WAIT_ENV) or "").strip()
    if not raw:
        return DEFAULT_GENERATION_WAIT
    try:
        return max(0.0, float(raw))
    except ValueError:
        raise ConfigurationError(
            f"{GENERATION_WAIT_ENV}={raw!r} is not a number of seconds"
        ) from None


def _queued_job_status(job_id: str | None) -> str | None:
    """Best-effort RQ job status; None when rq/redis cannot answer.

    rq is a real project dependency of the worker image (workers/requirements.txt)
    but is optional in the API image, so this must import lazily and never raise.
    """
    if not job_id:
        return None
    try:
        import redis  # deferred: optional dependency
        from rq.job import Job
        from workers.pipeline.jobs import _ensure_app_importable

        _ensure_app_importable()
        conn = redis.Redis.from_url(
            os.environ.get("REDIS_URL") or "redis://localhost:6379/0",
            socket_connect_timeout=2,
        )
        job = Job.fetch(job_id, connection=conn)
        return job.get_status(refresh=True)
    except Exception:  # noqa: BLE001 - status is diagnostic, not the proof
        return None


def _queued_job_result(job_id: str | None) -> dict | None:
    """Best-effort RQ job result payload; None when rq/redis cannot answer.

    `generate_fact_proposals` never raises (it returns status="failed"), so a
    real RQ worker reports such jobs as FINISHED. Surfacing the payload turns
    "no proposals appeared" into an actionable deviation.
    """
    if not job_id:
        return None
    try:
        import redis  # deferred: optional dependency
        from rq.job import Job
        from workers.pipeline.jobs import _ensure_app_importable

        _ensure_app_importable()
        conn = redis.Redis.from_url(
            os.environ.get("REDIS_URL") or "redis://localhost:6379/0",
            socket_connect_timeout=2,
        )
        result = Job.fetch(job_id, connection=conn).result
        return result if isinstance(result, dict) else None
    except Exception:  # noqa: BLE001 - diagnostics only
        return None


def _job_failure_summary(job_ids: list[str | None]) -> str:
    parts = []
    for job_id in job_ids:
        result = _queued_job_result(job_id)
        if isinstance(result, dict) and result.get("status") not in (None, "complete"):
            reason = redact(str(result.get("reason") or ""))[:200]
            parts.append(f"{str(job_id)[:8]}: status={result.get('status')} reason={reason}")
    return "; ".join(parts)


def wait_for_generation(
    client,
    log: FlowLog,
    source_id: str,
    expected: int,
    job_ids: list[str | None],
    timeout: float,
    step: str,
) -> dict:
    """Wait for queued generation jobs to reach their terminal state.

    The proof is the committed state (proposals readable for the source), not
    the placeholder counters in the enqueue response — W2-G KNOWN_ISSUES states
    `created/skipped=0` are not final job results. Job status, when rq can be
    imported, is used only to stop as soon as the job is terminal; it is never
    the assertion.
    """
    started = time.monotonic()
    history: list[str] = []
    last_total: int | None = None
    stable_since: float | None = None
    statuses: list[str] = []
    while True:
        elapsed = time.monotonic() - started
        statuses = [s for s in (_queued_job_status(j) for j in job_ids) if s]
        r = client.get(f"{API}/proposals", params={"source_id": source_id})
        require_status(step, "GET /proposals (queued wait)", r, {200}, "4.2", log)
        total = require_envelope(step, "GET /proposals (queued wait)", r.json(), "3")["total"]
        history.append(f"t+{elapsed:.1f}s total={total} jobs={statuses or 'unreadable'}")
        if total >= expected:
            # Give a just-finished job a beat to settle, then require stability so
            # a second enqueue cannot race the assertions below.
            if last_total == total:
                if stable_since is None:
                    stable_since = elapsed
                if elapsed - stable_since >= GENERATION_STABLE_SECONDS:
                    return {
                        "waited_s": round(elapsed, 1),
                        "statuses": statuses,
                        "total": total,
                    }
            else:
                stable_since = None
        last_total = total
        jobs_done = bool(statuses) and all(s in TERMINAL_JOB_STATES for s in statuses)
        if jobs_done and "failed" in statuses:
            check(
                step,
                f"RQ job {'/'.join(job_ids[:1])} on the 'extract' queue",
                "terminal status 'finished'",
                f"statuses={statuses}; RQ reports the job failed (see the worker log)",
                "4.4",
            )
        if elapsed >= timeout or (jobs_done and total < expected):
            failures = _job_failure_summary(job_ids)
            check(
                step,
                "POST /proposals/generate (queued)",
                f"{expected} proposals visible for the source "
                f"(within {timeout:g}s, or immediately when the job is terminal)",
                f"last: {history[-1]} (jobs terminal={jobs_done}; "
                f"statuses={statuses or 'unreadable'}); "
                + (f"job result(s): {failures}; " if failures else "")
                + "a job that returned status=failed still shows as FINISHED in RQ "
                "(the job swallows its exceptions) — check the worker log; is a worker "
                "running on the 'extract' queue with apps/api importable?",
                "4.4",
            )
        time.sleep(POLL_INTERVAL)


def run_migrations(db_url: str, log: FlowLog) -> None:
    """Apply migrations so the smoke run verifies the migrated schema."""
    log.step("migrations: alembic upgrade head")
    env = dict(os.environ, DATABASE_URL=db_url, TEST_DATABASE_URL=db_url)
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "apps/api/alembic.ini", "upgrade", "head"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SmokeFailure(
            "migrations",
            "alembic upgrade head",
            "exit 0",
            f"exit {proc.returncode}: {(proc.stderr or proc.stdout)[-800:]}",
            "wave2_intake_core 2 (migration 0004)",
        )
    log.ok("schema at head")


def make_client(db_url: str, required: bool = False):
    """TestClient bound to the real Postgres at db_url. App imports are lazy so
    LOCAL_STORAGE_ROOT (set by main() before this call) takes effect.

    Fail-closed: an explicitly configured database that cannot be reached is a
    failure, never a skip. A missing intake surface is a failure when the caller
    requires it (CI / merged-tip verification) and exit-2 "absent" otherwise.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception as exc:
        raise ConfigurationError(
            f"database unreachable at {redact_url(db_url)} ({redact(exc)}). "
            "An explicitly configured verification database must be reachable: "
            "start postgres (scripts/agent_pg.py start) or fix the URL."
        ) from exc

    from sqlalchemy import inspect as sa_inspect

    present = set(sa_inspect(engine).get_table_names())
    missing = [t for t in INTAKE_TABLES if t not in present]
    if missing:
        raise missing_surface(
            f"intake tables missing ({', '.join(missing)}): migration 0004 is not "
            "applied or not merged on this branch",
            required,
        )

    from fastapi.testclient import TestClient

    from app.db.session import get_db
    from app.main import app

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def probe_intake_routers(client, log: FlowLog, required: bool = False) -> None:
    for path in ("/proposals", "/facts", "/ledger-entries"):
        resp = client.get(f"{API}{path}", params={"limit": 1})
        if resp.status_code in (404, 405):
            raise missing_surface(
                f"GET {API}{path} -> {resp.status_code}: intake routers not "
                "registered (W2-E/F/G not merged on this branch)",
                required,
            )
    log.ok("intake routers present (proposals/facts/ledger-entries)")


# Tables created by this flow, in FK-safe deletion order. The verifier deletes
# its own synthetic rows because the product exposes no delete route for
# proposals, facts, sources or actors (evidence is never deleted through the API
# by design — AGENT_POLICY 5.7).
FIXTURE_DELETES = (
    ("fact_source_links", "fact_id", "fact_ids"),
    ("fact_actor_links", "fact_id", "fact_ids"),
    ("fact_assertions", "id", "fact_ids"),
    ("proposals", "id", "proposal_ids"),
    ("ledger_entries", "id", "ledger_ids"),
    ("source_excerpts", "source_id", "source_ids"),
    ("source_pages", "source_id", "source_ids"),
    ("source_matter_links", "source_id", "source_ids"),
    ("sources", "id", "source_ids"),
    ("matter_actor_roles", "matter_id", "matter_ids"),
    ("actor_aliases", "actor_id", "actor_ids"),
    ("actors", "id", "actor_ids"),
    ("matters", "id", "matter_ids"),
)


def collect_fixtures(client, fixtures: dict) -> dict:
    """Ids created by this run, collected through the API (uid- and matter-scoped).

    Scoping keeps cleanup safe: only rows this run created (its uid appears in
    the text, or they hang off its own matters/source) are ever touched.
    """
    uid = fixtures["uid"]
    matter_ids = [m for m in (fixtures["matter_a"], fixtures["matter_b"]) if m]
    source_ids = [fixtures["source_id"]] if fixtures.get("source_id") else []
    proposal_ids: set[str] = set()
    fact_ids: set[str] = set()
    ledger_ids: set[str] = set()

    resp = client.get(f"{API}/proposals", params={"limit": 200})
    if resp.status_code == 200:
        for item in resp.json().get("items") or []:
            text = f"{item.get('title') or ''} {item.get('proposed_text') or ''}"
            if (
                uid in text
                or item.get("source_id") in source_ids
                or item.get("matter_id") in matter_ids
            ):
                proposal_ids.add(item["id"])

    for matter_id in matter_ids:
        resp = client.get(f"{API}/facts", params={"matter_id": matter_id, "limit": 200})
        if resp.status_code == 200:
            for item in resp.json().get("items") or []:
                fact_ids.add(item["id"])
        resp = client.get(f"{API}/ledger-entries", params={"matter_id": matter_id, "limit": 200})
        if resp.status_code == 200:
            for item in resp.json().get("items") or []:
                ledger_ids.add(item["id"])

    for key in ("fact_id", "direct_fact_id", "superseding_fact_id"):
        if fixtures.get(key):
            fact_ids.add(fixtures[key])

    return {
        "fact_ids": sorted(fact_ids),
        "proposal_ids": sorted(proposal_ids),
        "ledger_ids": sorted(ledger_ids),
        "source_ids": sorted(source_ids),
        "actor_ids": [fixtures["actor_id"]] if fixtures.get("actor_id") else [],
        "matter_ids": sorted(matter_ids),
    }


def cleanup_fixtures(db_url: str, ids: dict, log: FlowLog) -> None:
    """Delete the synthetic rows this run created. Id-scoped, never a truncate.

    Best effort by design: cleanup problems are reported as notes and never mask
    the verification result. The shared local user/workspace are deliberately
    left alone (they are not created by this flow).
    """
    from sqlalchemy import bindparam, create_engine, inspect, text

    total = 0
    engine = create_engine(db_url, pool_pre_ping=True)
    try:
        tables = set(inspect(engine).get_table_names())
        with engine.begin() as conn:
            for table, column, key in FIXTURE_DELETES:
                values = ids.get(key) or []
                if not values or table not in tables:
                    continue
                stmt = text(f"DELETE FROM {table} WHERE {column} IN :ids").bindparams(
                    bindparam("ids", expanding=True)
                )
                result = conn.execute(stmt, {"ids": list(values)})
                total += max(result.rowcount or 0, 0)
            # matter links can point at a fixture matter from either side
            if "matter_links" in tables and ids.get("matter_ids"):
                for column in ("from_matter_id", "to_matter_id"):
                    stmt = text(f"DELETE FROM matter_links WHERE {column} IN :ids").bindparams(
                        bindparam("ids", expanding=True)
                    )
                    result = conn.execute(stmt, {"ids": list(ids["matter_ids"])})
                    total += max(result.rowcount or 0, 0)
        log.ok(f"cleaned up {total} synthetic row(s) created by this run")
    except Exception as exc:  # noqa: BLE001 - cleanup must never mask the result
        log.note(f"fixture cleanup incomplete: {redact(exc)}")
    finally:
        engine.dispose()


# ---------------------------------------------------------------------------
# The flow. Takes any TestClient; shared by __main__ and the pytest wrapper.
# ---------------------------------------------------------------------------


def cleanup_after_run(
    client, db_url: str, fixtures: dict, keep_fixtures: bool, log: FlowLog
) -> None:
    """Remove what this run created — including after a mid-flow deviation.

    `fixtures` is filled in incrementally by run_flow specifically so a failure
    part-way still has an id-scoped cleanup path. Gating this on a successful
    return value (the earlier shape) leaked synthetic rows on every deviation.
    """
    if keep_fixtures:
        log.note("fixtures kept (--keep-fixtures)")
        return
    if client is None or not fixtures:
        return
    try:
        cleanup_fixtures(db_url, collect_fixtures(client, fixtures), log)
    except Exception as exc:  # noqa: BLE001 - cleanup never masks the result
        log.note(f"fixture cleanup skipped: {redact(exc)}")


def run_flow(
    client,
    log: FlowLog | None = None,
    fixtures: dict | None = None,
    generation_wait: float | None = None,
) -> dict:
    """Run the whole intake flow. `fixtures` is filled in as rows are created so
    a caller can clean up even when the flow fails part-way.

    Proposal generation has two contract-legal shapes (W2-G KNOWN_ISSUES):
    inline (`queued=false`, real `created/skipped`) and queued (`queued=true`,
    `created/skipped` are placeholders and the proposals land asynchronously).
    Both are verified; the queued shape is proved from committed state, never
    from the placeholder counters.
    """
    log = log or FlowLog()
    fixtures = fixtures if fixtures is not None else {}
    wait_s = generation_wait_seconds(generation_wait)
    uid = uuid.uuid4().hex[:8]
    fixtures["uid"] = uid
    log.step(f"0. bootstrap workspace + matters + actor (uid={uid})")

    resp = client.get(f"{API}/workspaces/current")
    require_status("bootstrap", "GET /workspaces/current", resp, {200}, "phase1", log)
    workspace_id = resp.json()["id"]
    fixtures["workspace_id"] = workspace_id
    log.ok(f"workspace {workspace_id}")

    def create_matter(tag: str) -> dict:
        r = client.post(f"{API}/matters", json={"name": f"W2-J smoke {tag} {uid}"})
        require_status("bootstrap", "POST /matters", r, {201}, "phase1", log)
        return r.json()

    matter_a = create_matter("A")
    matter_b = create_matter("B")
    fixtures["matter_a"] = matter_a["id"]
    fixtures["matter_b"] = matter_b["id"]
    log.ok(f"matters A={matter_a['id']} B={matter_b['id']}")

    r = client.post(
        f"{API}/actors",
        json={"display_name": f"W2-J Smoke Actor {uid}", "actor_type": "person"},
    )
    require_status("bootstrap", "POST /actors", r, {201}, "phase1", log)
    actor = r.json()
    fixtures["actor_id"] = actor["id"]
    log.ok(f"actor {actor['id']}")

    # -- 1. synthetic text source -------------------------------------------
    log.step("1. upload synthetic text source")
    paras = [
        f"Synthetic smoke paragraph {n} ({uid}): the tenant was excluded from the "
        f"second-floor bedroom on March {10 + n}, 2026, and the lock was changed "
        "without prior written notice."
        for n in range(1, 4)
    ]
    content = "\n\n".join(paras).encode()
    assert all(len(p) >= 40 for p in paras), "fixture paragraphs must clear the 40-char floor"
    r = client.post(
        f"{API}/sources",
        files={"file": (f"smoke-intake-{uid}.txt", content, "text/plain")},
        data={"title": f"W2-J smoke source {uid}"},
    )
    require_status("upload", "POST /sources", r, {201}, "sprint3_evidence 3", log)
    source = r.json()
    if source.get("source_type") != "text" or source.get("page_count") != 1:
        check(
            "upload",
            "POST /sources",
            "source_type=text page_count=1 (inline text ingest)",
            f"source_type={source.get('source_type')} page_count={source.get('page_count')}",
            "sprint3_evidence 4",
        )
    source_id = source["id"]
    fixtures["source_id"] = source_id
    pages = client.get(f"{API}/sources/{source_id}/pages")
    require_status("upload", "GET /sources/{id}/pages", pages, {200}, "sprint3_evidence 3", log)
    if len(pages.json()) != 1 or uid not in (pages.json()[0].get("ocr_text") or ""):
        check(
            "upload",
            "GET /sources/{id}/pages",
            "1 page containing the uploaded text",
            f"{pages.json()!r}"[:300],
            "sprint3_evidence 3",
        )
    log.ok(f"source {source_id} with inline page")

    # -- 2. proposal generation ----------------------------------------------
    log.step("2. POST /proposals/generate (+ idempotent re-run)")
    r = client.post(f"{API}/proposals/generate", json={"source_id": source_id, "max_proposals": 10})
    require_status("generate", "POST /proposals/generate", r, {200, 201}, "4.2", log)
    gen = r.json()
    if not isinstance(gen.get("created"), int) or not isinstance(gen.get("skipped"), int):
        check(
            "generate",
            "POST /proposals/generate",
            "{created: int, skipped: int}",
            f"{gen!r}"[:300],
            "4.2",
        )
    # Two contract-legal shapes (W2-G KNOWN_ISSUES): inline real counters, or
    # queued placeholders (created=skipped=0) whose work lands asynchronously.
    queued = gen.get("queued") is True
    job_ids: list[str | None] = [gen.get("job_id")] if queued else []
    generation: dict = {"mode": "queued" if queued else "inline", "waits": []}
    if queued:
        if wait_s <= 0:
            check(
                "generate",
                "POST /proposals/generate",
                "inline counters (queued=true needs a wait window)",
                f"queued=true job_id={gen.get('job_id')} and "
                f"{GENERATION_WAIT_ENV}=0 disables waiting",
                "4.4",
            )
        log.note(
            f"generation ENQUEUED (queued=true job_id={gen.get('job_id')}): created/skipped "
            "are placeholders, not job results (W2-G KNOWN_ISSUES) — verifying the "
            "committed proposals, not the counters"
        )
        wait = wait_for_generation(client, log, source_id, 3, job_ids, wait_s, "generate")
        generation["waits"].append(wait)
        log.ok(
            f"queued job produced 3 proposals in {wait['waited_s']}s "
            f"(statuses={wait['statuses'] or 'unreadable'})"
        )
    else:
        if gen["created"] != 3 or gen["skipped"] != 0:
            check(
                "generate",
                "POST /proposals/generate",
                "created=3 skipped=0 (3 paragraphs >= 40 chars)",
                f"created={gen['created']} skipped={gen['skipped']}",
                "4.4",
            )
        log.ok(f"generated {gen['created']} proposals (inline counters)")
    r = client.post(f"{API}/proposals/generate", json={"source_id": source_id, "max_proposals": 10})
    require_status("generate", "POST /proposals/generate (re-run)", r, {200, 201}, "4.4", log)
    gen2 = r.json()
    if gen2.get("queued") is True:
        # Idempotency of the queued shape is proved by committed state: the
        # second job must finish without adding a fourth proposal.
        job_ids.append(gen2.get("job_id"))
        wait = wait_for_generation(client, log, source_id, 3, job_ids, wait_s, "generate (re-run)")
        generation["waits"].append(wait)
        if wait["total"] != 3:
            check(
                "generate",
                "POST /proposals/generate (re-run, queued)",
                "still 3 proposals for the source (provenance_key idempotency)",
                f"total={wait['total']} after the re-run job finished",
                "4.4",
            )
        log.ok(
            f"re-run job finished with no new proposals (idempotent, "
            f"{wait['waited_s']}s, statuses={wait['statuses'] or 'unreadable'})"
        )
    else:
        if gen2.get("created") != 0 or gen2.get("skipped") != 3:
            check(
                "generate",
                "POST /proposals/generate (re-run)",
                "created=0 skipped=3 (provenance_key idempotency)",
                f"created={gen2.get('created')} skipped={gen2.get('skipped')}",
                "4.4",
            )
        log.ok("re-run created nothing (idempotent)")
    generation["job_ids"] = job_ids
    fixtures["generation"] = generation

    # -- 3. list proposals ----------------------------------------------------
    log.step("3. list proposals, pick candidate")
    r = client.get(f"{API}/proposals", params={"source_id": source_id})
    require_status("list-proposals", "GET /proposals", r, {200}, "4.2", log)
    page = require_envelope("list-proposals", "GET /proposals", r.json(), "3")
    if page["total"] < 3:
        check(
            "list-proposals",
            "GET /proposals",
            "total>=3 for the source",
            f"total={page['total']}",
            "4.2",
        )
    for item in page["items"]:
        if item.get("review_state") != "proposed" or item.get("proposal_type") != "fact":
            check(
                "list-proposals",
                "GET /proposals",
                "every generated proposal type=fact state=proposed",
                f"id={item.get('id')} type={item.get('proposal_type')} "
                f"state={item.get('review_state')}",
                "4.2",
            )
    candidate = next((i for i in page["items"] if (i.get("proposed_text") or "").strip()), None)
    if candidate is None:
        check(
            "list-proposals",
            "GET /proposals",
            "a proposal with non-empty proposed_text",
            "all proposed_text empty",
            "4.2",
        )
    assert candidate is not None
    proposal_id = candidate["id"]
    log.ok(f"candidate proposal {proposal_id}")

    # -- 4. review/accept: the floor rule -------------------------------------
    log.step("4. accept proposal -> fact MUST stay `proposed` (floor rule)")
    r = client.post(
        f"{API}/proposals/{proposal_id}/review",
        json={"action": "accept", "edits": {"matter_id": matter_a["id"]}},
    )
    require_status("review", "POST /proposals/{id}/review", r, {200, 201}, "4.2", log)
    review = r.json()
    if not isinstance(review, dict) or "proposal" not in review or "fact" not in review:
        check(
            "review", "POST /proposals/{id}/review", "{proposal, fact}", f"{review!r}"[:300], "4.2"
        )
    if (review["proposal"] or {}).get("review_state") != "accepted":
        check(
            "review",
            "POST /proposals/{id}/review",
            "proposal.review_state=accepted",
            f"proposal.review_state={(review['proposal'] or {}).get('review_state')}",
            "4.2",
        )
    fact = review.get("fact")
    if not fact:
        check("review", "POST /proposals/{id}/review", "fact created on accept", "fact=null", "4.2")
    assert fact is not None
    fact_id = fact["id"]
    if fact.get("review_state") != "proposed":
        check(
            "review",
            "POST /proposals/{id}/review",
            "fact.review_state=proposed (FLOOR RULE)",
            f"fact.review_state={fact.get('review_state')}",
            "4.1",
        )
    log.ok(f"proposal accepted; fact {fact_id} is `proposed` (floor holds)")
    r = client.get(f"{API}/facts/{fact_id}")
    require_status("review", "GET /facts/{id}", r, {200}, "4.3", log)
    fetched = r.json()
    if fetched.get("review_state") != "proposed":
        check(
            "review",
            "GET /facts/{id}",
            "review_state=proposed",
            f"review_state={fetched.get('review_state')}",
            "4.1",
        )
    if fetched.get("created_from_proposal_id") != proposal_id:
        check(
            "review",
            "GET /facts/{id}",
            f"created_from_proposal_id={proposal_id}",
            f"created_from_proposal_id={fetched.get('created_from_proposal_id')}",
            "4.2",
        )
    log.ok("fact links back to its proposal")
    r = client.post(f"{API}/proposals/{proposal_id}/review", json={"action": "accept"})
    require_status("review", "POST /proposals/{id}/review (re-review)", r, {409}, "4.2", log)
    log.ok("re-review rejected with 409")

    # -- 5. forbidden fields + direct fact ------------------------------------
    log.step("5. forbidden-field probes (422) + direct POST /facts")
    r = client.post(
        f"{API}/facts",
        json={
            "matter_id": matter_a["id"],
            "statement_text": "forbidden-field probe",
            "review_state": "accepted",
        },
    )
    require_status("floor-probe", "POST /facts + review_state", r, {422}, "4.1", log)
    log.ok("create with review_state rejected with 422")
    r = client.post(
        f"{API}/facts",
        json={
            "matter_id": matter_a["id"],
            "statement_text": f"Direct smoke fact {uid}",
            "short_label": f"smoke-direct-{uid}",
            "is_material": True,
        },
    )
    require_status("create-fact", "POST /facts", r, {201}, "4.3", log)
    direct = r.json()
    if direct.get("review_state") != "proposed":
        check(
            "create-fact",
            "POST /facts",
            "review_state=proposed (FLOOR RULE)",
            f"review_state={direct.get('review_state')}",
            "4.1",
        )
    log.ok(f"direct fact {direct['id']} is `proposed` (floor holds)")
    r = client.patch(f"{API}/facts/{direct['id']}", json={"review_state": "accepted"})
    require_status("floor-probe", "PATCH /facts/{id} + review_state", r, {422}, "4.1/4.3", log)
    log.ok("patch with review_state rejected with 422")

    # -- 5b. bulk review: partial success + the floor --------------------------
    log.step("5b. bulk review is partial-success and never approves")
    # Bulk accept can only produce facts for proposals that already carry a
    # matter (section 4.4 generation takes no matter, and the bulk body has no
    # `edits` — see the NOTE below and the gap report). So the accept path is
    # exercised on manual, matter-carrying proposals.
    manual_ids: list[str] = []
    for index in (1, 2):
        r = client.post(
            f"{API}/proposals",
            json={
                "proposal_type": "fact",
                "matter_id": matter_a["id"],
                "title": f"bulk probe {uid}-{index}",
                "proposed_text": (
                    f"Bulk-review probe {uid}-{index}: the depot log was countersigned "
                    "the same day."
                ),
            },
        )
        require_status("bulk-review", "POST /proposals (manual, with matter)", r, {201}, "4.2", log)
        manual_ids.append(r.json()["id"])

    # 2 of 2 accept: two facts, both `proposed` — the floor holds on the bulk path
    r = client.post(f"{API}/proposals/bulk-review", json={"ids": manual_ids, "action": "accept"})
    require_status("bulk-review", "POST /proposals/bulk-review (2 ids)", r, {200}, "4.2", log)
    body = r.json()
    results = {item.get("id"): item for item in (body.get("results") or [])}
    if set(results) != set(manual_ids):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (2 ids)",
            f"one result per requested id ({manual_ids})",
            f"{body!r}"[:300],
            "4.2",
        )
    for manual_id in manual_ids:
        if not (results.get(manual_id) or {}).get("ok"):
            check(
                "bulk-review",
                "POST /proposals/bulk-review (2 ids)",
                f"{manual_id} ok=true",
                f"{results.get(manual_id)!r}",
                "4.2",
            )
    created = body.get("created_facts") or []
    if len(created) != 2:
        check(
            "bulk-review",
            "POST /proposals/bulk-review (2 ids)",
            "2 created facts",
            f"created_facts={body.get('created_facts')!r}"[:300],
            "4.2",
        )
    created_refs = [fact_ref(item) for item in created]
    log.note(
        "created_facts element type: "
        + ("fact ids (strings)" if isinstance(created[0], str) else "FactOut objects")
        + " (contract 4.2 leaves this unspecified)"
    )
    for ref_id, ref_state in created_refs:
        if ref_state is not None and ref_state != "proposed":
            check(
                "bulk-review",
                "POST /proposals/bulk-review (2 ids)",
                "every created fact review_state=proposed (FLOOR RULE)",
                f"id={ref_id} review_state={ref_state}",
                "4.1",
            )
        # authoritative check at HTTP level, independent of the response shape
        r = client.get(f"{API}/facts/{ref_id}")
        require_status("bulk-review", "GET /facts/{id} (bulk-created)", r, {200}, "4.3", log)
        if r.json().get("review_state") != "proposed":
            check(
                "bulk-review",
                "GET /facts/{id} (bulk-created)",
                "review_state=proposed (FLOOR RULE)",
                f"review_state={r.json().get('review_state')}",
                "4.1",
            )
    log.ok("bulk accept on 2 proposals: 2 facts created `proposed` (floor holds)")

    # partial success: one id still reviewable, one already out of the queue.
    # The good id must go through anyway (never all-or-nothing).
    r = client.post(
        f"{API}/proposals",
        json={
            "proposal_type": "fact",
            "matter_id": matter_a["id"],
            "title": f"bulk partial {uid}",
            "proposed_text": f"Bulk partial-success probe {uid}: two entries disagree on the date.",
        },
    )
    require_status("bulk-review", "POST /proposals (manual, partial probe)", r, {201}, "4.2", log)
    partial_good = r.json()["id"]
    mixed_ids = [partial_good, manual_ids[0]]  # second was accepted above -> 409 expected
    r = client.post(f"{API}/proposals/bulk-review", json={"ids": mixed_ids, "action": "accept"})
    require_status("bulk-review", "POST /proposals/bulk-review (mixed)", r, {200}, "4.2", log)
    body = r.json()
    results = {item.get("id"): item for item in (body.get("results") or [])}
    if not (results.get(partial_good) or {}).get("ok"):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (mixed)",
            f"{partial_good} ok=true (partial success, not all-or-nothing)",
            f"{results.get(partial_good)!r}",
            "4.2",
        )
    if (results.get(manual_ids[0]) or {}).get("ok"):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (mixed)",
            f"{manual_ids[0]} ok=false (already reviewed -> 409)",
            f"{results.get(manual_ids[0])!r}",
            "4.2",
        )
    log.note(f"failed id reported per-id: {results.get(manual_ids[0])!r}")
    created = body.get("created_facts") or []
    if len(created) != 1:
        check(
            "bulk-review",
            "POST /proposals/bulk-review (mixed)",
            "exactly 1 created fact (only the good id)",
            f"created_facts={body.get('created_facts')!r}"[:300],
            "4.2",
        )
    mixed_ref, mixed_state = fact_ref(created[0])
    r = client.get(f"{API}/facts/{mixed_ref}")
    require_status("bulk-review", "GET /facts/{id} (partial accept)", r, {200}, "4.3", log)
    if r.json().get("review_state") != "proposed" or (
        mixed_state is not None and mixed_state != "proposed"
    ):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (mixed)",
            "the one created fact is review_state=proposed (FLOOR RULE)",
            f"review_state={r.json().get('review_state')}",
            "4.1",
        )
    r = client.get(f"{API}/proposals/{partial_good}")
    require_status("bulk-review", "GET /proposals/{id} (partial success)", r, {200}, "4.2", log)
    if r.json().get("review_state") != "accepted":
        check(
            "bulk-review",
            "GET /proposals/{id} (partial success)",
            "review_state=accepted despite the failing sibling",
            f"review_state={r.json().get('review_state')}",
            "4.2",
        )
    log.ok("bulk partial success: good id committed, failing id reported, no rollback")

    # reject path: same partial-success rule, and it must create no facts at all
    r = client.get(f"{API}/proposals", params={"source_id": source_id, "review_state": "proposed"})
    require_status("bulk-review", "GET /proposals?review_state=proposed", r, {200}, "4.2", log)
    generated_open = [
        item["id"]
        for item in require_envelope("bulk-review", "GET /proposals", r.json(), "4.2")["items"]
    ]
    if not generated_open:
        check(
            "bulk-review",
            "GET /proposals?review_state=proposed",
            ">=1 generated proposal still open for the reject mix",
            "none left",
            "4.2",
        )
    reject_ids = [generated_open[0], manual_ids[0]]
    r = client.post(f"{API}/proposals/bulk-review", json={"ids": reject_ids, "action": "reject"})
    require_status("bulk-review", "POST /proposals/bulk-review (reject)", r, {200}, "4.2", log)
    body = r.json()
    results = {item.get("id"): item for item in (body.get("results") or [])}
    if not (results.get(generated_open[0]) or {}).get("ok"):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (reject)",
            f"{generated_open[0]} ok=true (reject needs no matter)",
            f"{results.get(generated_open[0])!r}",
            "4.2",
        )
    if (results.get(manual_ids[0]) or {}).get("ok"):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (reject)",
            f"{manual_ids[0]} ok=false (already accepted -> 409)",
            f"{results.get(manual_ids[0])!r}",
            "4.2",
        )
    if body.get("created_facts"):
        check(
            "bulk-review",
            "POST /proposals/bulk-review (reject)",
            "created_facts empty (reject creates no facts)",
            f"{body.get('created_facts')!r}"[:300],
            "4.2",
        )
    r = client.get(f"{API}/proposals/{generated_open[0]}")
    require_status("bulk-review", "GET /proposals/{id} (bulk-rejected)", r, {200}, "4.2", log)
    if r.json().get("review_state") != "rejected":
        check(
            "bulk-review",
            "GET /proposals/{id} (bulk-rejected)",
            "review_state=rejected",
            f"review_state={r.json().get('review_state')}",
            "4.2",
        )
    log.ok("bulk reject: partial success, no facts created")

    # documented contract tension (v1.0 section 4.4 + 4.2 + 2): a generated
    # proposal has no matter, and the bulk body has no `edits`, so bulk ACCEPT
    # cannot commit it. Not a failure here — reported as a gap; the smoke only
    # pins that the failure is per-id and leaves the queue intact.
    if generated_open[1:]:
        r = client.post(
            f"{API}/proposals/bulk-review",
            json={"ids": [generated_open[1]], "action": "accept"},
        )
        require_status(
            "bulk-review", "POST /proposals/bulk-review (matter-less)", r, {200}, "4.2", log
        )
        item = ((r.json().get("results") or [{}]) or [{}])[0]
        log.note(
            "bulk accept of a matter-less generated proposal -> "
            f"ok={item.get('ok')} error={item.get('error')!r} "
            "(contract 4.4/4.2/2 tension; see handoff/notes/W2-J.md)"
        )
        r = client.get(f"{API}/proposals/{generated_open[1]}")
        require_status(
            "bulk-review", "GET /proposals/{id} (after matter-less bulk)", r, {200}, "4.2", log
        )
        if r.json().get("review_state") not in {"proposed", "deferred", "uncertain", "accepted"}:
            check(
                "bulk-review",
                "GET /proposals/{id} (after matter-less bulk)",
                "proposal still in a reviewable/expected state",
                f"review_state={r.json().get('review_state')}",
                "4.2",
            )

    # -- 5c. forbidden acceptance paths on proposals ---------------------------
    log.step("5c. forbidden acceptance paths on proposals (422, then left untouched)")
    r = client.post(
        f"{API}/proposals",
        json={
            "proposal_type": "fact",
            "matter_id": matter_a["id"],
            "proposed_text": f"forbidden-state proposal {uid}",
            "review_state": "accepted",
        },
    )
    require_status("floor-probe", "POST /proposals + review_state", r, {422}, "4.1", log)
    log.ok("proposal create with review_state rejected with 422")

    r = client.post(
        f"{API}/proposals",
        json={
            "proposal_type": "fact",
            "matter_id": matter_a["id"],
            "proposed_text": f"forbidden-field probe {uid}",
        },
    )
    require_status("floor-probe", "POST /proposals (manual)", r, {201}, "4.2", log)
    probe_id = r.json()["id"]
    if r.json().get("review_state") != "proposed":
        check(
            "floor-probe",
            "POST /proposals",
            "review_state=proposed (FLOOR RULE)",
            f"review_state={r.json().get('review_state')}",
            "4.1",
        )
    r = client.patch(f"{API}/proposals/{probe_id}", json={"review_state": "accepted"})
    require_status("floor-probe", "PATCH /proposals/{id} + review_state", r, {422}, "4.1/4.2", log)
    log.ok("proposal patch with review_state rejected with 422")

    r = client.post(
        f"{API}/proposals/{probe_id}/review",
        json={"action": "accept", "review_state": "accepted"},
    )
    require_status(
        "floor-probe", "POST /proposals/{id}/review + unknown field", r, {422}, "4.1/4.2", log
    )
    log.ok("review body with an unknown/forbidden field rejected with 422")

    r = client.get(f"{API}/proposals/{probe_id}")
    require_status("floor-probe", "GET /proposals/{id} (after probes)", r, {200}, "4.2", log)
    if r.json().get("review_state") != "proposed":
        check(
            "floor-probe",
            "GET /proposals/{id} (after probes)",
            "review_state=proposed (rejected probes changed nothing)",
            f"review_state={r.json().get('review_state')}",
            "4.2",
        )
    log.ok("rejected probes left the proposal `proposed`")

    # a fact cannot exist outside a matter (section 2), so accept must refuse
    # rather than let the database raise: 422, and the proposal stays reviewable
    r = client.post(
        f"{API}/proposals",
        json={"proposal_type": "fact", "proposed_text": f"no-matter probe {uid}"},
    )
    require_status("floor-probe", "POST /proposals (no matter)", r, {201}, "4.2", log)
    nomatter_id = r.json()["id"]
    r = client.post(f"{API}/proposals/{nomatter_id}/review", json={"action": "accept"})
    require_status(
        "floor-probe",
        "POST /proposals/{id}/review (no matter, no edits)",
        r,
        {422},
        "4.2/2",
        log,
    )
    r = client.get(f"{API}/proposals/{nomatter_id}")
    require_status("floor-probe", "GET /proposals/{id} (no matter)", r, {200}, "4.2", log)
    if r.json().get("review_state") != "proposed":
        check(
            "floor-probe",
            "GET /proposals/{id} (no matter)",
            "review_state=proposed (a failed accept consumes nothing)",
            f"review_state={r.json().get('review_state')}",
            "4.2",
        )
    log.ok("accept without a matter rejected with 422; proposal left `proposed`")

    # a fact must not be approvable through the superseded path either
    # (checked after step 10 creates a superseded fact)

    # -- 6. approve ------------------------------------------------------------
    log.step("6. approve -> `accepted` + approved_at (the only route)")
    r = client.post(f"{API}/facts/{fact_id}/approve")
    require_status("approve", "POST /facts/{id}/approve", r, {200, 201}, "4.3", log)
    approved = r.json()
    if approved.get("review_state") != "accepted" or not approved.get("approved_at"):
        check(
            "approve",
            "POST /facts/{id}/approve",
            "review_state=accepted + approved_at set",
            f"review_state={approved.get('review_state')} "
            f"approved_at={approved.get('approved_at')}",
            "4.1/4.3",
        )
    log.ok(f"fact {fact_id} accepted at {approved.get('approved_at')}")
    r = client.post(f"{API}/facts/{fact_id}/approve")
    require_status("approve", "POST /facts/{id}/approve (repeat)", r, {409}, "4.3", log)
    log.ok("repeat approve rejected with 409")
    r = client.get(f"{API}/facts", params={"review_state": "accepted"})
    require_status("approve", "GET /facts?review_state=accepted", r, {200}, "4.1", log)
    trusted = require_envelope("approve", "GET /facts?review_state=accepted", r.json(), "3")
    if fact_id not in {i.get("id") for i in trusted["items"]}:
        check(
            "approve",
            "GET /facts?review_state=accepted",
            f"trusted set contains {fact_id}",
            f"total={trusted['total']} without it",
            "4.1",
        )
    log.ok("trusted set contains the approved fact")

    # -- 7. source link ---------------------------------------------------------
    log.step("7. link source to fact (201, then 409 on duplicate)")
    r = client.post(f"{API}/facts/{fact_id}/source-links", json={"source_id": source_id})
    require_status("source-link", "POST /facts/{id}/source-links", r, {201}, "4.3", log)
    r = client.post(f"{API}/facts/{fact_id}/source-links", json={"source_id": source_id})
    require_status("source-link", "POST /facts/{id}/source-links (duplicate)", r, {409}, "4.3", log)
    r = client.get(f"{API}/facts/{fact_id}/source-links")
    require_status("source-link", "GET /facts/{id}/source-links", r, {200}, "4.3", log)
    if not isinstance(r.json(), list) or source_id not in {
        link.get("source_id") for link in r.json()
    }:
        check(
            "source-link",
            "GET /facts/{id}/source-links",
            f"list containing source {source_id}",
            f"{r.json()!r}"[:300],
            "4.3",
        )
    # section 2: the unique is (fact_id, source_id, excerpt_id, support_type)
    # NULLS NOT DISTINCT — `strength` is NOT part of the tuple and a NULL excerpt
    # is a value, not a wildcard, so the same link with a new strength is still 409.
    r = client.post(
        f"{API}/facts/{fact_id}/source-links",
        json={"source_id": source_id, "strength": "high"},
    )
    require_status(
        "source-link",
        "POST /facts/{id}/source-links (same tuple, different strength)",
        r,
        {409},
        "4.3/2",
        log,
    )
    # ...while a different support_type IS a new link (positive control)
    r = client.post(
        f"{API}/facts/{fact_id}/source-links",
        json={"source_id": source_id, "support_type": "contradicts"},
    )
    require_status(
        "source-link",
        "POST /facts/{id}/source-links (different support_type)",
        r,
        {201},
        "4.3",
        log,
    )
    log.ok(
        "source-link unique is (fact, source, excerpt, support_type): strength ignored, "
        "NULL excerpt not a wildcard, new support_type allowed"
    )

    # -- 8. actor link -----------------------------------------------------------
    log.step("8. link actor to fact (201, then 409 on duplicate)")
    r = client.post(f"{API}/facts/{fact_id}/actor-links", json={"actor_id": actor["id"]})
    require_status("actor-link", "POST /facts/{id}/actor-links", r, {201}, "4.3", log)
    r = client.post(f"{API}/facts/{fact_id}/actor-links", json={"actor_id": actor["id"]})
    require_status("actor-link", "POST /facts/{id}/actor-links (duplicate)", r, {409}, "4.3", log)
    r = client.get(f"{API}/facts/{fact_id}/actor-links")
    require_status("actor-link", "GET /facts/{id}/actor-links", r, {200}, "4.3", log)
    if not isinstance(r.json(), list) or actor["id"] not in {
        link.get("actor_id") for link in r.json()
    }:
        check(
            "actor-link",
            "GET /facts/{id}/actor-links",
            f"list containing actor {actor['id']}",
            f"{r.json()!r}"[:300],
            "4.3",
        )
    # section 2: unique (fact_id, actor_id, role_in_fact) NULLS NOT DISTINCT —
    # a NULL role is a duplicate of a NULL role, a different role is a new link.
    r = client.post(
        f"{API}/facts/{fact_id}/actor-links",
        json={"actor_id": actor["id"], "role_in_fact": "witness"},
    )
    require_status(
        "actor-link", "POST /facts/{id}/actor-links (role=witness)", r, {201}, "4.3", log
    )
    r = client.post(
        f"{API}/facts/{fact_id}/actor-links",
        json={"actor_id": actor["id"], "role_in_fact": "witness"},
    )
    require_status(
        "actor-link",
        "POST /facts/{id}/actor-links (role=witness, duplicate)",
        r,
        {409},
        "4.3",
        log,
    )
    log.ok("actor-link unique includes role_in_fact; NULL role duplicates NULL, new role allowed")

    # -- 9. ledger CSV round-trip -------------------------------------------------
    log.step("9. ledger: create 2 rows, export, dry_run, import to matter B")
    rows = [
        {
            "matter_id": matter_a["id"],
            "external_ledger_id": f"SMOKE-{uid}-01",
            "date_start": "2026-03-11",
            "date_end": "2026-03-12",
            "date_text_raw": "mid-March 2026",
            "fact_short_name": f"smoke row one {uid}",
            "fact_statement": (
                f"On March 11 2026 ({uid}) the tenant found the second-floor "
                "bedroom lock changed without notice."
            ),
            "claim_use_text": "supports the exclusion claim",
            "relief_use_text": "restoration of access",
            "source_path_text": "Box 3, folder 7",
            "source_locator_text": "page 2, paragraph 1",
            "source_status": "primary",
            "authentication_or_witness": f"W2-J smoke witness {uid}",
            "confidence_level": "high",
            "verification_task_text": "confirm the date with the super",
            "restrictions_or_notes": "synthetic smoke row; safe to delete",
            "tags": ["smoke", "w2j"],
        },
        {
            "matter_id": matter_a["id"],
            "external_ledger_id": f"SMOKE-{uid}-02",
            "fact_short_name": f"smoke row two {uid}",
            "fact_statement": f"On March 12 2026 ({uid}) the tenant photographed the new lock.",
            "source_status": "derived",
            "confidence_level": "medium",
            "tags": ["w2j"],
        },
    ]
    created_ids: list[str] = []
    for row in rows:
        r = client.post(f"{API}/ledger-entries", json=row)
        require_status("ledger-create", "POST /ledger-entries", r, {201}, "3.1", log)
        body = r.json()
        if body.get("tags") != row.get("tags", []):
            check(
                "ledger-create",
                "POST /ledger-entries",
                f"tags={row.get('tags', [])}",
                f"tags={body.get('tags')}",
                "3.1",
            )
        created_ids.append(body["id"])
    log.ok(f"created ledger rows {created_ids}")

    r = client.get(f"{API}/ledger-entries", params={"matter_id": matter_a["id"]})
    require_status("ledger-list", "GET /ledger-entries", r, {200}, "3.1", log)
    listed_a = require_envelope("ledger-list", "GET /ledger-entries", r.json(), "3")
    if listed_a["total"] != 2:
        check(
            "ledger-list",
            "GET /ledger-entries?matter_id=A",
            "total=2",
            f"total={listed_a['total']}",
            "3.1",
        )
    by_ext_a = {i["external_ledger_id"]: i for i in listed_a["items"]}

    r = client.get(f"{API}/ledger-entries/export.csv", params={"matter_id": matter_a["id"]})
    require_status("ledger-export", "GET /ledger-entries/export.csv", r, {200}, "3.1", log)
    ctype = r.headers.get("content-type", "")
    if not ctype.startswith("text/csv"):
        check(
            "ledger-export",
            "GET /ledger-entries/export.csv",
            "content-type text/csv",
            f"content-type {ctype!r}",
            "3.1",
        )
    csv_text = r.text
    reader = csv.DictReader(io.StringIO(csv_text))
    if reader.fieldnames != CSV_COLUMNS:
        check(
            "ledger-export",
            "GET /ledger-entries/export.csv",
            f"header {CSV_COLUMNS}",
            f"header {reader.fieldnames}",
            "3.1",
        )
    exported = list(reader)
    if {row["external_ledger_id"] for row in exported} != {
        f"SMOKE-{uid}-01",
        f"SMOKE-{uid}-02",
    }:
        check(
            "ledger-export",
            "GET /ledger-entries/export.csv",
            "both matter-A rows exported",
            f"{csv_text[:300]!r}",
            "3.1",
        )
    log.ok("export header order + rows match the contract")
    csv_bytes = csv_text.encode("utf-8")

    def do_import(params: dict, payload: bytes, name: str = "roundtrip.csv"):
        return client.post(
            f"{API}/ledger-entries/import",
            params=params,
            files={"file": (name, payload, "text/csv")},
        )

    r = do_import({"matter_id": matter_b["id"], "dry_run": "true"}, csv_bytes)
    require_status(
        "ledger-dry-run", "POST /ledger-entries/import?dry_run=true", r, {200, 201}, "3.1", log
    )
    dry = r.json()
    for key in ("valid", "created", "skipped", "errors"):
        if key not in dry:
            check(
                "ledger-dry-run",
                "POST /ledger-entries/import",
                "{valid, created, skipped, errors}",
                f"{dry!r}"[:300],
                "3.1",
            )
    if dry["errors"]:
        check(
            "ledger-dry-run",
            "POST /ledger-entries/import?dry_run=true",
            "errors=[]",
            f"errors={dry['errors']}",
            "3.1",
        )
    log.note(
        f"dry_run report: valid={dry['valid']} created={dry['created']} skipped={dry['skipped']}"
    )
    r = client.get(f"{API}/ledger-entries", params={"matter_id": matter_b["id"]})
    require_status("ledger-dry-run", "GET /ledger-entries?matter_id=B", r, {200}, "3.1", log)
    if r.json()["total"] != 0:
        check(
            "ledger-dry-run",
            "POST /ledger-entries/import?dry_run=true",
            "dry_run writes nothing (matter B total=0)",
            f"matter B total={r.json()['total']}",
            "3.1",
        )
    log.ok("dry_run wrote nothing")

    # bad row (blank fact_statement) must surface as a row error, still writing nothing
    bad_buf = io.StringIO()
    writer = csv.DictWriter(bad_buf, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    bad_row = {c: "" for c in CSV_COLUMNS}
    bad_row["external_ledger_id"] = f"SMOKE-{uid}-BAD"
    writer.writerow(bad_row)
    r = do_import(
        {"matter_id": matter_b["id"], "dry_run": "true"}, bad_buf.getvalue().encode(), "bad.csv"
    )
    require_status(
        "ledger-bad-row", "POST /ledger-entries/import (bad row dry_run)", r, {200, 201}, "3.1", log
    )
    bad_report = r.json()
    if not bad_report.get("errors"):
        check(
            "ledger-bad-row",
            "POST /ledger-entries/import",
            "errors non-empty for blank fact_statement",
            f"{bad_report!r}"[:300],
            "3.1",
        )
    r = client.get(f"{API}/ledger-entries", params={"matter_id": matter_b["id"]})
    if r.json()["total"] != 0:
        check(
            "ledger-bad-row",
            "POST /ledger-entries/import (bad row dry_run)",
            "bad-row dry_run writes nothing",
            f"matter B total={r.json()['total']}",
            "3.1",
        )
    log.ok(f"bad row reported: {bad_report['errors'][0]}")

    # malformed header -> 422 with the expected column list
    r = do_import({"matter_id": matter_b["id"]}, b"nonsense,columns\n1,2\n", "malformed.csv")
    require_status(
        "ledger-malformed", "POST /ledger-entries/import (malformed header)", r, {422}, "3.1", log
    )
    log.ok("malformed header rejected with 422")

    # real import into matter B (dry_run omitted: default false)
    r = do_import({"matter_id": matter_b["id"]}, csv_bytes)
    require_status("ledger-import", "POST /ledger-entries/import", r, {200, 201}, "3.1", log)
    imp = r.json()
    if imp.get("errors"):
        check(
            "ledger-import",
            "POST /ledger-entries/import",
            "errors=[]",
            f"errors={imp['errors']}",
            "3.1",
        )
    r = client.get(f"{API}/ledger-entries", params={"matter_id": matter_b["id"]})
    require_status("ledger-import", "GET /ledger-entries?matter_id=B", r, {200}, "3.1", log)
    listed_b = require_envelope("ledger-import", "GET /ledger-entries?matter_id=B", r.json(), "3")
    if listed_b["total"] != 2:
        check(
            "ledger-import",
            "POST /ledger-entries/import",
            "matter B total=2",
            f"total={listed_b['total']}",
            "3.1",
        )
    by_ext_b = {i["external_ledger_id"]: i for i in listed_b["items"]}
    for ext, row_a in by_ext_a.items():
        row_b = by_ext_b.get(ext)
        if row_b is None:
            check(
                "ledger-import",
                "POST /ledger-entries/import",
                f"row {ext} imported",
                "missing in matter B",
                "3.1",
            )
        assert row_b is not None
        for fname in ROUNDTRIP_FIELDS:
            va, vb = row_a.get(fname), row_b.get(fname)
            # CSV cannot distinguish null from empty; the contract's empty-prone
            # text columns normalise to "" or null on either side.
            if (va or "") != (vb or ""):
                check(
                    "ledger-import",
                    "POST /ledger-entries/import",
                    f"round-trip equality for {ext}.{fname}={va!r}",
                    f"matter B has {vb!r}",
                    "3.1",
                )
    imported_ids = [i["id"] for i in listed_b["items"]]
    log.ok("round-trip equality across all CSV-mapped fields")

    # identical re-import -> skipped, not errors
    r = do_import({"matter_id": matter_b["id"]}, csv_bytes)
    require_status(
        "ledger-reimport",
        "POST /ledger-entries/import (identical re-import)",
        r,
        {200, 201},
        "3.1",
        log,
    )
    reimp = r.json()
    if reimp.get("skipped") != 2 or reimp.get("created") != 0 or reimp.get("errors"):
        check(
            "ledger-reimport",
            "POST /ledger-entries/import",
            "identical rows -> skipped=2 created=0 errors=[]",
            f"skipped={reimp.get('skipped')} created={reimp.get('created')} "
            f"errors={reimp.get('errors')}",
            "3.1",
        )
    log.ok("identical re-import skipped (no dupes, no errors)")

    # -- 10. supersede ------------------------------------------------------------
    log.step("10. supersede -> old `superseded`, new `proposed`")
    r = client.post(
        f"{API}/facts/{fact_id}/supersede",
        json={
            "statement_text": f"Superseding smoke statement {uid}",
            "short_label": f"smoke-v2-{uid}",
        },
    )
    require_status("supersede", "POST /facts/{id}/supersede", r, {200, 201}, "4.3", log)
    sup = r.json()
    if not isinstance(sup, dict) or "old_fact" not in sup or "new_fact" not in sup:
        check(
            "supersede",
            "POST /facts/{id}/supersede",
            "{old_fact, new_fact}",
            f"{sup!r}"[:300],
            "4.3",
        )
    old_fact, new_fact = sup["old_fact"], sup["new_fact"]
    if (old_fact or {}).get("review_state") != "superseded":
        check(
            "supersede",
            "POST /facts/{id}/supersede",
            "old_fact.review_state=superseded",
            f"old_fact.review_state={(old_fact or {}).get('review_state')}",
            "4.3",
        )
    if (new_fact or {}).get("review_state") != "proposed":
        check(
            "supersede",
            "POST /facts/{id}/supersede",
            "new_fact.review_state=proposed (FLOOR RULE)",
            f"new_fact.review_state={(new_fact or {}).get('review_state')}",
            "4.1",
        )
    if (new_fact or {}).get("supersedes_fact_id") != fact_id:
        check(
            "supersede",
            "POST /facts/{id}/supersede",
            f"new_fact.supersedes_fact_id={fact_id}",
            f"supersedes_fact_id={(new_fact or {}).get('supersedes_fact_id')}",
            "4.3",
        )
    log.ok(f"fact {fact_id} superseded by {(new_fact or {}).get('id')}")
    r = client.get(f"{API}/facts", params={"review_state": "accepted"})
    trusted_ids = {i.get("id") for i in r.json().get("items", [])}
    if fact_id in trusted_ids:
        check(
            "supersede",
            "GET /facts?review_state=accepted",
            f"superseded fact {fact_id} leaves the trusted set",
            "still present",
            "4.1",
        )
    log.ok("superseded fact left the trusted set")
    r = client.post(f"{API}/facts/{fact_id}/review-state", json={"review_state": "deferred"})
    require_status(
        "supersede", "POST /facts/{id}/review-state (superseded fact)", r, {409}, "4.3", log
    )
    log.ok("re-transitioning a superseded fact rejected with 409")
    r = client.post(f"{API}/facts/{new_fact['id']}/review-state", json={"review_state": "accepted"})
    require_status("supersede", "POST /facts/{id}/review-state + accepted", r, {409}, "4.3", log)
    log.ok("`accepted` via /review-state rejected with 409 (approve-only floor)")

    # -- 11. cleanup ----------------------------------------------------------------
    log.step("11. cleanup ledger rows")
    for row_id in created_ids + imported_ids:
        r = client.delete(f"{API}/ledger-entries/{row_id}")
        require_status("cleanup", "DELETE /ledger-entries/{id}", r, {204}, "3.1", log)
    for matter in (matter_a, matter_b):
        r = client.get(f"{API}/ledger-entries", params={"matter_id": matter["id"]})
        if r.json()["total"] != 0:
            check(
                "cleanup",
                "DELETE /ledger-entries/{id}",
                "matter total back to 0",
                f"total={r.json()['total']}",
                "3.1",
            )
    log.ok("ledger rows deleted (204 each)")

    fixtures.update(
        {
            "proposal_id": proposal_id,
            "fact_id": fact_id,
            "direct_fact_id": direct["id"],
            "superseding_fact_id": (new_fact or {}).get("id"),
        }
    )
    return fixtures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help=f"disposable Postgres URL to verify against (or set {TEST_DB_ENV}). "
        f"{APP_DB_ENV} is never used.",
    )
    parser.add_argument(
        "--require-intake",
        action="store_true",
        help=f"a missing intake surface is a FAILURE, not exit {EXIT_ABSENT} "
        f"(also enabled by {REQUIRE_ENV}=1; CI uses it)",
    )
    parser.add_argument(
        "--generation-wait",
        type=float,
        default=None,
        metavar="SECONDS",
        help="how long a queued generation job may take before the run fails "
        f"(default {DEFAULT_GENERATION_WAIT:g}, env {GENERATION_WAIT_ENV}); 0 refuses queued mode",
    )
    parser.add_argument(
        "--keep-uploads",
        action="store_true",
        help="keep the scratch upload dir under data/ for inspection",
    )
    parser.add_argument(
        "--keep-fixtures",
        action="store_true",
        help="keep the synthetic rows this run created (debugging only)",
    )
    args = parser.parse_args(argv)
    log = FlowLog()
    required = require_intake(args.require_intake)
    print("intake smoke: Wave 2 end-to-end verification (contract wave2_intake_core v1.0)")
    print(
        f"mode: {'required (missing surfaces FAIL)' if required else f'pre-merge park (exit {EXIT_ABSENT})'}"
    )

    # Scratch storage under the git-ignored data/ tree, set BEFORE any app import.
    data_dir = REPO_ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="smoke-intake-", dir=data_dir))
    os.environ["LOCAL_STORAGE_ROOT"] = str(scratch)

    # Fail-closed configuration: no silent fallback to the application database.
    try:
        db_url, source, target_warning = resolve_database_url(args.database_url)
    except ConfigurationError as exc:
        print(f"CONFIGURATION FAILURE: {exc}")
        shutil.rmtree(scratch, ignore_errors=True)
        return EXIT_FAIL

    print(f"database: {redact_url(db_url)} (from {source})")
    if target_warning:
        print(f"WARNING: {target_warning}")
    print(f"uploads: {scratch} (removed afterwards{' (kept)' if args.keep_uploads else ''})")
    try:
        wait_s = generation_wait_seconds(args.generation_wait)
    except ConfigurationError as exc:
        print(f"CONFIGURATION FAILURE: {exc}")
        shutil.rmtree(scratch, ignore_errors=True)
        return EXIT_FAIL
    print(
        f"generation: {'inline+queued' if wait_s > 0 else 'inline only'} "
        f"(queued wait {wait_s:g}s; redis {redact_url(os.environ.get('REDIS_URL') or 'default')})"
    )

    result: dict | None = None
    fixtures: dict = {}
    client = None
    exit_code = EXIT_OK
    try:
        try:
            run_migrations(db_url, log)
        except SmokeFailure as exc:
            print(f"MIGRATION FAILURE: {redact(exc)}")
            exit_code = EXIT_FAIL
        else:
            try:
                client = make_client(db_url, required=required)
                probe_intake_routers(client, log, required=required)
                result = run_flow(client, log, fixtures, generation_wait=wait_s)
            except ConfigurationError as exc:
                print(f"CONFIGURATION FAILURE: {redact(exc)}")
                exit_code = EXIT_FAIL
            except DependencyAbsent as exc:
                print(f"DEPENDENCY ABSENT: {redact(exc)}")
                exit_code = EXIT_ABSENT
            except SmokeFailure as exc:
                print(
                    f"DEVIATION [{exc.step}] {exc.endpoint}: expected {redact(exc.expected)}, "
                    f"observed {redact(exc.observed)} (contract {exc.contract})"
                )
                exit_code = EXIT_FAIL
    finally:
        # Always remove what this run created — deviations included.
        cleanup_after_run(client, db_url, fixtures, args.keep_fixtures, log)
        if not args.keep_uploads:
            shutil.rmtree(scratch, ignore_errors=True)
        else:
            print(f"kept scratch uploads at {scratch}")

    if exit_code != EXIT_OK:
        return exit_code

    assert result is not None
    generation = result.get("generation") or {}
    print("SMOKE GREEN — all intake steps passed; deviations: none")
    print(
        f"generation mode: {generation.get('mode', 'inline')} "
        f"(jobs={generation.get('job_ids') or 'none'}; "
        f"waits={[w.get('waited_s') for w in generation.get('waits', [])] or 'n/a'})"
    )
    print(
        f"fixtures: matter_a={result['matter_a']} fact={result['fact_id']} "
        f"v2={result['superseding_fact_id']}"
    )
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())

"""W2-J negative-path regression coverage for the intake verifier itself.

These tests run without a database: they pin the *guard rails* that make a green
`test_intake_e2e.py` / `scripts/intake_smoke.py` run meaningful (integrator
findings on PR #3, 2026-09-10):

  1. repository root is found by marker, not by `Path.parents` arithmetic, so
     the standalone pytest command works with no PYTHONPATH;
  2. an explicitly configured but unusable/unreachable database FAILS — it never
     degrades to a skip, and never falls back to the application DATABASE_URL;
  3. a missing intake surface FAILS when verification is required
     (INTAKE_REQUIRE=1, used by CI and merged-tip verification);
  4. printed database diagnostics never contain credentials;
  5. fixture cleanup is id-scoped to rows this run created (no truncation, no
     touching foreign rows).

The subprocess case is the end-to-end proof for (2): it runs the real
integration test with DATABASE_URL set and TEST_DATABASE_URL empty and asserts a
non-zero exit — i.e. the previous "green skip" cannot come back.
"""

from __future__ import annotations

import inspect
import os
import subprocess
import sys
from pathlib import Path


def _repo_root() -> Path:
    start = Path(__file__).resolve()
    for candidate in (start.parent, *start.parents):
        if (candidate / "pytest.ini").is_file() and (
            candidate / "scripts" / "intake_smoke.py"
        ).is_file():
            return candidate
    raise RuntimeError("cannot locate the repository root")


REPO_ROOT = _repo_root()
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import intake_smoke
import pytest

# --- 1. root discovery ------------------------------------------------------


def test_repo_root_found_by_marker():
    assert (intake_smoke.REPO_ROOT / "pytest.ini").is_file()
    assert (intake_smoke.REPO_ROOT / "scripts" / "intake_smoke.py").is_file()
    assert intake_smoke.REPO_ROOT == REPO_ROOT


def test_repo_root_is_importable_without_pythonpath():
    """The import the test module performs works in a clean interpreter."""
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    proc = subprocess.run(
        [sys.executable, "-c", "import sys; sys.path.insert(0, 'scripts'); import intake_smoke"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr


# --- 2. fail-closed database configuration ---------------------------------


def test_no_target_configured_fails_without_falling_back(monkeypatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://app:pw@db.internal:5432/casevault")
    with pytest.raises(intake_smoke.ConfigurationError) as excinfo:
        intake_smoke.resolve_database_url(None)
    message = str(excinfo.value)
    assert "TEST_DATABASE_URL" in message
    assert "pw" not in message  # no credentials echoed


def test_empty_explicit_target_fails(monkeypatch):
    monkeypatch.setenv("TEST_DATABASE_URL", "   ")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(intake_smoke.ConfigurationError):
        intake_smoke.resolve_database_url(None)


def test_unparseable_target_fails(monkeypatch):
    monkeypatch.setenv("TEST_DATABASE_URL", "not-a-database-url")
    with pytest.raises(intake_smoke.ConfigurationError):
        intake_smoke.resolve_database_url(None)


def test_app_database_target_is_never_silent(monkeypatch):
    """An explicit target equal to DATABASE_URL warns unless acknowledged.

    It cannot be a hard refusal: scripts/verify_all.sh (integrator-owned) exports
    both variables to the same throwaway database, so refusing would red the wave
    gate. What matters is that the risk is never silent.
    """
    app_url = "postgresql://postgres:secret@localhost:5432/casevault"
    monkeypatch.setenv("DATABASE_URL", app_url)
    monkeypatch.setenv("TEST_DATABASE_URL", app_url)
    monkeypatch.delenv("INTAKE_ALLOW_APP_DB", raising=False)
    url, source, warning = intake_smoke.resolve_database_url(None)
    assert url == app_url and source == "TEST_DATABASE_URL"
    assert warning and "INTAKE_ALLOW_APP_DB" in warning
    assert "secret" not in warning

    monkeypatch.setenv("INTAKE_ALLOW_APP_DB", "1")
    _url, _source, acknowledged = intake_smoke.resolve_database_url(None)
    assert acknowledged is None


def test_explicit_cli_target_wins_and_is_reported(monkeypatch):
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    url, source, warning = intake_smoke.resolve_database_url(
        "postgresql://u:p@host:5432/casevault_test"
    )
    assert source == "--database-url" and url.endswith("casevault_test")
    assert warning is None


def test_integration_test_fails_when_url_is_empty_not_skips():
    """Subprocess proof for the fail-closed rule (regression for the old skip)."""
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env["DATABASE_URL"] = "postgresql://app:pw@localhost:5432/casevault_app"
    env["TEST_DATABASE_URL"] = ""
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            str(REPO_ROOT / "tests" / "integration" / "test_intake_e2e.py"),
            "-q",
            "-p",
            "no:cacheprovider",
        ],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )
    output = proc.stdout + proc.stderr
    assert proc.returncode != 0, f"expected failure, got a green run:\n{output}"
    assert "skipped" not in output.splitlines()[-1], f"must not skip:\n{output}"


# --- 3. required-vs-park policy --------------------------------------------


def test_missing_surface_is_failure_when_required():
    failure = intake_smoke.missing_surface("tables missing", required=True)
    assert isinstance(failure, intake_smoke.SmokeFailure)
    park = intake_smoke.missing_surface("tables missing", required=False)
    assert isinstance(park, intake_smoke.DependencyAbsent)


def test_require_intake_flag_and_env(monkeypatch):
    monkeypatch.delenv("INTAKE_REQUIRE", raising=False)
    assert intake_smoke.require_intake(False) is False
    assert intake_smoke.require_intake(True) is True
    monkeypatch.setenv("INTAKE_REQUIRE", "1")
    assert intake_smoke.require_intake(False) is True
    monkeypatch.setenv("INTAKE_REQUIRE", "off")
    assert intake_smoke.require_intake(False) is False


# --- 4. credential-safe output ---------------------------------------------


def test_redaction_hides_credentials():
    url = "postgresql://verifier:sup3rsecret@db.example:5432/casevault"
    assert "sup3rsecret" not in intake_smoke.redact_url(url)
    assert "verifier" not in intake_smoke.redact_url(url)
    assert "db.example" in intake_smoke.redact_url(url)
    assert "casevault" in intake_smoke.redact_url(url)

    diagnostic = f"connection to server failed: {url}?sslmode=require"
    assert "sup3rsecret" not in intake_smoke.redact(diagnostic)
    assert "postgresql://***@" in intake_smoke.redact(diagnostic)


def test_log_lines_are_redacted():
    log = intake_smoke.FlowLog()
    log.note("dsn postgresql://user:pw@host/db refused")
    assert "pw@" not in "".join(log.lines)


# --- 5. cleanup is id-scoped ------------------------------------------------


class _FakeResponse:
    def __init__(self, payload):
        self.status_code = 200
        self._payload = payload

    def json(self):
        return self._payload


class _FakeClient:
    """Returns one of our rows and one foreign row per collection endpoint."""

    def __init__(self, uid, source_id, matter_id):
        self.uid = uid
        self.source_id = source_id
        self.matter_id = matter_id

    def get(self, path, params=None):
        if path.endswith("/proposals"):
            return _FakeResponse(
                {
                    "items": [
                        {"id": "p-ours", "title": f"about {self.uid}", "proposed_text": ""},
                        {
                            "id": "p-ours-source",
                            "title": "",
                            "proposed_text": "",
                            "source_id": self.source_id,
                        },
                        {
                            "id": "p-foreign",
                            "title": "someone else's proposal",
                            "proposed_text": "",
                            "matter_id": "m-foreign",
                        },
                    ]
                }
            )
        if path.endswith("/facts"):
            return _FakeResponse(
                {"items": [{"id": "f-ours"}, {"id": "f-ours-2"}]}
                if (params or {}).get("matter_id") == self.matter_id
                else {"items": []}
            )
        if path.endswith("/ledger-entries"):
            return _FakeResponse({"items": [{"id": "l-ours"}]})
        return _FakeResponse({"items": []})


def test_collect_fixtures_is_scoped_to_this_run():
    fixtures = {
        "uid": "abcd1234",
        "matter_a": "m-ours",
        "matter_b": "m-ours-b",
        "actor_id": "a-ours",
        "source_id": "s-ours",
        "fact_id": "f-ours",
    }
    client = _FakeClient("abcd1234", "s-ours", "m-ours")
    ids = intake_smoke.collect_fixtures(client, fixtures)
    assert set(ids["proposal_ids"]) == {"p-ours", "p-ours-source"}
    assert "p-foreign" not in ids["proposal_ids"]
    assert set(ids["matter_ids"]) == {"m-ours", "m-ours-b"}
    assert ids["ledger_ids"] == ["l-ours"]
    assert ids["actor_ids"] == ["a-ours"]


def test_cleanup_spec_covers_every_table_the_flow_creates():
    """A new fixture table must be added to the cleanup spec (regression guard)."""
    covered = {table for table, _column, _key in intake_smoke.FIXTURE_DELETES}
    assert {
        "fact_assertions",
        "fact_source_links",
        "fact_actor_links",
        "proposals",
        "ledger_entries",
        "sources",
        "source_pages",
        "matters",
        "actors",
    } <= covered


# --- 6. queued generation is proved by committed state, not placeholders ----


class _QueueClient:
    """Serves GET /proposals totals from a scripted sequence (last repeats)."""

    def __init__(self, totals):
        self.totals = list(totals)
        self.calls = 0

    def get(self, path, params=None):
        assert path.endswith("/proposals"), path
        total = self.totals[min(self.calls, len(self.totals) - 1)]
        self.calls += 1
        return _FakeResponse(
            {
                "items": [{"id": f"p-{n}"} for n in range(total)],
                "total": total,
                "limit": 50,
                "offset": 0,
            }
        )


def test_generation_wait_seconds_defaults_and_parsing(monkeypatch):
    monkeypatch.delenv("INTAKE_GENERATION_WAIT", raising=False)
    assert intake_smoke.generation_wait_seconds(None) == intake_smoke.DEFAULT_GENERATION_WAIT
    assert intake_smoke.generation_wait_seconds(5) == 5.0
    monkeypatch.setenv("INTAKE_GENERATION_WAIT", "12.5")
    assert intake_smoke.generation_wait_seconds(None) == 12.5
    monkeypatch.setenv("INTAKE_GENERATION_WAIT", "0")
    assert intake_smoke.generation_wait_seconds(None) == 0.0
    monkeypatch.setenv("INTAKE_GENERATION_WAIT", "soon")
    with pytest.raises(intake_smoke.ConfigurationError):
        intake_smoke.generation_wait_seconds(None)
    # An explicit flag always wins over the environment.
    monkeypatch.setenv("INTAKE_GENERATION_WAIT", "12.5")
    assert intake_smoke.generation_wait_seconds(3) == 3.0


def test_queued_wait_succeeds_on_committed_state(monkeypatch):
    """`created/skipped=0` placeholders are ignored; the proposals are the proof."""
    monkeypatch.setattr(intake_smoke, "POLL_INTERVAL", 0.01)
    monkeypatch.setattr(intake_smoke, "GENERATION_STABLE_SECONDS", 0.0)
    client = _QueueClient([0, 0, 3, 3])
    result = intake_smoke.wait_for_generation(
        client, intake_smoke.FlowLog(), "s-1", 3, ["job-1"], 5.0, "generate"
    )
    assert result["total"] == 3
    assert client.calls >= 3


def test_queued_wait_fails_instead_of_hanging_when_nothing_is_committed(monkeypatch):
    """A queued run with no worker must FAIL (never a silent pass on placeholders)."""
    monkeypatch.setattr(intake_smoke, "POLL_INTERVAL", 0.05)
    client = _QueueClient([0])
    with pytest.raises(intake_smoke.SmokeFailure) as excinfo:
        intake_smoke.wait_for_generation(
            client, intake_smoke.FlowLog(), "s-1", 3, ["job-1"], 0.4, "generate"
        )
    assert "worker" in excinfo.value.observed.lower()
    assert "extract" in excinfo.value.observed


def test_queued_job_failure_is_reported_immediately(monkeypatch):
    monkeypatch.setattr(intake_smoke, "POLL_INTERVAL", 0.05)
    monkeypatch.setattr(intake_smoke, "_queued_job_status", lambda job_id: "failed")
    client = _QueueClient([0])
    with pytest.raises(intake_smoke.SmokeFailure) as excinfo:
        intake_smoke.wait_for_generation(
            client, intake_smoke.FlowLog(), "s-1", 3, ["job-1"], 30.0, "generate"
        )
    assert "failed" in excinfo.value.observed


def test_cleanup_after_run_runs_even_after_a_deviation(monkeypatch):
    """A mid-flow deviation must still remove the rows created so far."""
    calls = {}
    monkeypatch.setattr(
        intake_smoke,
        "cleanup_fixtures",
        lambda db_url, ids, log: calls.update(db_url=db_url, ids=ids),
    )
    fixtures = {"uid": "abcd1234", "matter_a": "m-ours", "matter_b": "m-ours-b"}
    client = _FakeClient("abcd1234", "s-ours", "m-ours")
    log = intake_smoke.FlowLog()
    intake_smoke.cleanup_after_run(client, "postgresql://postgres@/db", fixtures, False, log)
    assert calls["db_url"] == "postgresql://postgres@/db"
    assert "m-ours" in calls["ids"]["matter_ids"]

    # --keep-fixtures must keep, and a missing client must not raise.
    calls.clear()
    intake_smoke.cleanup_after_run(client, "db", fixtures, True, log)
    assert not calls
    intake_smoke.cleanup_after_run(None, "db", fixtures, False, log)
    assert not calls


def test_main_wires_the_tracked_fixtures_into_cleanup():
    """Regression for the leak found on 2026-09-10: main() cleaned up only after
    a successful return, so a mid-flow deviation left rows behind. Cleanup must be
    driven by the incrementally-filled `fixtures` dict."""
    source = inspect.getsource(intake_smoke.main)
    assert "run_flow(client, log, fixtures" in source
    assert "cleanup_after_run(client, db_url, fixtures" in source

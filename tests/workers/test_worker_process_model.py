"""W2-W: RQ worker process-model selection (macOS fork-safety hotfix).

Covers ``workers.run_worker.select_worker_class`` — the pure platform /
override decision behind the SIGABRT fix (dev-logs 79ca457,
handoff/OCR_CRASH_REPORT.md): RQ's default Worker executes jobs in an
os.fork() child, and on macOS a forked child's psycopg2.connect initialises
CoreFoundation/Objective-C via libpq's GSS probe, which aborts the process.
macOS must therefore never run the forking Worker; Linux must keep it.

No network, no database, no redis server: selection is pure, and the rq
module is injected (a fake namespace simulates rq < 2.2.0, which predates
rq.SpawnWorker) where the installed package would mask the fallback.
"""
from __future__ import annotations

import subprocess
import sys
import types
from pathlib import Path

import pytest
import rq
from workers import run_worker
from workers.run_worker import (
    WORKER_CLASS_ENV_VAR,
    SpawnWorkerUnavailableError,
    UnknownWorkerClassError,
    select_worker_class,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def _fake_rq(spawn: bool = True) -> types.SimpleNamespace:
    """Stand-in rq module; ``spawn=False`` simulates rq < 2.2.0."""

    class Worker:  # forking model — must never be chosen on darwin
        pass

    class SimpleWorker:
        pass

    class SpawnWorker:
        pass

    namespace = types.SimpleNamespace(Worker=Worker, SimpleWorker=SimpleWorker)
    if spawn:
        namespace.SpawnWorker = SpawnWorker
    return namespace


# ---------------------------------------------------------------------------
# Platform defaults
# ---------------------------------------------------------------------------


def test_linux_default_is_todays_forking_worker():
    """Regression guard: the Linux default stays rq.Worker (W2-J verified)."""
    fake = _fake_rq()
    for platform in ("linux", "linux2", "freebsd13", "sunos5", "aix7"):
        selection = select_worker_class(platform=platform, rq_module=fake)
        assert selection.worker_class is fake.Worker, platform
        assert selection.warning is None


def test_darwin_default_is_spawn_worker():
    fake = _fake_rq()
    selection = select_worker_class(platform="darwin", rq_module=fake)
    assert selection.worker_class is fake.SpawnWorker
    assert selection.warning is None
    assert "macOS default" in selection.reason


def test_darwin_without_spawn_worker_falls_back_to_simple_with_loud_warning():
    """rq < 2.2.0 on macOS: in-process SimpleWorker, never the forking Worker."""
    fake = _fake_rq(spawn=False)
    selection = select_worker_class(platform="darwin", rq_module=fake)
    assert selection.worker_class is fake.SimpleWorker
    assert selection.worker_class is not fake.Worker
    assert selection.warning  # loud, not silent
    assert "SpawnWorker" in selection.warning
    assert run_worker.MIN_SPAWN_RQ_VERSION in selection.warning


def test_linux_without_spawn_worker_keeps_forking_worker():
    """SpawnWorker availability must not change the proven Linux default."""
    fake = _fake_rq(spawn=False)
    selection = select_worker_class(platform="linux", rq_module=fake)
    assert selection.worker_class is fake.Worker
    assert selection.warning is None


# ---------------------------------------------------------------------------
# CASEVAULT_WORKER_CLASS override
# ---------------------------------------------------------------------------


def test_override_spawn_selects_spawn():
    fake = _fake_rq()
    for platform in ("linux", "darwin"):
        selection = select_worker_class(
            platform=platform, override="spawn", rq_module=fake
        )
        assert selection.worker_class is fake.SpawnWorker, platform


def test_override_simple_selects_simple():
    fake = _fake_rq()
    selection = select_worker_class(platform="linux", override="simple", rq_module=fake)
    assert selection.worker_class is fake.SimpleWorker
    assert selection.warning is None


def test_override_worker_forces_forking_worker():
    fake = _fake_rq()
    selection = select_worker_class(platform="linux", override="worker", rq_module=fake)
    assert selection.worker_class is fake.Worker


def test_override_worker_on_darwin_is_explicit_but_warns():
    """The escape hatch stays available for crash reproduction, loudly."""
    fake = _fake_rq()
    selection = select_worker_class(platform="darwin", override="worker", rq_module=fake)
    assert selection.worker_class is fake.Worker
    assert selection.warning and "SIGABRT" in selection.warning


def test_override_spawn_without_spawn_worker_fails_loudly():
    """Explicit spawn on rq < 2.2.0 is a hard error, not a silent degrade."""
    fake = _fake_rq(spawn=False)
    with pytest.raises(SpawnWorkerUnavailableError, match="2.2.0"):
        select_worker_class(platform="linux", override="spawn", rq_module=fake)


@pytest.mark.parametrize("bad", ["threaded", "fork", "spawnworker", "WorkHorse", "", None])
def test_unknown_or_empty_override_rejected(bad):
    """Garbage falls to UnknownWorkerClassError; empty/None falls to platform."""

    fake = _fake_rq()
    if bad in ("", None):
        # Empty values mean "no override" — platform default applies.
        selection = select_worker_class(platform="linux", override=bad, rq_module=fake)
        assert selection.worker_class is fake.Worker
    else:
        with pytest.raises(UnknownWorkerClassError):
            select_worker_class(platform="linux", override=bad, rq_module=fake)


def test_override_is_case_and_whitespace_insensitive():
    fake = _fake_rq()
    selection = select_worker_class(platform="linux", override=" Spawn ", rq_module=fake)
    assert selection.worker_class is fake.SpawnWorker


# ---------------------------------------------------------------------------
# The invariant: darwin NEVER selects the forking Worker by default
# ---------------------------------------------------------------------------


def test_darwin_never_defaults_to_the_forking_worker():
    """Every no-override darwin combination must avoid the forking model.

    Pins the fix for the reviewed root cause: a forked macOS child dies with
    SIGABRT the moment psycopg2/libpq probes GSS credentials (CoreFoundation
    initialisation is illegal in a fork child).
    """
    real_worker = rq.Worker
    for fake in (_fake_rq(spawn=True), _fake_rq(spawn=False)):
        selection = select_worker_class(platform="darwin", rq_module=fake)
        assert selection.worker_class is not fake.Worker
    # And with the real installed rq (the module default path):
    selection = select_worker_class(platform="darwin")
    assert selection.worker_class is not real_worker
    assert selection.worker_class in (
        getattr(rq, "SpawnWorker", None) or rq.SimpleWorker,
        rq.SimpleWorker,
    )


def test_real_rq_linux_default_matches_installed_worker_class():
    selection = select_worker_class(platform="linux")
    assert selection.worker_class is rq.Worker


# ---------------------------------------------------------------------------
# main(): unknown override exits non-zero, before any redis contact
# ---------------------------------------------------------------------------


def test_main_unknown_override_exits_nonzero(capsys, monkeypatch):
    monkeypatch.setenv(WORKER_CLASS_ENV_VAR, "threaded")
    with pytest.raises(SystemExit) as excinfo:
        run_worker.main()
    assert excinfo.value.code != 0
    assert WORKER_CLASS_ENV_VAR in capsys.readouterr().err


# ---------------------------------------------------------------------------
# Import hygiene: redis/rq stay lazy so `make ping-job` works without them
# ---------------------------------------------------------------------------


def test_module_import_does_not_pull_in_redis_or_rq():
    code = (
        f"import sys; sys.path.insert(0, {str(REPO_ROOT)!r}); "
        "import workers.run_worker; "
        "assert 'rq' not in sys.modules, 'rq imported eagerly'; "
        "assert 'redis' not in sys.modules, 'redis imported eagerly'; "
        "print('LAZY-OK')"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "LAZY-OK" in result.stdout

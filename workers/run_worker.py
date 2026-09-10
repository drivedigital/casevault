"""RQ worker bootstrap for local development.

Usage:
    python -m workers.run_worker            (or: make worker)

Requires a running redis (make infra-up) and REDIS_URL in .env.local.

Worker process model (W2-W — macOS fork-safety hotfix):
    RQ's default worker executes every job in an os.fork() child. On macOS
    the child's psycopg2.connect triggers libpq's GSS/Kerberos credential
    probe, which initialises CoreFoundation/Objective-C — illegal in a fork
    child, so the process dies with SIGABRT (dev-logs 79ca457,
    handoff/OCR_CRASH_REPORT.md, handoff/KNOWN_ISSUES.md).

    Selection therefore depends on the platform:

    - darwin   -> rq.SpawnWorker (spawns a fresh interpreter; never forks a
                  job). If the installed rq predates SpawnWorker (added in
                  rq 2.2.0), fall back to rq.SimpleWorker (in-process, also
                  fork-free) with a loud warning — never silently the
                  forking Worker.
    - everything else -> rq.Worker (today's behaviour, unchanged; verified
                  end-to-end by W2-J on the merge of 15174cd).

    CASEVAULT_WORKER_CLASS=worker|spawn|simple overrides the platform
    default (escape hatch for reproduction and debugging). An unknown value
    fails startup with a non-zero exit code.

    Keep redis/rq imports lazy so this module stays importable where the
    worker stack is not installed (repo posture: `make ping-job` works
    without redis). The selection logic is a pure function (no env reads,
    no I/O) covered by tests/workers/test_worker_process_model.py.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from dotenv import load_dotenv

WORKER_CLASS_ENV_VAR = "CASEVAULT_WORKER_CLASS"
VALID_WORKER_CLASSES = ("worker", "spawn", "simple")
# rq.SpawnWorker first shipped in rq 2.2.0 (verified against the 1.16.2 /
# 2.0.0 / 2.1.0 / 2.2.0 wheels — see handoff/notes/W2-W.md).
MIN_SPAWN_RQ_VERSION = "2.2.0"


class UnknownWorkerClassError(ValueError):
    """CASEVAULT_WORKER_CLASS held a value outside VALID_WORKER_CLASSES."""


class SpawnWorkerUnavailableError(RuntimeError):
    """Spawn was requested explicitly but the installed rq lacks SpawnWorker."""


@dataclass(frozen=True)
class WorkerClassSelection:
    """Outcome of select_worker_class()."""

    worker_class: type        # the RQ worker class to instantiate
    name: str                 # display name, e.g. "rq.SpawnWorker"
    reason: str               # why this class was chosen (logged at startup)
    warning: str | None = None  # loud degradation notice, if any


def _worker_name(cls: type) -> str:
    return f"rq.{cls.__name__}"


def select_worker_class(
    platform: str | None = None,
    override: str | None = None,
    rq_module: object | None = None,
) -> WorkerClassSelection:
    """Choose the RQ worker class for *platform* — a pure function.

    No environment reads and no I/O: the caller (main) passes
    ``sys.platform`` and the raw CASEVAULT_WORKER_CLASS value. ``rq_module``
    is injectable so tests can simulate an rq without SpawnWorker without
    touching the installed package; ``None`` lazily imports the real rq here
    (never at module import time).

    Raises:
        UnknownWorkerClassError: override is not worker|spawn|simple.
        SpawnWorkerUnavailableError: override="spawn" but rq < 2.2.0.
    """
    if rq_module is None:
        import rq as rq_module  # deferred: script dep only (see docstring)

    platform = (platform if platform is not None else sys.platform).lower()
    override_normalized = (override or "").strip().lower()

    worker = rq_module.Worker
    simple = rq_module.SimpleWorker
    spawn = getattr(rq_module, "SpawnWorker", None)

    if override_normalized:
        if override_normalized not in VALID_WORKER_CLASSES:
            raise UnknownWorkerClassError(
                f"unknown {WORKER_CLASS_ENV_VAR}={override!r}; "
                f"expected one of {', '.join(VALID_WORKER_CLASSES)}"
            )
        if override_normalized == "worker":
            warning = None
            if platform == "darwin":
                warning = (
                    f"{WORKER_CLASS_ENV_VAR}='worker' forces RQ's forking "
                    "Worker on macOS — the exact configuration that SIGABRTs "
                    "when a job touches Postgres (dev-logs 79ca457). "
                    "Expected only for reproducing the original crash."
                )
            return WorkerClassSelection(
                worker_class=worker,
                name=_worker_name(worker),
                reason=f"explicit {WORKER_CLASS_ENV_VAR}='worker'",
                warning=warning,
            )
        if override_normalized == "simple":
            return WorkerClassSelection(
                worker_class=simple,
                name=_worker_name(simple),
                reason=f"explicit {WORKER_CLASS_ENV_VAR}='simple'",
            )
        # override_normalized == "spawn"
        if spawn is None:
            raise SpawnWorkerUnavailableError(
                f"{WORKER_CLASS_ENV_VAR}='spawn' requires rq>={MIN_SPAWN_RQ_VERSION} "
                "(rq.SpawnWorker was added in 2.2.0); upgrade rq or use "
                f"{WORKER_CLASS_ENV_VAR}='simple'"
            )
        return WorkerClassSelection(
            worker_class=spawn,
            name=_worker_name(spawn),
            reason=f"explicit {WORKER_CLASS_ENV_VAR}='spawn'",
        )

    if platform == "darwin":
        if spawn is not None:
            return WorkerClassSelection(
                worker_class=spawn,
                name=_worker_name(spawn),
                reason="macOS default: SpawnWorker runs jobs in a spawned "
                "interpreter, avoiding the fork-child SIGABRT on "
                "Postgres/GSS (handoff/OCR_CRASH_REPORT.md)",
            )
        return WorkerClassSelection(
            worker_class=simple,
            name=_worker_name(simple),
            reason="macOS fallback: installed rq has no SpawnWorker; "
            "SimpleWorker also avoids the illegal fork",
            warning=(
                "installed rq lacks rq.SpawnWorker (needs rq>="
                f"{MIN_SPAWN_RQ_VERSION}); running jobs in-process via "
                "rq.SimpleWorker — no job isolation, and 'make worker' is "
                "blocked while a job runs. Never selecting the forking "
                "Worker on macOS. Upgrade rq (workers/requirements.txt) to "
                "restore SpawnWorker."
            ),
        )

    return WorkerClassSelection(
        worker_class=worker,
        name=_worker_name(worker),
        reason=f"platform default for {platform!r} (Linux/process model verified by W2-J)",
    )


def main() -> None:
    load_dotenv(".env.local")
    load_dotenv(".env")

    override = os.environ.get(WORKER_CLASS_ENV_VAR)
    try:
        selection = select_worker_class(platform=sys.platform, override=override)
    except (UnknownWorkerClassError, SpawnWorkerUnavailableError) as exc:
        print(f"[casevault-worker] ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc

    import redis  # deferred: script deps only

    from workers.queues import QUEUES

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    conn = redis.Redis.from_url(redis_url)
    print(f"[casevault-worker] connecting to {redis_url}")
    print(f"[casevault-worker] listening on queues: {', '.join(QUEUES)}")
    print(
        f"[casevault-worker] worker class: {selection.name} "
        f"(platform={sys.platform}, "
        f"{WORKER_CLASS_ENV_VAR}={override or 'unset'}; {selection.reason})"
    )
    if selection.warning:
        banner = (
            "[casevault-worker] " + "=" * 60 + "\n"
            f"[casevault-worker] WARNING: {selection.warning}\n"
            "[casevault-worker] " + "=" * 60
        )
        print(banner, file=sys.stderr, flush=True)
    # Registered Phase 0 jobs: workers.pipeline.jobs.ping / .health_check
    selection.worker_class(QUEUES, connection=conn).work(with_scheduler=False)


if __name__ == "__main__":
    main()

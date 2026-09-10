"""Redis-optional enqueue helpers (docs/contracts/sprint3_evidence.md §5).

``enqueue_ingest`` / ``enqueue_ocr`` are importable WITHOUT redis/rq installed
(repo posture: ``make ping-job`` works everywhere). When redis or the rq
library is unavailable they degrade gracefully and never raise:

    {"queued": False, "job_id": None, "reason": "..."}

With redis reachable they enqueue ``workers.pipeline.source_jobs.*`` on the
frozen ``ingest`` / ``ocr`` queues (names live in ``workers/queues.py`` —
contract §5, do not rename).
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("casevault.worker")

_INGEST_JOB = "workers.pipeline.source_jobs.ingest_source"
_OCR_JOB = "workers.pipeline.source_jobs.ocr_source"


def enqueue_ingest(source_id: str, workspace_id: str) -> dict:
    """Queue ``ingest_source``; returns ``{queued, job_id, reason}`` — never raises."""
    return _enqueue("ingest", _INGEST_JOB, source_id, workspace_id)


def enqueue_ocr(source_id: str, workspace_id: str) -> dict:
    """Queue ``ocr_source``; returns ``{queued, job_id, reason}`` — never raises."""
    return _enqueue("ocr", _OCR_JOB, source_id, workspace_id)


def _enqueue(queue: str, job_path: str, source_id: str, workspace_id: str) -> dict:
    degraded = {"queued": False, "job_id": None, "reason": None}

    from workers.queues import QUEUES  # frozen queue names (contract §5)

    if queue not in QUEUES:
        degraded["reason"] = f"unknown queue {queue!r}"
        return degraded

    try:
        import redis  # deferred: optional dependency (workers/requirements.txt)
        from rq import Queue
    except ImportError as exc:
        degraded["reason"] = (
            f"redis/rq not installed ({exc.name}); job not queued — install "
            "workers/requirements.txt or run `make process-jobs`"
        )
        return degraded

    url = _redis_url()
    try:
        connection = redis.Redis.from_url(
            url, socket_connect_timeout=2.0, socket_timeout=2.0
        )
        connection.ping()
        job = Queue(queue, connection=connection).enqueue(
            job_path, str(source_id), str(workspace_id)
        )
        return {"queued": True, "job_id": job.id, "reason": None}
    except Exception as exc:  # noqa: BLE001 — degrade, never raise
        degraded["reason"] = f"redis unavailable at {url}: {exc}"
        return degraded


def _redis_url() -> str:
    """Redis URL from settings (env-aware); falls back to REDIS_URL / default."""
    _ensure_app_importable()
    try:
        from app.config import get_settings

        url = get_settings().redis_url
        if url:
            return url
    except Exception as exc:  # noqa: BLE001 — settings are optional when degrading
        logger.warning("settings unavailable for redis url (%s); using env/default", exc)
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")


def _ensure_app_importable() -> None:
    """Make the apps/api package importable when run outside pytest."""
    api_root = Path(__file__).resolve().parents[2] / "apps" / "api"
    if api_root.is_dir() and str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))

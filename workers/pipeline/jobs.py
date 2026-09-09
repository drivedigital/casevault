"""Phase 0 pipeline jobs.

Keep this module importable WITHOUT redis/rq installed so unit tests and the
direct-run bootstrap (`python -m workers.run_ping`) work everywhere.
"""
import os
from datetime import datetime, timezone


def ping() -> dict:
    """Trivial liveness job: proves the worker bootstrap and queue wiring."""
    return {
        "job": "ping",
        "status": "ok",
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "redis_url_set": bool(os.environ.get("REDIS_URL")),
    }


def health_check() -> dict:
    """Placeholder job registration target for later pipelines (OCR, VLM,
    embeddings, proposal generation). Replaced by real jobs in later sprints."""
    return {
        "job": "health_check",
        "status": "ok",
        "registered": True,
        "time_utc": datetime.now(timezone.utc).isoformat(),
    }

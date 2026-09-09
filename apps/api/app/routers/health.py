"""Health check endpoints (Phase 0)."""
from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict:
    """Liveness/readiness probe.

    Intentionally does NOT touch the database or redis — Phase 0 keeps this
    dependency-free so a scaffold boot is always verifiable. A deep health
    check (DB + queue) lands with the first real migrations in Phase 1.
    """
    settings = get_settings()
    return {
        "status": "ok",
        "service": "casevault-api",
        "version": "0.1.0",
        "environment": settings.app_env,
        "storage_mode": settings.storage_mode,
        "time_utc": datetime.now(timezone.utc).isoformat(),
    }

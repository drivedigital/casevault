"""Health endpoints (Phase 0 plan §9.2 minimum route set)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_root() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/v1/health")
def health_v1(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
        db_state = "up"
    except Exception:  # pragma: no cover
        db_state = "down"
    return {"status": "ok" if db_state == "up" else "degraded", "db": db_state}

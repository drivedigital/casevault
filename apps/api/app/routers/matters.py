"""MATTERS BOOTSTRAP STUB (read-only).

The claims matrix is matter-scoped, so WS-CLAIMS needs a matter list to render.
Wave 1/2 never landed in this checkout, so this read-only stub exists purely so
the claims workstream is runnable end-to-end. WS-MATTERS owns `matters` and must
replace this file when its workstream lands — this stub is part of the
Phase-0 bootstrap, not of the WS-CLAIMS feature itself.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.matter import Matter
from app.schemas.claim import MatterOut

router = APIRouter(tags=["matters (bootstrap stub)"])


@router.get("/matters", response_model=list[MatterOut])
def list_matters(db: Session = Depends(get_db)) -> list[MatterOut]:
    matters = db.scalars(select(Matter).order_by(Matter.created_at)).all()
    return [
        MatterOut(
            id=m.id,
            title=m.title,
            status=m.status.value,
            matter_type=m.matter_type.value,
        )
        for m in matters
    ]

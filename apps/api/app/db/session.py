"""Engine/session wiring."""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = get_settings().resolved_database_url
        kwargs: dict[str, Any] = {"future": True}
        if _is_sqlite(url):
            kwargs["connect_args"] = {"check_same_thread": False}
        _engine = create_engine(url, **kwargs)
    return _engine


def get_sessionmaker() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
    return _SessionLocal


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    with get_sessionmaker()() as session:
        yield session


def init_db() -> None:
    """Bootstrap-friendly create_all. Alembic owns schema evolution from here on."""
    from app import models  # noqa: F401  (register metadata)
    from app.db.base import Base

    Base.metadata.create_all(get_engine())


def reset_engine_cache() -> None:  # used by tests
    global _engine, _SessionLocal
    _engine = None
    _SessionLocal = None

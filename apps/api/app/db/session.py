"""Database engine/session factory (lazy).

The engine is created on first use only, so importing the app (and running
the Phase 0 health check) never requires a live Postgres.
"""
from functools import lru_cache

from sqlalchemy import create_engine

from app.config import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    return create_engine(settings.database_url, pool_pre_ping=True)

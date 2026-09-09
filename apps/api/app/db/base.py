"""SQLAlchemy declarative base.

Domain models are introduced in Phase 1 per
docs/specs/Legal_Matter_Intelligence_Database_Schema_Draft.md (migration
plan, sections 9). Alembic targets this metadata.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass

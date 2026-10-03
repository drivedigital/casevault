"""bootstrap scaffold tables (Phase 0 + WS-CLAIMS subset)

Revision ID: 0001
Revises:
Create Date: 2026-10-03

Bootstrap note: Wave 1/2 migrations were never landed in this checkout.
This single revision creates the modelled subset via metadata (idempotent,
checkfirst). It is intentionally FROZEN — future workstreams must add new
revisions (0002+) rather than edit this one, per WS-CLAIMS invariant #3.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.base import Base
from app import models  # noqa: F401  (register metadata)

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, checkfirst=True)

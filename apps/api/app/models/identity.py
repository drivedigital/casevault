"""Group A: users, memberships, workspace settings (Schema Draft section 6.1).

Local identity mode (DECISIONS 2026-09-08): exactly one User row exists —
the implicit local owner — until collaboration lands. No login surface.
"""
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import WorkspaceRole
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Case-insensitive uniqueness is enforced by a functional unique index
    # (lower(email)) created in migration 0001 — NOT via a CITEXT column.
    # Rationale (DECISIONS 2026-09-08): CITEXT requires contrib modules that
    # some Postgres distributions lack; lower() works everywhere.
    email: Mapped[str] = mapped_column(sa.String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)

    memberships: Mapped[list["WorkspaceMembership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class WorkspaceMembership(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (
        sa.UniqueConstraint(
            "workspace_id", "user_id", name="uq_workspace_memberships__workspace__user"
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        sa.Enum(WorkspaceRole, name="workspace_role_enum"), nullable=False
    )
    invited_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="memberships")


class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    settings_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
        nullable=False,
    )

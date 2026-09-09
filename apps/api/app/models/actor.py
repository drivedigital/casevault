"""Group C: actors, aliases, and per-matter roles (Schema Draft section 6.3).

One actor registry spans the whole workspace; the SAME actor can appear in
different roles in different matters (plaintiff here, witness there)
without data duplication (PRD section 10.2).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ActorType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.matter import Matter


class Actor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "actors"
    __table_args__ = (
        sa.Index("ix_actors__workspace__display_name", "workspace_id", "display_name"),
        sa.Index("ix_actors__workspace__normalized_name", "workspace_id", "normalized_name"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    actor_type: Mapped[ActorType] = mapped_column(
        sa.Enum(ActorType, name="actor_type_enum"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    normalized_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    aliases: Mapped[list[ActorAlias]] = relationship(
        back_populates="actor", cascade="all, delete-orphan"
    )
    matter_roles: Mapped[list[MatterActorRole]] = relationship(
        back_populates="actor", cascade="all, delete-orphan"
    )


class ActorAlias(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "actor_aliases"
    __table_args__ = (
        sa.UniqueConstraint("actor_id", "alias_text", name="uq_actor_aliases__actor__alias"),
    )

    actor_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("actors.id", ondelete="CASCADE"), nullable=False
    )
    alias_text: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    alias_type: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    actor: Mapped[Actor] = relationship(back_populates="aliases")


class MatterActorRole(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "matter_actor_roles"
    __table_args__ = (
        sa.UniqueConstraint(
            "matter_id", "actor_id", "role_label", name="uq_matter_actor_roles__matter__actor__role"
        ),
    )

    matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("actors.id", ondelete="CASCADE"), nullable=False
    )
    role_label: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    actor: Mapped[Actor] = relationship(back_populates="matter_roles")
    matter: Mapped[Matter] = relationship()

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ActorType, sa_enum


class Actor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Shared actor registry (Schema Draft 6.3)."""

    __tablename__ = "actors"
    __table_args__ = (UniqueConstraint("workspace_id", "display_name", name="uq_actors_ws_name"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_type: Mapped[ActorType] = mapped_column(
        sa_enum(ActorType, "actor_type_enum"), default=ActorType.person, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

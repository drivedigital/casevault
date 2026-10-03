"""Legal authorities / research (Schema Draft 6.9, trimmed)."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AuthorityType, sa_enum


class Authority(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "authorities"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matter_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("matters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    authority_type: Mapped[AuthorityType] = mapped_column(
        sa_enum(AuthorityType, "authority_type_enum"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    citation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    pinpoint_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    holding_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_link: Mapped[str | None] = mapped_column(Text, nullable=True)

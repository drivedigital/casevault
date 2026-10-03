from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MatterStatus, MatterType, sa_enum


class Matter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "matters"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    matter_type: Mapped[MatterType] = mapped_column(
        sa_enum(MatterType, "matter_type_enum"), default=MatterType.merits, nullable=False
    )
    status: Mapped[MatterStatus] = mapped_column(
        sa_enum(MatterStatus, "matter_status_enum"), default=MatterStatus.active, nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    workspace: Mapped["Workspace"] = relationship(back_populates="matters")  # noqa: F821
    claims: Mapped[list["ClaimInstance"]] = relationship(  # noqa: F821
        back_populates="matter", cascade="all, delete-orphan"
    )

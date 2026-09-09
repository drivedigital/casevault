"""Group B: matters and cross-matter links (Schema Draft section 6.2).

A workspace contains multiple linked matters and overlay proceedings; links
between them (overlays / shares actors / procedural dependency, ...) are
first-class rows, displayed from both directions in the UI.
"""
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import MatterStatus, MatterType, SharingPolicy
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Matter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "matters"
    __table_args__ = (
        sa.UniqueConstraint("workspace_id", "slug", name="uq_matters__workspace__slug"),
        sa.Index("ix_matters__workspace__type__status", "workspace_id", "matter_type", "status"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    matter_type: Mapped[MatterType] = mapped_column(
        sa.Enum(MatterType, name="matter_type_enum"),
        nullable=False,
        server_default=MatterType.merits.value,
    )
    status: Mapped[MatterStatus] = mapped_column(
        sa.Enum(MatterStatus, name="matter_status_enum"),
        nullable=False,
        server_default=MatterStatus.active.value,
    )
    theory_summary: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    controlling_memo_ref: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    next_work: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    jurisdiction: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default="NY")
    ai_sharing_policy: Mapped[SharingPolicy] = mapped_column(
        sa.Enum(SharingPolicy, name="sharing_policy_enum"),
        nullable=False,
        server_default=SharingPolicy.no_ai.value,
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )

    outgoing_links: Mapped[list["MatterLink"]] = relationship(
        back_populates="from_matter",
        foreign_keys="MatterLink.from_matter_id",
        cascade="all, delete-orphan",
    )
    incoming_links: Mapped[list["MatterLink"]] = relationship(
        back_populates="to_matter",
        foreign_keys="MatterLink.to_matter_id",
        cascade="all, delete-orphan",
    )


class MatterLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "matter_links"
    __table_args__ = (
        sa.CheckConstraint(
            "from_matter_id <> to_matter_id", name="ck_matter_links__not_self"
        ),
        sa.UniqueConstraint(
            "from_matter_id", "to_matter_id", "link_type", name="uq_matter_links__from__to__type"
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    from_matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    to_matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    link_type: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    from_matter: Mapped[Matter] = relationship(
        back_populates="outgoing_links", foreign_keys=[from_matter_id]
    )
    to_matter: Mapped[Matter] = relationship(
        back_populates="incoming_links", foreign_keys=[to_matter_id]
    )

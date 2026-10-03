"""Reviewed fact ledger entries (Schema Draft 6.5, trimmed: proposals/ledger arrive
with Wave 2; the claims matrix reads `fact_assertions` + `fact_support_links`)."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    FactType,
    ReviewState,
    SourceStatus,
    StrengthLabel,
    SupportOriginType,
    SupportType,
    sa_enum,
)


class FactAssertion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A reviewed statement in the trusted record."""

    __tablename__ = "fact_assertions"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    short_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    statement_text: Mapped[str] = mapped_column(Text, nullable=False)
    review_state: Mapped[ReviewState] = mapped_column(
        sa_enum(ReviewState, "review_state_enum"), default=ReviewState.accepted, nullable=False
    )
    confidence_level: Mapped[StrengthLabel | None] = mapped_column(
        sa_enum(StrengthLabel, "strength_label_enum"), nullable=True
    )
    fact_type: Mapped[FactType] = mapped_column(
        sa_enum(FactType, "fact_type_enum"), default=FactType.source_derived, nullable=False
    )
    is_material: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    support_links: Mapped[list["FactSupportLink"]] = relationship(
        back_populates="fact", cascade="all, delete-orphan"
    )


class FactSupportLink(UUIDPrimaryKeyMixin, Base):
    """Provenance edge from a fact to evidence (source / excerpt / note)."""

    __tablename__ = "fact_support_links"

    fact_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("fact_assertions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    support_origin_type: Mapped[SupportOriginType] = mapped_column(
        sa_enum(SupportOriginType, "support_origin_type_enum"),
        default=SupportOriginType.source_excerpt,
        nullable=False,
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("sources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    excerpt_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("source_excerpts.id", ondelete="SET NULL"), nullable=True
    )
    support_type: Mapped[SupportType] = mapped_column(
        sa_enum(SupportType, "support_type_enum"), default=SupportType.supports, nullable=False
    )
    strength: Mapped[StrengthLabel | None] = mapped_column(
        sa_enum(StrengthLabel, "strength_label_enum"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    fact: Mapped[FactAssertion] = relationship(back_populates="support_links")
    source: Mapped["Source | None"] = relationship("Source")  # noqa: F821
    excerpt: Mapped["SourceExcerpt | None"] = relationship("SourceExcerpt")  # noqa: F821

    # Convenience flags derived during chart assembly (not columns).
    @property
    def is_source_backed(self) -> bool:
        return self.source_id is not None and self.support_type == SupportType.supports

    @property
    def source_status_value(self) -> SourceStatus | None:
        return self.source.source_status if self.source is not None else None

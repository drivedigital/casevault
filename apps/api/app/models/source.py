"""Sources (evidence) + matter links + excerpts (Schema Draft 6.4, trimmed to
scaffold scope: page/vector tables arrive with the evidence pipeline)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import EvidenceReviewStatus, SourceStatus, SourceType, sa_enum


class CreatedOnlyMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Source(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(
            "NOT (included_flag = 1 AND excluded_flag = 1)",
            name="ck_sources_not_both_flags",
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[SourceType] = mapped_column(
        sa_enum(SourceType, "source_type_enum"), default=SourceType.other, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_status: Mapped[SourceStatus] = mapped_column(
        sa_enum(SourceStatus, "source_status_enum"), default=SourceStatus.derived, nullable=False
    )
    evidence_review_status: Mapped[EvidenceReviewStatus] = mapped_column(
        sa_enum(EvidenceReviewStatus, "evidence_review_status_enum"),
        default=EvidenceReviewStatus.uploaded,
        nullable=False,
    )
    included_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    excluded_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exclusion_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    authentication_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    restrictions_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(String(64), default="queued", nullable=False)
    ocr_status: Mapped[str] = mapped_column(String(64), default="not_started", nullable=False)

    excerpts: Mapped[list["SourceExcerpt"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class SourceMatterLink(UUIDPrimaryKeyMixin, CreatedOnlyMixin, Base):
    __tablename__ = "source_matter_links"
    __table_args__ = (UniqueConstraint("source_id", "matter_id", name="uq_source_matter"),)

    source_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)


class SourceExcerpt(UUIDPrimaryKeyMixin, CreatedOnlyMixin, Base):
    __tablename__ = "source_excerpts"

    source_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    locator_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    excerpt_type: Mapped[str] = mapped_column(String(64), default="quote", nullable=False)
    created_by: Mapped[str] = mapped_column(String(16), default="system", nullable=False)

    source: Mapped[Source] = relationship(back_populates="excerpts")

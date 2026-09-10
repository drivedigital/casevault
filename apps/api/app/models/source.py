"""Group C: sources and storage metadata (Schema Draft section 6.4).

Sources are raw evidence records: the uploaded file (or note), its storage
location, dedupe hash, review lifecycle, and pipeline state. Extracted
text lives on source_pages; user/system selections on source_excerpts.

Deferred by decision (handoff/DECISIONS.md): the VECTOR(1536) columns from
the schema draft (source_pages.embedding_vector,
source_excerpts.embedding_vector) are NOT created here. The embedding
model/provider is still an open decision; adding pgvector later is an
additive migration and keeps Phase 2 free of an extension dependency.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import EvidenceReviewStatus, SourceStatus, SourceType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.matter import Matter


class Source(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sources"
    __table_args__ = (
        sa.CheckConstraint(
            "NOT (included_flag AND excluded_flag)", name="ck_sources__not_included_and_excluded"
        ),
        sa.Index("ix_sources__sha256", "sha256"),
        sa.Index("ix_sources__workspace__type", "workspace_id", "source_type"),
        sa.Index(
            "ix_sources__workspace__review_status",
            "workspace_id",
            "evidence_review_status",
        ),
        sa.Index("ix_sources__workspace__title", "workspace_id", "title"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[SourceType] = mapped_column(
        sa.Enum(SourceType, name="source_type_enum"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(sa.String(128), nullable=True)
    storage_path: Mapped[str] = mapped_column(sa.Text, nullable=False)
    sha256: Mapped[str | None] = mapped_column(sa.CHAR(64), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(sa.BigInteger, nullable=True)
    page_count: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    source_status: Mapped[SourceStatus] = mapped_column(
        sa.Enum(SourceStatus, name="source_status_enum"),
        nullable=False,
        server_default=SourceStatus.derived.value,
    )
    evidence_review_status: Mapped[EvidenceReviewStatus] = mapped_column(
        sa.Enum(EvidenceReviewStatus, name="evidence_review_status_enum"),
        nullable=False,
        server_default=EvidenceReviewStatus.uploaded.value,
    )
    included_flag: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("false")
    )
    excluded_flag: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("false")
    )
    exclusion_reason: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    authentication_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    restrictions_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(
        sa.String(64), nullable=False, server_default="queued"
    )
    ocr_status: Mapped[str] = mapped_column(
        sa.String(64), nullable=False, server_default="not_started"
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    matter_links: Mapped[list[SourceMatterLink]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    pages: Mapped[list[SourcePage]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="SourcePage.page_number",
    )


class SourceMatterLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "source_matter_links"
    __table_args__ = (
        sa.UniqueConstraint("source_id", "matter_id", name="uq_source_matter_links__source__matter"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    link_reason: Mapped[str | None] = mapped_column(sa.String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    source: Mapped[Source] = relationship(back_populates="matter_links")
    matter: Mapped[Matter] = relationship()


class SourceMetadata(Base):
    __tablename__ = "source_metadata"

    source_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True
    )
    metadata_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    extracted_from_filename_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    external_provenance_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
        nullable=False,
    )

    source: Mapped[Source] = relationship()


class SourcePage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_pages"
    __table_args__ = (
        sa.UniqueConstraint("source_id", "page_number", name="uq_source_pages__source__page"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    page_number: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    page_label: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    layout_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    image_path: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    source: Mapped[Source] = relationship(back_populates="pages")


class SourceExcerpt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "source_excerpts"
    __table_args__ = (
        sa.Index("ix_source_excerpts__source__page_start", "source_id", "page_start"),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    page_start: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    locator_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    excerpt_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    excerpt_type: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    anchor_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    created_by: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default="system")
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

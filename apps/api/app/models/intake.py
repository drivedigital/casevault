"""Wave 2: intake core (Schema Draft section 6.5; contract
docs/contracts/wave2_intake_core.md v1.0, section 2).

Ledger rows (Sprint 4) are user work product; proposals (Sprint 5) are
AI/manual suggestions awaiting human review; fact_assertions are the intake
of reviewed statements. The review-state floor (contract section 4.1) is
enforced in the service layer: no creation path leaves a fact in
`accepted` — only an explicit approval does.

Deliberate extension: ledger_entries.tags_json is NOT in the schema draft;
PRD section 10.4 requires tag filters + bulk tagging. Stored as a JSON
array of short strings, validated in the service layer.

Deferred by contract section 2: full-text GIN indexes, embedding columns,
audit rows, soft-delete columns for facts.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import (
    FactType,
    ProposalType,
    ReviewState,
    SourceStatus,
    StrengthLabel,
    SupportType,
)
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.actor import Actor
    from app.models.source import Source, SourceExcerpt


class LedgerEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single row of the source ledger (Schema Draft 6.5)."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        # Partial unique: one external ledger id per matter, only for rows
        # that actually carry one.
        sa.Index(
            "uq_ledger_entries__matter__external_id",
            "matter_id",
            "external_ledger_id",
            unique=True,
            postgresql_where=sa.text("external_ledger_id IS NOT NULL"),
        ),
        sa.Index("ix_ledger_entries__matter__date_start", "matter_id", "date_start"),
        sa.Index(
            "ix_ledger_entries__workspace__source_status",
            "workspace_id",
            "source_status",
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    matter_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=True
    )
    external_ledger_id: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    date_start: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    date_end: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    date_text_raw: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    fact_short_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    fact_statement: Mapped[str] = mapped_column(sa.Text, nullable=False)
    claim_use_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    relief_use_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    source_path_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    source_locator_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    # Reuses source_status_enum created by migration 0003.
    source_status: Mapped[SourceStatus | None] = mapped_column(
        sa.Enum(SourceStatus, name="source_status_enum"), nullable=True
    )
    authentication_or_witness: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    confidence_level: Mapped[StrengthLabel | None] = mapped_column(
        sa.Enum(StrengthLabel, name="strength_label_enum"), nullable=True
    )
    verification_task_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    restrictions_or_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    linked_source_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    # Deliberate extension (PRD 10.4): JSON array of short tag strings.
    tags_json: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=sa.text("'[]'::jsonb")
    )

    linked_source: Mapped[Source | None] = relationship()


class Proposal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An AI/manual suggestion awaiting human review (Schema Draft 6.5)."""

    __tablename__ = "proposals"
    __table_args__ = (
        sa.Index("ix_proposals__matter__review_state", "matter_id", "review_state"),
        sa.Index("ix_proposals__type__review_state", "proposal_type", "review_state"),
        sa.Index("ix_proposals__source_id", "source_id"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    matter_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=True
    )
    proposal_type: Mapped[ProposalType] = mapped_column(
        sa.Enum(ProposalType, name="proposal_type_enum"), nullable=False
    )
    review_state: Mapped[ReviewState] = mapped_column(
        sa.Enum(ReviewState, name="review_state_enum"),
        nullable=False,
        server_default=ReviewState.proposed.value,
    )
    title: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    proposed_text: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    proposed_structured_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb")
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=True
    )
    excerpt_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("source_excerpts.id", ondelete="SET NULL"), nullable=True
    )
    confidence_score: Mapped[Decimal | None] = mapped_column(
        sa.Numeric(5, 4), nullable=True
    )
    created_by_system: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("true")
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    review_notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    source: Mapped[Source | None] = relationship()
    excerpt: Mapped[SourceExcerpt | None] = relationship()


class FactAssertion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A reviewed statement; `accepted` only through explicit approval."""

    __tablename__ = "fact_assertions"
    __table_args__ = (
        sa.Index(
            "ix_fact_assertions__matter__review_state", "matter_id", "review_state"
        ),
        sa.Index(
            "ix_fact_assertions__workspace__is_material", "workspace_id", "is_material"
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    short_label: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    statement_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    review_state: Mapped[ReviewState] = mapped_column(
        sa.Enum(ReviewState, name="review_state_enum"),
        nullable=False,
        server_default=ReviewState.proposed.value,
    )
    confidence_level: Mapped[StrengthLabel | None] = mapped_column(
        sa.Enum(StrengthLabel, name="strength_label_enum"), nullable=True
    )
    fact_type: Mapped[FactType] = mapped_column(
        sa.Enum(FactType, name="fact_type_enum"),
        nullable=False,
        server_default=FactType.source_derived.value,
    )
    is_material: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("false")
    )
    created_from_proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("proposals.id", ondelete="SET NULL"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    # Plain column (no ORM self-relationship): consumers look the row up
    # explicitly when a supersession chain needs walking.
    supersedes_fact_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("fact_assertions.id", ondelete="SET NULL"), nullable=True
    )

    source_links: Mapped[list[FactSourceLink]] = relationship(
        back_populates="fact", cascade="all, delete-orphan"
    )
    actor_links: Mapped[list[FactActorLink]] = relationship(
        back_populates="fact", cascade="all, delete-orphan"
    )
    created_from_proposal: Mapped[Proposal | None] = relationship()


class FactSourceLink(UUIDPrimaryKeyMixin, Base):
    """Fact ↔ source/excerpt support link (Schema Draft 6.5).

    NULLS NOT DISTINCT (Postgres 15+): a NULL excerpt_id is a value, so two
    excerpt-less links with the same support type cannot duplicate.
    """

    __tablename__ = "fact_source_links"
    __table_args__ = (
        sa.UniqueConstraint(
            "fact_id",
            "source_id",
            "excerpt_id",
            "support_type",
            name="uq_fact_source_links__fact__source__excerpt__support",
            postgresql_nulls_not_distinct=True,
        ),
    )

    fact_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("fact_assertions.id", ondelete="CASCADE"), nullable=False
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    excerpt_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("source_excerpts.id", ondelete="SET NULL"), nullable=True
    )
    support_type: Mapped[SupportType] = mapped_column(
        sa.Enum(SupportType, name="support_type_enum"),
        nullable=False,
        server_default=SupportType.supports.value,
    )
    strength: Mapped[StrengthLabel | None] = mapped_column(
        sa.Enum(StrengthLabel, name="strength_label_enum"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    fact: Mapped[FactAssertion] = relationship(back_populates="source_links")
    source: Mapped[Source | None] = relationship()
    excerpt: Mapped[SourceExcerpt | None] = relationship()


class FactActorLink(UUIDPrimaryKeyMixin, Base):
    """Fact ↔ actor link with an optional role (Schema Draft 6.5).

    NULLS NOT DISTINCT (Postgres 15+): two role-less links for the same
    fact/actor cannot duplicate.
    """

    __tablename__ = "fact_actor_links"
    __table_args__ = (
        sa.UniqueConstraint(
            "fact_id",
            "actor_id",
            "role_in_fact",
            name="uq_fact_actor_links__fact__actor__role",
            postgresql_nulls_not_distinct=True,
        ),
    )

    fact_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("fact_assertions.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("actors.id", ondelete="CASCADE"), nullable=False
    )
    role_in_fact: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    fact: Mapped[FactAssertion] = relationship(back_populates="actor_links")
    actor: Mapped[Actor | None] = relationship()

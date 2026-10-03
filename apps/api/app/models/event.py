"""Wave 3 (WS-CHRONO): events / chronology (Schema Draft §6.6, Tech Spec
Group G).

Events are the chronology spine: dated nodes that group trusted facts and
actors. Per the Schema Draft, `events.review_state` defaults to `accepted`
(events are user/AI work product created *from* the review pipeline, not
subjects of the fact review-state floor — contract wave2_intake_core.md §4.1
binds facts only).

Chronology invariant (WS-CHRONO brief §1): the trusted set an event may link
is `fact_assertions.review_state = 'accepted'` — enforced in the events
router, the only place event_fact_links rows are created.

Deliberate scope note: Schema Draft §6.6 also lists `event_tags`; the Wave 3
migration reservation for 0005 covers `events`, `event_fact_links`, and
`event_actor_links` only, so event_tags is deferred (recorded in
handoff/notes/WS-CHRONO.md).

`DatePrecision` lives here rather than in `app.models.enums` because
enums.py is a hub file with a single owner per wave (AGENT_POLICY §2.3) and
the Wave 3 brief did not assign it to this workstream. The Postgres type
name (`date_precision_enum`, Schema Draft §5.14) is unchanged.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ReviewState, StrengthLabel, StrEnum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.actor import Actor
    from app.models.intake import FactAssertion, Proposal


class DatePrecision(StrEnum):
    """Schema Draft §5.14 `date_precision_enum`."""

    exact = "exact"
    range = "range"
    approximate = "approximate"
    unknown = "unknown"


# event_fact_links.relationship_type is VARCHAR(32) in the Schema Draft
# (§6.6) with these canonical values (Tech Spec Group G); validated in the
# API schema layer, not a native PG enum.
EVENT_FACT_RELATIONSHIP_TYPES = [
    "supports_event",
    "contradicts_event",
    "context_only",
]

# events.significance_level is VARCHAR(32) ("high/medium/low or tag" per the
# Schema Draft); these are the canonical UI values, free-form tags allowed.
SIGNIFICANCE_LEVELS = ["high", "medium", "low"]


class Event(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        sa.Index("ix_events__matter__date_start", "matter_id", "date_start"),
        sa.Index("ix_events__matter__review_state", "matter_id", "review_state"),
        # Full-text index (Schema Draft §6.6: "full-text on title,
        # description") as a GIN expression index so model metadata and
        # migration 0005 stay in sync.
        sa.Index(
            "ix_events__fulltext",
            sa.text(
                "to_tsvector('english', coalesce(title, '') || ' ' || "
                "coalesce(description, ''))"
            ),
            postgresql_using="gin",
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    date_start: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    date_end: Mapped[date | None] = mapped_column(sa.Date, nullable=True)
    date_precision: Mapped[DatePrecision] = mapped_column(
        sa.Enum(DatePrecision, name="date_precision_enum"),
        nullable=False,
        server_default=DatePrecision.unknown.value,
    )
    date_text_raw: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    significance_level: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)
    review_state: Mapped[ReviewState] = mapped_column(
        sa.Enum(ReviewState, name="review_state_enum"),
        nullable=False,
        server_default=ReviewState.accepted.value,
    )
    confidence_level: Mapped[StrengthLabel | None] = mapped_column(
        sa.Enum(StrengthLabel, name="strength_label_enum"),
        nullable=True,
    )
    created_from_proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("proposals.id", ondelete="SET NULL"), nullable=True
    )

    fact_links: Mapped[list[EventFactLink]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    actor_links: Mapped[list[EventActorLink]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    created_from_proposal: Mapped[Proposal | None] = relationship()


class EventFactLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "event_fact_links"
    __table_args__ = (
        sa.UniqueConstraint(
            "event_id",
            "fact_id",
            "relationship_type",
            name="uq_event_fact_links__event__fact__relationship",
        ),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    fact_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("fact_assertions.id", ondelete="CASCADE"), nullable=False
    )
    relationship_type: Mapped[str] = mapped_column(
        sa.String(32),
        nullable=False,
        server_default=EVENT_FACT_RELATIONSHIP_TYPES[0],
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    event: Mapped[Event] = relationship(back_populates="fact_links")
    fact: Mapped[FactAssertion | None] = relationship()


class EventActorLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "event_actor_links"
    # NULLS NOT DISTINCT (Postgres 15+, same pattern as the Wave 2 fact
    # links): two role-less links for the same event/actor cannot duplicate.
    __table_args__ = (
        sa.UniqueConstraint(
            "event_id",
            "actor_id",
            "role_in_event",
            name="uq_event_actor_links__event__actor__role",
            postgresql_nulls_not_distinct=True,
        ),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("actors.id", ondelete="CASCADE"), nullable=False
    )
    role_in_event: Mapped[str | None] = mapped_column(sa.String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )

    event: Mapped[Event] = relationship(back_populates="actor_links")
    actor: Mapped[Actor | None] = relationship()
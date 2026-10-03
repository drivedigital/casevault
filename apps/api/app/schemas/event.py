"""Chronology / events API schemas — Wave 3 WS-CHRONO.

Spec sources: Schema Draft §6.6 (`events`, `event_fact_links`,
`event_actor_links`), §5.14 (`date_precision_enum`) · Tech Spec Group G and
"Chronology" endpoint list · UX Spec Screen 8 (Chronology Workspace).

Server-owned fields (mirroring the Wave 2 intake pattern, contract
wave2_intake_core.md §4.1): `review_state` and `created_from_proposal_id`
cannot be set in create/patch bodies — unknown or forbidden keys are
rejected with 422 via ``extra="forbid"``.

Chronology invariant (brief §1): event_fact_links may only reference facts
in `review_state = 'accepted'`; that floor is enforced in the router/service
layer with 409, not here.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import ReviewState, StrengthLabel
from app.models.event import (
    EVENT_FACT_RELATIONSHIP_TYPES,
    DatePrecision,
)

__all__ = [
    "EVENT_FACT_RELATIONSHIP_TYPES",
    "ChronologyFeed",
    "DatePrecision",
    "EventActorLinkCreate",
    "EventActorLinkOut",
    "EventCreate",
    "EventFactLinkCreate",
    "EventFactLinkOut",
    "EventOut",
    "EventPage",
    "EventUpdate",
    "ProposalEventRef",
]


# --- shared sub-objects -------------------------------------------------------


class ProposalEventRef(BaseModel):
    """`created_from_proposal: {id, proposal_type} | null` on EventOut."""

    id: uuid.UUID
    proposal_type: str


# --- events -------------------------------------------------------------------


class EventCreate(BaseModel):
    """POST /events. Lands with the Schema Draft defaults: review_state
    `accepted`, date_precision `unknown` unless supplied."""

    model_config = ConfigDict(extra="forbid")

    matter_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    date_start: date | None = None
    date_end: date | None = None
    date_precision: DatePrecision = DatePrecision.unknown
    date_text_raw: str | None = None
    significance_level: str | None = Field(default=None, max_length=32)
    confidence_level: StrengthLabel | None = None

    @model_validator(mode="after")
    def _check_date_consistency(self) -> EventCreate:
        if self.date_start and self.date_end and self.date_end < self.date_start:
            raise ValueError("`date_end` cannot be earlier than `date_start`.")
        if self.date_precision == DatePrecision.range and not (
            self.date_start and self.date_end
        ):
            raise ValueError(
                "`date_precision=range` requires both `date_start` and `date_end`."
            )
        return self


class EventUpdate(BaseModel):
    """PATCH /events/{id} — editable columns only; `review_state` and
    `created_from_proposal_id` are server-owned (422 on presence, via
    extra=forbid). NOT NULL columns reject explicit null with 422; nullable
    columns accept null to clear (same convention as Wave 2 FactUpdate)."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    date_start: date | None = None
    date_end: date | None = None
    date_precision: DatePrecision | None = None
    date_text_raw: str | None = None
    significance_level: str | None = Field(default=None, max_length=32)
    confidence_level: StrengthLabel | None = None

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_null_on_not_null_columns(cls, data):
        if isinstance(data, dict):
            for field in ("title", "date_precision"):
                if field in data and data[field] is None:
                    raise ValueError(
                        f"`{field}` is not nullable; omit it instead of sending null."
                    )
        return data


class EventFactLinkOut(BaseModel):
    """event_fact_links row + denormalized fact fields so the chronology UI
    can render support without a second round-trip per link."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    fact_id: uuid.UUID
    relationship_type: str
    created_at: datetime
    fact_short_label: str | None = None
    fact_statement: str | None = None
    fact_review_state: ReviewState | None = None


class EventFactLinkCreate(BaseModel):
    """POST /events/{id}/facts — the fact must exist in the same workspace
    and be `review_state = accepted` (brief invariant §1); anything else is
    404/409 from the router."""

    model_config = ConfigDict(extra="forbid")

    fact_id: uuid.UUID
    relationship_type: str = EVENT_FACT_RELATIONSHIP_TYPES[0]

    @model_validator(mode="after")
    def _check_relationship_type(self) -> EventFactLinkCreate:
        if self.relationship_type not in EVENT_FACT_RELATIONSHIP_TYPES:
            raise ValueError(
                "`relationship_type` must be one of: "
                + ", ".join(EVENT_FACT_RELATIONSHIP_TYPES)
            )
        return self


class EventActorLinkOut(BaseModel):
    """event_actor_links row + denormalized actor name."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    actor_id: uuid.UUID
    role_in_event: str | None
    created_at: datetime
    actor_name: str | None = None


class EventActorLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_id: uuid.UUID
    role_in_event: str | None = Field(default=None, max_length=64)


class EventOut(BaseModel):
    """All §6.6 `events` columns + link collections + proposal ref."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    matter_id: uuid.UUID
    title: str
    description: str | None
    date_start: date | None
    date_end: date | None
    date_precision: DatePrecision
    date_text_raw: str | None
    significance_level: str | None
    review_state: ReviewState
    confidence_level: StrengthLabel | None
    created_from_proposal_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    fact_links: list[EventFactLinkOut] = Field(default_factory=list)
    actor_links: list[EventActorLinkOut] = Field(default_factory=list)
    created_from_proposal: ProposalEventRef | None = None


class EventPage(BaseModel):
    """{items,total,limit,offset} envelope, same shape as FactPage."""

    items: list[EventOut]
    total: int
    limit: int
    offset: int


class ChronologyFeed(BaseModel):
    """GET /matters/{id}/chronology — the timeline feed for one matter:
    events ordered by date (undated last), plus the count of trusted
    (`accepted`) facts that are not yet attached to any event, which the UI
    offers as event-creation candidates (UX Spec Screen 8: "create event
    from selected fact(s)")."""

    matter_id: uuid.UUID
    events: list[EventOut]
    unlinked_accepted_fact_count: int
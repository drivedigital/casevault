"""Chronology / events endpoints — Wave 3 WS-CHRONO.

Tech Spec "Chronology" endpoint list: GET/POST /events, GET/PATCH
/events/{id}, POST /events/{id}/facts, GET /matters/{id}/chronology —
plus the additive link-management routes that mirror the shipped facts
router pattern (GET links, DELETE /event-*-links/{id}) and DELETE
/events/{id} (needed by UX Spec Screen 8 "merge duplicate events"; the
Tech Spec list is a minimum surface, not exhaustive).

Chronology invariant (WS-CHRONO brief §1, contract wave2_intake_core.md
§4.1): the ONLY facts an event may link are `review_state = 'accepted'`.
Linking any other fact is 409. Events themselves land `accepted` per the
Schema Draft §6.6 default (the review-state floor binds facts, not events).

Service functions live in this module: `app/services/event_service.py` is
not part of the WS-CHRONO write set (brief §Deliverables), and the router
module is owned exclusively by this workstream.
"""
from __future__ import annotations

import uuid
from datetime import date

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.actor import Actor
from app.models.enums import ReviewState
from app.models.event import DatePrecision, Event, EventActorLink, EventFactLink
from app.models.intake import FactAssertion, Proposal
from app.models.matter import Matter
from app.routers.matters import resolve_workspace_id
from app.schemas.event import (
    ChronologyFeed,
    EventActorLinkCreate,
    EventActorLinkOut,
    EventCreate,
    EventFactLinkCreate,
    EventFactLinkOut,
    EventOut,
    EventPage,
    EventUpdate,
    ProposalEventRef,
)

router = APIRouter(tags=["events"])


# --- helpers ------------------------------------------------------------------


def get_event(db: Session, workspace_id: uuid.UUID, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None or event.workspace_id != workspace_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Event not found.")
    return event


def _require_matter(db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID) -> Matter:
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Matter not found.")
    return matter


def fact_link_out(db: Session, link: EventFactLink) -> EventFactLinkOut:
    """Link row + denormalized fact fields for chronology rendering."""
    fact = db.get(FactAssertion, link.fact_id)
    return EventFactLinkOut(
        **{c.name: getattr(link, c.name) for c in link.__table__.columns},
        fact_short_label=fact.short_label if fact is not None else None,
        fact_statement=fact.statement_text if fact is not None else None,
        fact_review_state=fact.review_state if fact is not None else None,
    )


def actor_link_out(db: Session, link: EventActorLink) -> EventActorLinkOut:
    actor = db.get(Actor, link.actor_id)
    return EventActorLinkOut(
        **{c.name: getattr(link, c.name) for c in link.__table__.columns},
        actor_name=actor.display_name if actor is not None else None,
    )


def event_out(db: Session, event: Event) -> EventOut:
    fact_links = list(
        db.scalars(
            select(EventFactLink)
            .where(EventFactLink.event_id == event.id)
            .order_by(EventFactLink.created_at)
        )
    )
    actor_links = list(
        db.scalars(
            select(EventActorLink)
            .where(EventActorLink.event_id == event.id)
            .order_by(EventActorLink.created_at)
        )
    )
    proposal_ref = None
    if event.created_from_proposal_id is not None:
        proposal = db.get(Proposal, event.created_from_proposal_id)
        if proposal is not None:
            proposal_ref = ProposalEventRef(
                id=proposal.id, proposal_type=str(proposal.proposal_type)
            )
    return EventOut(
        **{c.name: getattr(event, c.name) for c in event.__table__.columns},
        fact_links=[fact_link_out(db, link) for link in fact_links],
        actor_links=[actor_link_out(db, link) for link in actor_links],
        created_from_proposal=proposal_ref,
    )


def _validate_date_window(
    date_start: date | None, date_end: date | None, precision: DatePrecision
) -> None:
    from fastapi import HTTPException

    if date_start and date_end and date_end < date_start:
        raise HTTPException(
            status_code=422, detail="`date_end` cannot be earlier than `date_start`."
        )
    if precision == DatePrecision.range and not (date_start and date_end):
        raise HTTPException(
            status_code=422,
            detail="`date_precision=range` requires both `date_start` and `date_end`.",
        )


def _timeline_order(stmt):
    """Chronological order: dated events first by start date, undated last."""
    return stmt.order_by(
        sa.asc(Event.date_start).nulls_last(),
        Event.created_at.desc(),
        Event.id,
    )


# --- events CRUD ----------------------------------------------------------------


@router.get("/events", response_model=EventPage)
def list_events(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    review_state: list[ReviewState] | None = Query(default=None),
    significance_level: str | None = Query(default=None, max_length=32),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    stmt = select(Event).where(Event.workspace_id == ws_id)
    if matter_id is not None:
        stmt = stmt.where(Event.matter_id == matter_id)
    if review_state:
        stmt = stmt.where(Event.review_state.in_(review_state))
    if significance_level:
        stmt = stmt.where(Event.significance_level == significance_level)
    if date_from is not None:
        stmt = stmt.where(func.coalesce(Event.date_end, Event.date_start) >= date_from)
    if date_to is not None:
        stmt = stmt.where(func.coalesce(Event.date_start, Event.date_end) <= date_to)
    if q:
        pattern = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            sa.or_(
                func.lower(Event.title).like(pattern),
                func.lower(func.coalesce(Event.description, "")).like(pattern),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(_timeline_order(stmt).limit(limit).offset(offset)))
    return EventPage(
        items=[event_out(db, e) for e in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(
    payload: EventCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    _require_matter(db, ws_id, payload.matter_id)
    event = Event(workspace_id=ws_id, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_out(db, event)


@router.get("/events/{event_id}", response_model=EventOut)
def get_event_route(
    event_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return event_out(db, get_event(db, ws_id, event_id))


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: uuid.UUID,
    payload: EventUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    updates = payload.model_dump(exclude_unset=True)
    merged = {
        "date_start": event.date_start,
        "date_end": event.date_end,
        "date_precision": event.date_precision,
    } | {k: updates[k] for k in ("date_start", "date_end", "date_precision") if k in updates}
    _validate_date_window(merged["date_start"], merged["date_end"], merged["date_precision"])
    for field, value in updates.items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event_out(db, event)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    db.delete(event)
    db.commit()
    return Response(status_code=204)


# --- event ↔ fact links (chronology invariant lives here) ------------------------


@router.post("/events/{event_id}/facts", response_model=EventFactLinkOut, status_code=201)
def link_event_fact(
    event_id: uuid.UUID,
    payload: EventFactLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    fact = db.get(FactAssertion, payload.fact_id)
    if fact is None or fact.workspace_id != ws_id:
        raise HTTPException(status_code=404, detail="Fact not found.")
    # Brief invariant §1: chronology consumes facts in review_state=accepted
    # (contract wave2_intake_core.md §4.1: `accepted` is the trusted set).
    if fact.review_state != ReviewState.accepted:
        raise HTTPException(
            status_code=409,
            detail=(
                "Only facts with review_state=accepted can be linked to events "
                f"(this fact is `{fact.review_state.value}`). Approve it first: "
                "POST /facts/{id}/approve."
            ),
        )
    if fact.matter_id != event.matter_id:
        raise HTTPException(
            status_code=409,
            detail="Fact belongs to a different matter than the event.",
        )
    link = EventFactLink(
        event_id=event.id,
        fact_id=fact.id,
        relationship_type=payload.relationship_type,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This fact is already linked to the event with the same relationship type.",
        ) from None
    db.refresh(link)
    return fact_link_out(db, link)


@router.get("/events/{event_id}/facts", response_model=list[EventFactLinkOut])
def list_event_fact_links(
    event_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    links = db.scalars(
        select(EventFactLink)
        .where(EventFactLink.event_id == event.id)
        .order_by(EventFactLink.created_at)
    )
    return [fact_link_out(db, link) for link in links]


@router.delete("/event-fact-links/{link_id}", status_code=204)
def delete_event_fact_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    ws_id = resolve_workspace_id(db, workspace_id)
    link = db.get(EventFactLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Event fact link not found.")
    get_event(db, ws_id, link.event_id)  # workspace scope check
    db.delete(link)
    db.commit()
    return Response(status_code=204)


# --- event ↔ actor links ---------------------------------------------------------


@router.post("/events/{event_id}/actors", response_model=EventActorLinkOut, status_code=201)
def link_event_actor(
    event_id: uuid.UUID,
    payload: EventActorLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    actor = db.get(Actor, payload.actor_id)
    if actor is None or actor.workspace_id != ws_id:
        raise HTTPException(status_code=404, detail="Actor not found.")
    link = EventActorLink(
        event_id=event.id, actor_id=actor.id, role_in_event=payload.role_in_event
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This actor is already linked to the event with the same role.",
        ) from None
    db.refresh(link)
    return actor_link_out(db, link)


@router.get("/events/{event_id}/actors", response_model=list[EventActorLinkOut])
def list_event_actor_links(
    event_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    event = get_event(db, ws_id, event_id)
    links = db.scalars(
        select(EventActorLink)
        .where(EventActorLink.event_id == event.id)
        .order_by(EventActorLink.created_at)
    )
    return [actor_link_out(db, link) for link in links]


@router.delete("/event-actor-links/{link_id}", status_code=204)
def delete_event_actor_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    ws_id = resolve_workspace_id(db, workspace_id)
    link = db.get(EventActorLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Event actor link not found.")
    get_event(db, ws_id, link.event_id)  # workspace scope check
    db.delete(link)
    db.commit()
    return Response(status_code=204)


# --- matter chronology feed ------------------------------------------------------


@router.get("/matters/{matter_id}/chronology", response_model=ChronologyFeed)
def matter_chronology(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Timeline feed for one matter (Tech Spec "Chronology"): events in
    chronological order (undated last) + the count of trusted facts not yet
    attached to any event of this matter (event-creation candidates, UX Spec
    Screen 8)."""
    ws_id = resolve_workspace_id(db, workspace_id)
    _require_matter(db, ws_id, matter_id)
    events = list(
        db.scalars(
            _timeline_order(select(Event).where(Event.matter_id == matter_id))
        )
    )
    linked_fact_ids = (
        select(EventFactLink.fact_id)
        .join(Event, Event.id == EventFactLink.event_id)
        .where(Event.matter_id == matter_id)
    )
    unlinked = db.scalar(
        select(func.count())
        .select_from(FactAssertion)
        .where(
            FactAssertion.matter_id == matter_id,
            FactAssertion.workspace_id == ws_id,
            FactAssertion.review_state == ReviewState.accepted,
            FactAssertion.id.not_in(linked_fact_ids),
        )
    ) or 0
    return ChronologyFeed(
        matter_id=matter_id,
        events=[event_out(db, e) for e in events],
        unlinked_accepted_fact_count=unlinked,
    )


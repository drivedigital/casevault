"""Trusted-fact service — Wave 2 contract §4.1/§4.3.

The review-state floor lives here: `create` always lands `proposed`, `update`
can never touch `review_state` (the schema also rejects it, §4.1), `approve`
is the ONLY path to `accepted`, and `set_review_state` refuses `accepted` with
409 and treats superseded facts as immutable. Link uniques are enforced by the
`NULLS NOT DISTINCT` constraints from migration 0004 (contract §2) and surface
as 409 here.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.actor import Actor
from app.models.enums import ReviewState
from app.models.intake import FactActorLink, FactAssertion, FactSourceLink, Proposal
from app.models.matter import Matter
from app.models.source import Source, SourceExcerpt
from app.schemas.intake import (
    FactActorLinkCreate,
    FactActorLinkOut,
    FactCreate,
    FactOut,
    FactReviewStateChange,
    FactSourceLinkCreate,
    FactSourceLinkOut,
    FactUpdate,
    ProposalRef,
    SupersedeRequest,
)
from app.services import identity_service

# Targets the /review-state route accepts (§4.3). `accepted` is deliberately
# absent from the allowed set and fails 409 with a pointer to /approve;
# `proposed` is the creation state and is never a transition target either.
_REVIEW_STATE_ALLOWED = {
    ReviewState.rejected,
    ReviewState.deferred,
    ReviewState.uncertain,
    ReviewState.disputed,
    ReviewState.accepted_with_edits,
    ReviewState.superseded,
}


def get_fact(db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID) -> FactAssertion:
    fact = db.get(FactAssertion, fact_id)
    if fact is None or fact.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Fact not found.")
    return fact


def _require_matter(db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID) -> Matter:
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Matter not found.")
    return matter


def source_link_out(db: Session, link: FactSourceLink) -> FactSourceLinkOut:
    """A §2 link row plus the denormalized `source_title` for inbox rendering."""
    source = db.get(Source, link.source_id)
    return FactSourceLinkOut(
        **{c.name: getattr(link, c.name) for c in link.__table__.columns},
        source_title=source.title if source is not None else None,
    )


def actor_link_out(db: Session, link: FactActorLink) -> FactActorLinkOut:
    actor = db.get(Actor, link.actor_id)
    return FactActorLinkOut(
        **{c.name: getattr(link, c.name) for c in link.__table__.columns},
        actor_name=actor.display_name if actor is not None else None,
    )


def fact_out(db: Session, fact: FactAssertion) -> FactOut:
    """FactOut with the §4.3 link collections and creating-proposal ref."""
    source_links = list(
        db.scalars(
            select(FactSourceLink)
            .where(FactSourceLink.fact_id == fact.id)
            .order_by(FactSourceLink.created_at)
        )
    )
    actor_links = list(
        db.scalars(
            select(FactActorLink)
            .where(FactActorLink.fact_id == fact.id)
            .order_by(FactActorLink.created_at)
        )
    )
    proposal_ref = None
    if fact.created_from_proposal_id is not None:
        proposal = db.get(Proposal, fact.created_from_proposal_id)
        if proposal is not None:
            proposal_ref = ProposalRef(id=proposal.id, proposal_type=proposal.proposal_type)
    return FactOut(
        **{c.name: getattr(fact, c.name) for c in fact.__table__.columns},
        source_links=[source_link_out(db, link) for link in source_links],
        actor_links=[actor_link_out(db, link) for link in actor_links],
        created_from_proposal=proposal_ref,
    )


def list_facts(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    matter_id: uuid.UUID | None = None,
    review_states: list[ReviewState] | None = None,
    fact_type=None,
    is_material: bool | None = None,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FactAssertion], int]:
    stmt = select(FactAssertion).where(FactAssertion.workspace_id == workspace_id)
    if matter_id is not None:
        stmt = stmt.where(FactAssertion.matter_id == matter_id)
    if review_states:
        stmt = stmt.where(FactAssertion.review_state.in_(review_states))
    if fact_type is not None:
        stmt = stmt.where(FactAssertion.fact_type == fact_type)
    if is_material is not None:
        stmt = stmt.where(FactAssertion.is_material.is_(is_material))
    if query:
        stmt = stmt.where(func.lower(FactAssertion.statement_text).like(f"%{query.strip().lower()}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(FactAssertion.created_at.desc(), FactAssertion.id).limit(limit).offset(offset)
        )
    )
    return rows, total


def create_fact(
    db: Session, workspace_id: uuid.UUID, payload: FactCreate
) -> FactAssertion:
    """POST /facts — manual facts enter the review floor at `proposed`, always
    (§4.1). Approval is a separate, explicit action."""
    _require_matter(db, workspace_id, payload.matter_id)
    user = identity_service.get_local_user(db)
    fact = FactAssertion(
        workspace_id=workspace_id,
        matter_id=payload.matter_id,
        short_label=payload.short_label,
        statement_text=payload.statement_text.strip(),
        review_state=ReviewState.proposed,
        confidence_level=payload.confidence_level,
        fact_type=payload.fact_type,
        is_material=payload.is_material,
        created_by_user_id=user.id,
    )
    if not fact.statement_text:
        raise HTTPException(status_code=422, detail="statement_text must not be blank.")
    db.add(fact)
    db.commit()
    db.refresh(fact)
    return fact


def update_fact(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID, payload: FactUpdate
) -> FactAssertion:
    """PATCH /facts/{id} — content fields only; `review_state` can never be
    reached through this route (forbidden in the schema, §4.1)."""
    fact = get_fact(db, workspace_id, fact_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "statement_text":
            value = value.strip()
            if not value:
                raise HTTPException(status_code=422, detail="statement_text must not be blank.")
        setattr(fact, field, value)
    db.commit()
    db.refresh(fact)
    return fact


def approve_fact(db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID) -> FactAssertion:
    """The ONLY route to `accepted` (§4.1). Stamps approved_by/approved_at;
    409 if already accepted; superseded facts are immutable."""
    fact = get_fact(db, workspace_id, fact_id)
    if fact.review_state == ReviewState.accepted:
        raise HTTPException(status_code=409, detail="Fact is already accepted.")
    if fact.review_state == ReviewState.superseded:
        raise HTTPException(status_code=409, detail="Superseded facts cannot be re-approved.")
    fact.review_state = ReviewState.accepted
    fact.approved_at = datetime.now(timezone.utc)
    fact.approved_by_user_id = identity_service.get_local_user(db).id
    db.commit()
    db.refresh(fact)
    return fact


def set_review_state(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID, payload: FactReviewStateChange
) -> FactAssertion:
    """POST /facts/{id}/review-state (§4.3). `accepted` here → 409 (only
    /approve may set it). A superseded fact may not be re-transitioned → 409.
    `notes` is accepted for UI compatibility but has no storage until
    Migration 010's audit rows (deferred by contract §2) — it is not persisted."""
    fact = get_fact(db, workspace_id, fact_id)
    if payload.review_state == ReviewState.accepted:
        raise HTTPException(
            status_code=409,
            detail="`accepted` may only be set via POST /facts/{id}/approve.",
        )
    if payload.review_state not in _REVIEW_STATE_ALLOWED:
        raise HTTPException(
            status_code=409,
            detail=f"`{payload.review_state.value}` is not a valid review-state transition target.",
        )
    if fact.review_state == ReviewState.superseded:
        raise HTTPException(status_code=409, detail="Superseded facts are immutable.")
    fact.review_state = payload.review_state
    db.commit()
    db.refresh(fact)
    return fact


def supersede_fact(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID, payload: SupersedeRequest
) -> tuple[FactAssertion, FactAssertion]:
    """POST /facts/{id}/supersede — new fact starts `proposed` with
    supersedes_fact_id set; the old fact moves to `superseded` (§4.3)."""
    old = get_fact(db, workspace_id, fact_id)
    if old.review_state == ReviewState.superseded:
        raise HTTPException(status_code=409, detail="Fact is already superseded.")
    statement = payload.statement_text.strip()
    if not statement:
        raise HTTPException(status_code=422, detail="statement_text must not be blank.")
    user = identity_service.get_local_user(db)
    new = FactAssertion(
        workspace_id=workspace_id,
        matter_id=old.matter_id,
        short_label=payload.short_label if payload.short_label is not None else old.short_label,
        statement_text=statement,
        review_state=ReviewState.proposed,
        confidence_level=(
            payload.confidence_level if payload.confidence_level is not None else old.confidence_level
        ),
        fact_type=payload.fact_type if payload.fact_type is not None else old.fact_type,
        is_material=old.is_material,
        created_by_user_id=user.id,
        supersedes_fact_id=old.id,
    )
    old.review_state = ReviewState.superseded
    db.add(new)
    db.commit()
    db.refresh(new)
    db.refresh(old)
    return old, new


# --- fact <-> source links ----------------------------------------------------


def _new_source_link(db: Session, fact_id: uuid.UUID, payload: FactSourceLinkCreate) -> FactSourceLink:
    link = FactSourceLink(
        fact_id=fact_id,
        source_id=payload.source_id,
        excerpt_id=payload.excerpt_id,
        support_type=payload.support_type,
        strength=payload.strength,
        notes=payload.notes,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An identical fact/source link already exists.",
        ) from None
    db.refresh(link)
    return link


def add_source_link(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID, payload: FactSourceLinkCreate
) -> FactSourceLink:
    fact = get_fact(db, workspace_id, fact_id)
    source = db.get(Source, payload.source_id)
    if source is None or source.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Source not found.")
    if payload.excerpt_id is not None:
        excerpt = db.get(SourceExcerpt, payload.excerpt_id)
        if excerpt is None:
            raise HTTPException(status_code=404, detail="Excerpt not found.")
        if excerpt.source_id != source.id:
            raise HTTPException(
                status_code=422, detail="Excerpt belongs to a different source."
            )
    return _new_source_link(db, fact.id, payload)


def list_source_links(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID
) -> list[FactSourceLinkOut]:
    get_fact(db, workspace_id, fact_id)
    links = db.scalars(
        select(FactSourceLink)
        .where(FactSourceLink.fact_id == fact_id)
        .order_by(FactSourceLink.created_at)
    )
    return [source_link_out(db, link) for link in links]


def delete_source_link(db: Session, workspace_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = db.get(FactSourceLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found.")
    # scope through the parent fact (no reliance on model relationships)
    fact = db.get(FactAssertion, link.fact_id)
    if fact is None or fact.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Link not found.")
    db.delete(link)
    db.commit()


# --- fact <-> actor links -------------------------------------------------------


def add_actor_link(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID, payload: FactActorLinkCreate
) -> FactActorLink:
    fact = get_fact(db, workspace_id, fact_id)
    actor = db.get(Actor, payload.actor_id)
    if actor is None or actor.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Actor not found.")
    link = FactActorLink(
        fact_id=fact.id, actor_id=actor.id, role_in_fact=payload.role_in_fact
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An identical fact/actor link already exists.",
        ) from None
    db.refresh(link)
    return link


def list_actor_links(
    db: Session, workspace_id: uuid.UUID, fact_id: uuid.UUID
) -> list[FactActorLinkOut]:
    get_fact(db, workspace_id, fact_id)
    links = db.scalars(
        select(FactActorLink)
        .where(FactActorLink.fact_id == fact_id)
        .order_by(FactActorLink.created_at)
    )
    return [actor_link_out(db, link) for link in links]


def delete_actor_link(db: Session, workspace_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = db.get(FactActorLink, link_id)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found.")
    fact = db.get(FactAssertion, link.fact_id)
    if fact is None or fact.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Link not found.")
    db.delete(link)
    db.commit()

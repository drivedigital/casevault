"""Trusted-fact endpoints — Wave 2 contract §4.3.

Fills the router stub created by W2-E. `/approve` is the only route that can
produce an `accepted` fact (§4.1); everything else here either stays
`proposed` or moves between untrusted states.
"""
import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import FactType, ReviewState
from app.routers.matters import resolve_workspace_id
from app.schemas.intake import (
    FactActorLinkCreate,
    FactActorLinkOut,
    FactCreate,
    FactOut,
    FactPage,
    FactReviewStateChange,
    FactSourceLinkCreate,
    FactSourceLinkOut,
    FactUpdate,
    SupersedeRequest,
    SupersedeResult,
)
from app.services import fact_service

router = APIRouter(tags=["facts"])


@router.get("/facts", response_model=FactPage)
def list_facts(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    review_state: list[ReviewState] | None = Query(default=None),
    fact_type: FactType | None = Query(default=None),
    is_material: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    rows, total = fact_service.list_facts(
        db,
        ws_id,
        matter_id=matter_id,
        review_states=review_state,
        fact_type=fact_type,
        is_material=is_material,
        query=q,
        limit=limit,
        offset=offset,
    )
    return FactPage(
        items=[fact_service.fact_out(db, f) for f in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/facts", response_model=FactOut, status_code=201)
def create_fact(
    payload: FactCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return fact_service.fact_out(db, fact_service.create_fact(db, ws_id, payload))


@router.get("/facts/{fact_id}", response_model=FactOut)
def get_fact(
    fact_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return fact_service.fact_out(db, fact_service.get_fact(db, ws_id, fact_id))


@router.patch("/facts/{fact_id}", response_model=FactOut)
def update_fact(
    fact_id: uuid.UUID,
    payload: FactUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    fact = fact_service.update_fact(db, ws_id, fact_id, payload)
    return fact_service.fact_out(db, fact)


@router.post("/facts/{fact_id}/approve", response_model=FactOut)
def approve_fact(
    fact_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    fact = fact_service.approve_fact(db, ws_id, fact_id)
    return fact_service.fact_out(db, fact)


@router.post("/facts/{fact_id}/review-state", response_model=FactOut)
def set_fact_review_state(
    fact_id: uuid.UUID,
    payload: FactReviewStateChange,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    fact = fact_service.set_review_state(db, ws_id, fact_id, payload)
    return fact_service.fact_out(db, fact)


@router.post("/facts/{fact_id}/supersede", response_model=SupersedeResult)
def supersede_fact(
    fact_id: uuid.UUID,
    payload: SupersedeRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    old, new = fact_service.supersede_fact(db, ws_id, fact_id, payload)
    return SupersedeResult(
        old_fact=fact_service.fact_out(db, old),
        new_fact=fact_service.fact_out(db, new),
    )


@router.post(
    "/facts/{fact_id}/source-links", response_model=FactSourceLinkOut, status_code=201
)
def add_fact_source_link(
    fact_id: uuid.UUID,
    payload: FactSourceLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    link = fact_service.add_source_link(db, ws_id, fact_id, payload)
    return fact_service.source_link_out(db, link)


@router.get("/facts/{fact_id}/source-links", response_model=list[FactSourceLinkOut])
def list_fact_source_links(
    fact_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return fact_service.list_source_links(db, ws_id, fact_id)


@router.delete("/fact-source-links/{link_id}", status_code=204)
def delete_fact_source_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    fact_service.delete_source_link(db, ws_id, link_id)
    return Response(status_code=204)


@router.post("/facts/{fact_id}/actor-links", response_model=FactActorLinkOut, status_code=201)
def add_fact_actor_link(
    fact_id: uuid.UUID,
    payload: FactActorLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    link = fact_service.add_actor_link(db, ws_id, fact_id, payload)
    return fact_service.actor_link_out(db, link)


@router.get("/facts/{fact_id}/actor-links", response_model=list[FactActorLinkOut])
def list_fact_actor_links(
    fact_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return fact_service.list_actor_links(db, ws_id, fact_id)


@router.delete("/fact-actor-links/{link_id}", status_code=204)
def delete_fact_actor_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    fact_service.delete_actor_link(db, ws_id, link_id)
    return Response(status_code=204)

"""Proposal review inbox endpoints — Wave 2 contract §4.2.

Fills the router stub created by W2-E. Static paths (`/proposals/bulk-review`,
`/proposals/generate`) are declared before `/proposals/{id}` so they never
fall into the UUID path parameter.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import ProposalType, ReviewState
from app.routers.matters import resolve_workspace_id
from app.schemas.intake import (
    BulkReviewRequest,
    BulkReviewResult,
    ProposalCreate,
    ProposalGenerateRequest,
    ProposalGenerateResult,
    ProposalOut,
    ProposalPage,
    ProposalReviewRequest,
    ProposalReviewResult,
    ProposalUpdate,
)
from app.services import fact_service, proposal_service

router = APIRouter(tags=["proposals"])


@router.get("/proposals", response_model=ProposalPage)
def list_proposals(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    proposal_type: ProposalType | None = Query(default=None),
    review_state: ReviewState | None = Query(default=None),
    source_id: uuid.UUID | None = Query(default=None),
    min_confidence: float | None = Query(default=None, ge=0, le=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    rows, total = proposal_service.list_proposals(
        db,
        ws_id,
        matter_id=matter_id,
        proposal_type=proposal_type,
        review_state=review_state,
        source_id=source_id,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
    )
    return ProposalPage(
        items=[proposal_service.proposal_out(db, p) for p in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/proposals", response_model=ProposalOut, status_code=201)
def create_proposal(
    payload: ProposalCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    proposal = proposal_service.create_proposal(db, ws_id, payload)
    return proposal_service.proposal_out(db, proposal)


@router.post("/proposals/generate", response_model=ProposalGenerateResult)
def generate_proposals(
    payload: ProposalGenerateRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return proposal_service.generate(db, ws_id, payload)


@router.post("/proposals/bulk-review", response_model=BulkReviewResult)
def bulk_review(
    payload: BulkReviewRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    results, created_facts = proposal_service.bulk_review(db, ws_id, payload)
    return BulkReviewResult(results=results, created_facts=created_facts)


@router.get("/proposals/{proposal_id}", response_model=ProposalOut)
def get_proposal(
    proposal_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return proposal_service.proposal_out(db, proposal_service.get_proposal(db, ws_id, proposal_id))


@router.patch("/proposals/{proposal_id}", response_model=ProposalOut)
def update_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    proposal = proposal_service.update_proposal(db, ws_id, proposal_id, payload)
    return proposal_service.proposal_out(db, proposal)


@router.post("/proposals/{proposal_id}/review", response_model=ProposalReviewResult)
def review_proposal(
    proposal_id: uuid.UUID,
    payload: ProposalReviewRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    proposal, fact = proposal_service.review_proposal(db, ws_id, proposal_id, payload)
    return ProposalReviewResult(
        proposal=proposal_service.proposal_out(db, proposal),
        fact=fact_service.fact_out(db, fact) if fact is not None else None,
    )

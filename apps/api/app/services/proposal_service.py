"""Proposal service — Wave 2 contract §4.2 + §4.4.

Review semantics (frozen):
- `accept` / `accept_with_edits` move the PROPOSAL to that state and create a
  fact_assertions row that is `proposed` — never accepted (§4.1 floor).
- `reject` / `defer` / `uncertain` / `dispute` only update the proposal.
- Re-reviewing anything not in {proposed, deferred, uncertain} → 409.
- Bulk review is partial-success: per-id results, committed per item.
- `generate` enqueues the §4.4 job when redis answers, otherwise runs it
  inline against this session's database URL.
"""
from __future__ import annotations

import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import ProposalType, ReviewState
from app.models.intake import FactAssertion, Proposal
from app.models.matter import Matter
from app.models.source import Source, SourceExcerpt
from app.schemas.intake import (
    BulkReviewRequest,
    ExcerptRef,
    ProposalCreate,
    ProposalGenerateRequest,
    ProposalGenerateResult,
    ProposalOut,
    ProposalReviewEdits,
    ProposalReviewRequest,
    ProposalUpdate,
    SourceRef,
)
from app.services import fact_service, identity_service

logger = logging.getLogger("casevault.proposals")

# §4.2: a proposal may be (re-)reviewed only while in one of these states.
REVIEWABLE_STATES = {ReviewState.proposed, ReviewState.deferred, ReviewState.uncertain}

# review action → resulting proposal review_state
_ACTION_TO_STATE = {
    "accept": ReviewState.accepted,
    "accept_with_edits": ReviewState.accepted_with_edits,
    "reject": ReviewState.rejected,
    "defer": ReviewState.deferred,
    "uncertain": ReviewState.uncertain,
    "dispute": ReviewState.disputed,
}
_FACT_CREATING_ACTIONS = {"accept", "accept_with_edits"}


def _repo_root() -> Path:
    # apps/api/app/services/proposal_service.py -> repo root
    return Path(__file__).resolve().parents[3].parent


def _intake_jobs():
    """Import the workers job module lazily; the API and the worker share it."""
    try:
        from workers.pipeline import intake_jobs  # type: ignore[import-not-found]

        return intake_jobs
    except ImportError:
        root = str(_repo_root())
        if root not in sys.path:
            sys.path.insert(0, root)
        from workers.pipeline import intake_jobs  # type: ignore[import-not-found]

        return intake_jobs


def get_proposal(db: Session, workspace_id: uuid.UUID, proposal_id: uuid.UUID) -> Proposal:
    proposal = db.get(Proposal, proposal_id)
    if proposal is None or proposal.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Proposal not found.")
    return proposal


def proposal_out(db: Session, proposal: Proposal) -> ProposalOut:
    """ProposalOut = §2 columns + source/excerpt refs + derived created_fact_id."""
    source_ref = None
    if proposal.source_id is not None:
        source = db.get(Source, proposal.source_id)
        if source is not None:
            source_ref = SourceRef(id=source.id, title=source.title)
    excerpt_ref = None
    if proposal.excerpt_id is not None:
        excerpt = db.get(SourceExcerpt, proposal.excerpt_id)
        if excerpt is not None:
            excerpt_ref = ExcerptRef(
                id=excerpt.id,
                page_start=excerpt.page_start,
                page_end=excerpt.page_end,
                locator_text=excerpt.locator_text,
            )
    created_fact_id = db.scalar(
        select(FactAssertion.id).where(FactAssertion.created_from_proposal_id == proposal.id)
    )
    return ProposalOut(
        **{c.name: getattr(proposal, c.name) for c in proposal.__table__.columns},
        source=source_ref,
        excerpt=excerpt_ref,
        created_fact_id=created_fact_id,
    )


def _validate_refs(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    matter_id: uuid.UUID | None,
    source_id: uuid.UUID | None,
    excerpt_id: uuid.UUID | None,
) -> None:
    if matter_id is not None:
        matter = db.get(Matter, matter_id)
        if matter is None or matter.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Matter not found.")
    if source_id is not None:
        source = db.get(Source, source_id)
        if source is None or source.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Source not found.")
    if excerpt_id is not None:
        excerpt = db.get(SourceExcerpt, excerpt_id)
        if excerpt is None:
            raise HTTPException(status_code=404, detail="Excerpt not found.")
        if source_id is not None and excerpt.source_id != source_id:
            raise HTTPException(status_code=422, detail="Excerpt belongs to a different source.")
        # ownership always resolves through the excerpt's own source — the
        # excerpt-only case (no source_id) must not accept a foreign
        # workspace's row (integrator review 9a55aee, finding 1)
        owner = db.get(Source, excerpt.source_id)
        if owner is None or owner.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Excerpt not found.")


def list_proposals(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    matter_id: uuid.UUID | None = None,
    proposal_type: ProposalType | None = None,
    review_state: ReviewState | None = None,
    source_id: uuid.UUID | None = None,
    min_confidence: float | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Proposal], int]:
    stmt = select(Proposal).where(Proposal.workspace_id == workspace_id)
    if matter_id is not None:
        stmt = stmt.where(Proposal.matter_id == matter_id)
    if proposal_type is not None:
        stmt = stmt.where(Proposal.proposal_type == proposal_type)
    if review_state is not None:
        stmt = stmt.where(Proposal.review_state == review_state)
    if source_id is not None:
        stmt = stmt.where(Proposal.source_id == source_id)
    if min_confidence is not None:
        stmt = stmt.where(Proposal.confidence_score >= min_confidence)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(Proposal.created_at.desc(), Proposal.id).limit(limit).offset(offset)
        )
    )
    return rows, total


def create_proposal(db: Session, workspace_id: uuid.UUID, payload: ProposalCreate) -> Proposal:
    """Manual proposal creation (POST /proposals): server-forces
    `review_state=proposed` and `created_by_system=false`."""
    _validate_refs(
        db,
        workspace_id,
        matter_id=payload.matter_id,
        source_id=payload.source_id,
        excerpt_id=payload.excerpt_id,
    )
    user = identity_service.get_local_user(db)
    proposal = Proposal(
        workspace_id=workspace_id,
        matter_id=payload.matter_id,
        proposal_type=payload.proposal_type,
        review_state=ReviewState.proposed,
        title=payload.title,
        proposed_text=payload.proposed_text,
        proposed_structured_json=payload.proposed_structured_json,
        source_id=payload.source_id,
        excerpt_id=payload.excerpt_id,
        confidence_score=payload.confidence_score,
        created_by_system=False,
        created_by_user_id=user.id,
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return proposal


def update_proposal(
    db: Session, workspace_id: uuid.UUID, proposal_id: uuid.UUID, payload: ProposalUpdate
) -> Proposal:
    proposal = get_proposal(db, workspace_id, proposal_id)
    if proposal.review_state != ReviewState.proposed:
        raise HTTPException(
            status_code=409,
            detail="Only proposals still in `proposed` state can be edited.",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(proposal, field, value)
    db.commit()
    db.refresh(proposal)
    return proposal


def _fact_from_proposal(
    db: Session,
    proposal: Proposal,
    action: str,
    edits: ProposalReviewEdits | None,
) -> FactAssertion:
    """Build the new `proposed` fact for an accept/accept_with_edits review.

    Validates before any state change so a 422 leaves the proposal untouched.
    """
    statement = (edits.statement_text if edits else None) or (proposal.proposed_text or "").strip()
    if not statement:
        raise HTTPException(
            status_code=422,
            detail="Cannot accept a proposal without text: `edits.statement_text` or the "
            "proposal's `proposed_text` is required.",
        )
    matter_id = (edits.matter_id if edits else None) or proposal.matter_id
    if matter_id is None:
        raise HTTPException(
            status_code=422,
            detail="Facts require a matter: this proposal has none and `edits.matter_id` "
            "was not supplied.",
        )
    fact_service._require_matter(db, proposal.workspace_id, matter_id)
    user = identity_service.get_local_user(db)
    values = {
        "workspace_id": proposal.workspace_id,
        "matter_id": matter_id,
        "statement_text": statement,
        # the floor (§4.1): a proposal review NEVER produces an accepted fact
        "review_state": ReviewState.proposed,
        "created_from_proposal_id": proposal.id,
        "created_by_user_id": user.id,
    }
    if edits is not None:
        # only pass provided values so the model/DB defaults apply otherwise
        for field in ("short_label", "fact_type", "confidence_level", "is_material"):
            value = getattr(edits, field)
            if value is not None:
                values[field] = value
    return FactAssertion(**values)


def review_proposal(
    db: Session, workspace_id: uuid.UUID, proposal_id: uuid.UUID, payload: ProposalReviewRequest
) -> tuple[Proposal, FactAssertion | None]:
    """§4.2 review transition. Returns (proposal, created fact | None)."""
    proposal = get_proposal(db, workspace_id, proposal_id)
    _review_transition(db, proposal, payload.action.value, payload.edits, payload.review_notes)
    return proposal, _created_fact(db, proposal)


def _created_fact(db: Session, proposal: Proposal) -> FactAssertion | None:
    if proposal.review_state not in (ReviewState.accepted, ReviewState.accepted_with_edits):
        return None
    return db.scalar(
        select(FactAssertion).where(FactAssertion.created_from_proposal_id == proposal.id)
    )


def _review_transition(
    db: Session,
    proposal: Proposal,
    action: str,
    edits: ProposalReviewEdits | None,
    review_notes: str | None,
) -> None:
    if proposal.review_state not in REVIEWABLE_STATES:
        raise HTTPException(
            status_code=409,
            detail=f"Proposal already reviewed ({proposal.review_state.value}); "
            "only proposed/deferred/uncertain proposals can be reviewed.",
        )
    fact = None
    if action in _FACT_CREATING_ACTIONS:
        fact = _fact_from_proposal(db, proposal, action, edits)  # 422-safe
    user = identity_service.get_local_user(db)
    proposal.review_state = _ACTION_TO_STATE[action]
    proposal.reviewed_by_user_id = user.id
    proposal.reviewed_at = datetime.now(timezone.utc)
    if review_notes is not None:
        proposal.review_notes = review_notes
    if fact is not None:
        db.add(fact)
    db.commit()
    db.refresh(proposal)


def bulk_review(
    db: Session, workspace_id: uuid.UUID, payload: BulkReviewRequest
) -> tuple[list[dict], list[uuid.UUID]]:
    """Partial success: each id is committed independently; failures never
    roll back the successes (§4.2)."""
    results: list[dict] = []
    created: list[uuid.UUID] = []
    for pid in payload.ids:
        entry: dict = {"id": pid, "ok": False, "error": None}
        try:
            proposal = get_proposal(db, workspace_id, pid)
            _review_transition(db, proposal, payload.action.value, None, payload.review_notes)
            fact = _created_fact(db, proposal)
            if fact is not None:
                created.append(fact.id)
            entry["ok"] = True
        except HTTPException as exc:
            db.rollback()  # discard this item's partial changes only
            entry["error"] = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        except Exception as exc:  # per-item isolation is the contract (§4.2)
            db.rollback()
            logger.exception("bulk-review item %s failed", pid)
            entry["error"] = f"{type(exc).__name__}: {exc}"
        results.append(entry)
    return results, created


def _inline_database_url(db: Session) -> str:
    """Connection URL for the inline job run.

    ``str(URL)`` masks the password as ``***``, which hands the job an invalid
    DSN on password-authenticated deployments (integrator review 9a55aee,
    finding 2) — render with ``hide_password=False``. The result stays
    internal to the job call: it is never logged and never serialized into a
    response.
    """
    return db.get_bind().url.render_as_string(hide_password=False)


def generate(
    db: Session, workspace_id: uuid.UUID, payload: ProposalGenerateRequest
) -> ProposalGenerateResult:
    """POST /proposals/generate — enqueue the §4.4 job when redis answers,
    otherwise run it inline (text sources produce pages; others no-op)."""
    source = db.get(Source, payload.source_id)
    if source is None or source.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Source not found.")
    jobs = _intake_jobs()
    # the cap must reach the worker too — a queued run that silently falls
    # back to the default 50 breaks the client's contract (finding 3)
    enqueue = jobs.enqueue_proposal_generation(
        str(source.id), str(workspace_id), payload.max_proposals
    )
    if enqueue.get("queued"):
        return ProposalGenerateResult(
            created=0, skipped=0, queued=True, job_id=enqueue.get("job_id")
        )
    result = jobs.generate_fact_proposals(
        str(source.id),
        str(workspace_id),
        max_proposals=payload.max_proposals,
        database_url=_inline_database_url(db),
    )
    return ProposalGenerateResult(
        created=result.get("created", 0),
        skipped=result.get("skipped", 0),
        queued=False,
        reason=result.get("reason"),
    )

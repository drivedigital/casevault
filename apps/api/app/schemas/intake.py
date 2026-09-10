"""Intake API schemas — Wave 2 contract §4 (proposal review inbox + trusted
fact store). Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen).

Floor rule (§4.1) in schema form: every create/update body uses
``extra="forbid"``, so the forbidden fields (`review_state`, `approved_*`,
`supersedes_fact_id`, `created_from_proposal_id`) and any unknown field are
rejected with 422 — never silently ignored. `POST /facts/{id}/approve` remains
the only route to `accepted`.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import FactType, ProposalType, ReviewState, StrengthLabel, SupportType


class ReviewAction(str, enum.Enum):
    """Proposal review actions (contract §4.2). Request-side vocabulary only —
    the persisted state is a `ReviewState` derived by the service."""

    accept = "accept"
    accept_with_edits = "accept_with_edits"
    reject = "reject"
    defer = "defer"
    uncertain = "uncertain"
    dispute = "dispute"


# --- shared sub-objects ------------------------------------------------------


class SourceRef(BaseModel):
    """`source: {id, title} | null` on ProposalOut (§4.2)."""

    id: uuid.UUID
    title: str


class ExcerptRef(BaseModel):
    """`excerpt: {id, page_start, page_end, locator_text} | null` on ProposalOut."""

    id: uuid.UUID
    page_start: int | None
    page_end: int | None
    locator_text: str | None


class ProposalRef(BaseModel):
    """`created_from_proposal: {id, proposal_type} | null` on FactOut (§4.3)."""

    id: uuid.UUID
    proposal_type: ProposalType


# --- proposals ----------------------------------------------------------------


class ProposalCreate(BaseModel):
    """Manual proposal creation (POST /proposals, §4.2). The service forces
    ``review_state=proposed`` and ``created_by_system=false``; both — and every
    other server-owned column — are forbidden in the body via extra=forbid."""

    model_config = ConfigDict(extra="forbid")

    proposal_type: ProposalType
    matter_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=255)
    proposed_text: str | None = None
    proposed_structured_json: dict = Field(default_factory=dict)
    source_id: uuid.UUID | None = None
    excerpt_id: uuid.UUID | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)


class ProposalUpdate(BaseModel):
    """PATCH /proposals/{id} — editable fields only, and only while the
    proposal is `proposed` (enforced by the service with 409).

    Explicit null on a NOT NULL column (§2 `proposals.proposed_structured_json`)
    is a 422, not a silent 500 at commit; nullable fields may be cleared with
    null, and omission means no-change (integrator review 9a55aee, finding 4).
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=255)
    proposed_text: str | None = None
    proposed_structured_json: dict | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_null_on_not_null_columns(cls, data):
        if isinstance(data, dict):
            for field in ("proposed_structured_json",):
                if field in data and data[field] is None:
                    raise ValueError(
                        f"`{field}` is not nullable; omit it instead of sending null."
                    )
        return data


class ProposalOut(BaseModel):
    """All §2 `proposals` columns + source/excerpt refs + derived fact id."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    matter_id: uuid.UUID | None
    proposal_type: ProposalType
    review_state: ReviewState
    title: str | None
    proposed_text: str | None
    proposed_structured_json: dict
    source_id: uuid.UUID | None
    excerpt_id: uuid.UUID | None
    confidence_score: float | None
    created_by_system: bool
    created_by_user_id: uuid.UUID | None
    reviewed_by_user_id: uuid.UUID | None
    reviewed_at: datetime | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime
    source: SourceRef | None = None
    excerpt: ExcerptRef | None = None
    created_fact_id: uuid.UUID | None = None


class ProposalPage(BaseModel):
    """Wave-2 list envelope (contract §3 preamble): limit ≤ 200, default 50."""

    items: list[ProposalOut]
    total: int
    limit: int
    offset: int


class ProposalReviewEdits(BaseModel):
    """Optional edits for `accept` / `accept_with_edits` (§4.2)."""

    model_config = ConfigDict(extra="forbid")

    statement_text: str | None = Field(default=None, min_length=1)
    short_label: str | None = Field(default=None, max_length=255)
    fact_type: FactType | None = None
    confidence_level: StrengthLabel | None = None
    is_material: bool | None = None
    matter_id: uuid.UUID | None = None


class ProposalReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: ReviewAction
    edits: ProposalReviewEdits | None = None
    review_notes: str | None = None


class ProposalReviewResult(BaseModel):
    """`{proposal, fact|null}` — the fact is always created `proposed` (§4.1)."""

    proposal: ProposalOut
    fact: FactOut | None = None


class BulkReviewRequest(BaseModel):
    """POST /proposals/bulk-review — partial success is the contract (§4.2)."""

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    action: ReviewAction
    review_notes: str | None = None


class BulkReviewItemResult(BaseModel):
    id: uuid.UUID
    ok: bool
    error: str | None = None


class BulkReviewResult(BaseModel):
    results: list[BulkReviewItemResult]
    created_facts: list[uuid.UUID] = []


class ProposalGenerateRequest(BaseModel):
    """POST /proposals/generate — runs the §4.4 job (queued when redis is up,
    inline for text sources otherwise)."""

    model_config = ConfigDict(extra="forbid")

    source_id: uuid.UUID
    max_proposals: int = Field(default=50, ge=1, le=50)


class ProposalGenerateResult(BaseModel):
    """`{created, skipped}` per §4.2; the extra keys report the enqueue
    outcome (additive, so a queueing client can tell inline from queued)."""

    created: int
    skipped: int
    queued: bool = False
    job_id: str | None = None
    reason: str | None = None


# --- facts --------------------------------------------------------------------


class FactCreate(BaseModel):
    """POST /facts — always lands `review_state=proposed`; `review_state`,
    `approved_*`, `supersedes_fact_id`, `created_from_proposal_id` (and any
    other unknown key) fail validation with 422."""

    model_config = ConfigDict(extra="forbid")

    matter_id: uuid.UUID
    statement_text: str = Field(min_length=1)
    short_label: str | None = Field(default=None, max_length=255)
    fact_type: FactType = FactType.source_derived
    confidence_level: StrengthLabel | None = None
    is_material: bool = False


class FactUpdate(BaseModel):
    """PATCH /facts/{id} — never touches review_state (§4.3).

    NOT NULL columns (§2 `fact_assertions`: statement_text, fact_type,
    is_material) reject an explicit null with 422 — otherwise `.strip()`/the
    commit would crash (integrator review 9a55aee, finding 4). Nullable
    columns (`short_label`, `confidence_level`) accept null to clear.
    """

    model_config = ConfigDict(extra="forbid")

    short_label: str | None = Field(default=None, max_length=255)
    statement_text: str | None = Field(default=None, min_length=1)
    fact_type: FactType | None = None
    confidence_level: StrengthLabel | None = None
    is_material: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_null_on_not_null_columns(cls, data):
        if isinstance(data, dict):
            for field in ("statement_text", "fact_type", "is_material"):
                if field in data and data[field] is None:
                    raise ValueError(
                        f"`{field}` is not nullable; omit it instead of sending null."
                    )
        return data


class FactReviewStateChange(BaseModel):
    """POST /facts/{id}/review-state (§4.3). The full ReviewState vocabulary
    is validated so that `accepted` reaches the service and fails with 409
    ("use /approve"), instead of an opaque schema error."""

    model_config = ConfigDict(extra="forbid")

    review_state: ReviewState
    notes: str | None = None


class SupersedeRequest(BaseModel):
    """POST /facts/{id}/supersede — replacement values for the new fact."""

    model_config = ConfigDict(extra="forbid")

    statement_text: str = Field(min_length=1)
    short_label: str | None = Field(default=None, max_length=255)
    fact_type: FactType | None = None
    confidence_level: StrengthLabel | None = None


class FactSourceLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: uuid.UUID
    excerpt_id: uuid.UUID | None = None
    support_type: SupportType = SupportType.supports
    strength: StrengthLabel | None = None
    notes: str | None = None


class FactSourceLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    fact_id: uuid.UUID
    source_id: uuid.UUID
    excerpt_id: uuid.UUID | None
    support_type: SupportType
    strength: StrengthLabel | None
    notes: str | None
    created_at: datetime
    source_title: str | None = None


class FactActorLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_id: uuid.UUID
    role_in_fact: str | None = Field(default=None, max_length=64)


class FactActorLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    fact_id: uuid.UUID
    actor_id: uuid.UUID
    role_in_fact: str | None
    created_at: datetime
    actor_name: str | None = None


class FactOut(BaseModel):
    """All §2 `fact_assertions` columns + links + the creating-proposal ref."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    matter_id: uuid.UUID
    short_label: str | None
    statement_text: str
    review_state: ReviewState
    confidence_level: StrengthLabel | None
    fact_type: FactType
    is_material: bool
    created_from_proposal_id: uuid.UUID | None
    created_by_user_id: uuid.UUID | None
    approved_by_user_id: uuid.UUID | None
    approved_at: datetime | None
    supersedes_fact_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    source_links: list[FactSourceLinkOut] = []
    actor_links: list[FactActorLinkOut] = []
    created_from_proposal: ProposalRef | None = None


class FactPage(BaseModel):
    items: list[FactOut]
    total: int
    limit: int
    offset: int


class SupersedeResult(BaseModel):
    old_fact: FactOut
    new_fact: FactOut

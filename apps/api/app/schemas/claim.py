"""Claim matrix API contracts (WS-CLAIMS)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import (
    AuthorityLinkType,
    AuthorityType,
    BurdenStatus,
    ClaimSupportStatus,
    StrengthLabel,
)

Pol = Literal["support", "adverse", "context"]
LinkPol = Literal["support", "adverse", "context"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ templates


class TemplateElementIn(BaseModel):
    element_label: str = Field(min_length=1, max_length=255)
    element_description: str | None = None
    is_issue_row: bool = False


class TemplateCreate(BaseModel):
    jurisdiction: str = "NY"
    name: str = Field(min_length=1, max_length=255)
    category: str | None = None
    source_authority_text: str | None = None
    notes: str | None = None
    elements: list[TemplateElementIn] = []


class TemplateElementOut(ORMModel):
    id: uuid.UUID
    element_order: int
    element_label: str
    element_description: str | None
    is_issue_row: bool


class TemplateOut(ORMModel):
    id: uuid.UUID
    jurisdiction: str
    name: str
    category: str | None
    source_authority_text: str | None
    notes: str | None
    is_active: bool
    elements: list[TemplateElementOut] = []
    element_count: int = 0


# ------------------------------------------------------------------ instances


class ClaimCreate(BaseModel):
    matter_id: uuid.UUID
    template_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    claim_code: str | None = Field(default=None, max_length=32)
    target_summary: str | None = None
    status: str | None = Field(default="working", max_length=64)
    theory_summary: str | None = None
    notes: str | None = None
    elements: list[TemplateElementIn] | None = None


class ClaimUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    claim_code: str | None = Field(default=None, max_length=32)
    target_summary: str | None = None
    status: str | None = Field(default=None, max_length=64)
    theory_summary: str | None = None
    highest_priority_gap: str | None = None
    authority_verification_state: str | None = Field(default=None, max_length=64)
    notes: str | None = None


class ElementCreate(BaseModel):
    element_label: str = Field(min_length=1, max_length=255)
    element_description: str | None = None
    element_order: int | None = None  # defaults to end of list


class ElementUpdate(BaseModel):
    element_label: str | None = Field(default=None, min_length=1, max_length=255)
    element_description: str | None = None
    support_status: ClaimSupportStatus | None = None
    gap_text: str | None = None
    risk_text: str | None = None
    notes: str | None = None


class LinkFactIn(BaseModel):
    fact_id: uuid.UUID
    link_polarity: Pol = "support"
    weight_label: StrengthLabel | None = None
    notes: str | None = None


class LinkAuthorityIn(BaseModel):
    authority_id: uuid.UUID
    link_type: AuthorityLinkType = AuthorityLinkType.background


class BurdenOut(BaseModel):
    """Claim-level burden-of-proof rollup (WS-CLAIMS invariant #2)."""

    status: BurdenStatus
    label: str
    elements_total: int
    proven_elements: int
    partial_elements: int
    unsupported_elements: int
    conflicted_elements: int
    explanation: str


class ClaimOut(ORMModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    template_id: uuid.UUID | None
    claim_code: str | None
    name: str
    target_summary: str | None
    status: str | None
    theory_summary: str | None
    highest_priority_gap: str | None
    authority_verification_state: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    burden: BurdenOut | None = None
    element_count: int = 0
    gap_count: int = 0
    support_fact_count: int = 0
    adverse_fact_count: int = 0


class ListOut(BaseModel):
    items: list[ClaimOut]
    limit: int
    offset: int
    total: int


# --------------------------------------------------------------------- chart


class EvidenceOut(BaseModel):
    """A single evidence anchor behind a fact (invariant #1)."""

    source_id: uuid.UUID
    title: str
    source_type: str
    source_status: str
    evidence_review_status: str
    is_primary_anchor: bool
    locator_text: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    excerpt_text: str | None = None


class ElementFactOut(BaseModel):
    link_id: uuid.UUID
    fact_id: uuid.UUID
    short_label: str | None
    statement_text: str
    review_state: str
    confidence_level: str | None
    fact_type: str
    link_polarity: str
    weight_label: str | None
    link_notes: str | None
    has_primary_source: bool
    evidence: list[EvidenceOut] = []


class ElementAuthorityOut(BaseModel):
    link_id: uuid.UUID
    authority_id: uuid.UUID
    link_type: str
    authority_type: AuthorityType
    title: str
    citation_text: str | None
    jurisdiction: str | None
    holding_summary: str | None


class ElementWarningOut(BaseModel):
    code: str
    message: str
    severity: str


class ChartElementOut(BaseModel):
    id: uuid.UUID
    element_order: int
    element_label: str
    element_description: str | None
    stored_support_status: ClaimSupportStatus
    computed_support_status: ClaimSupportStatus
    burden_status: BurdenStatus
    support_points: int
    adverse_points: int
    has_primary_anchor: bool
    testimony_only: bool
    conflicted: bool
    has_controlling_authority: bool
    gap_text: str | None
    risk_text: str | None
    notes: str | None
    warnings: list[ElementWarningOut] = []
    support_facts: list[ElementFactOut] = []
    adverse_facts: list[ElementFactOut] = []
    context_facts: list[ElementFactOut] = []
    authorities: list[ElementAuthorityOut] = []


class GapOut(BaseModel):
    element_id: uuid.UUID
    element_order: int
    element_label: str
    severity: Literal["alert", "caution", "info"]
    code: str
    message: str


class ChartOut(BaseModel):
    claim: ClaimOut
    burden: BurdenOut
    elements: list[ChartElementOut]
    gaps: list[GapOut] = []


# --------------------------------------------------------------- candidates


class CandidateFactOut(BaseModel):
    fact_id: uuid.UUID
    short_label: str | None
    statement_text: str
    review_state: str
    confidence_level: str | None
    is_material: bool
    score: int
    score_reasons: list[str] = []
    evidence_sources: list[str] = []


class MatterOut(ORMModel):
    id: uuid.UUID
    title: str
    status: str
    matter_type: str

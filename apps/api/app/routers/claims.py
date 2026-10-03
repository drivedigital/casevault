"""Claims router — legal claims matrix & burden-of-proof mapping (WS-CLAIMS).

Endpoint map (Tech Spec §9.2 "Claims" + matrix/gap support added by WS-CLAIMS):

- GET    /api/v1/claim-templates                       template library (NY-first)
- POST   /api/v1/claim-templates                       create template (seed/admin)
- GET    /api/v1/claim-instances?matter_id=…           the claims matrix (rows + rollups)
- GET    /api/v1/claims/export?format=csv|json          burden-of-proof summary export
- POST   /api/v1/claim-instances                       create claim (from template or blank)
- GET    /api/v1/claim-instances/{id}                  one claim, with burden rollup
- PATCH  /api/v1/claim-instances/{id}                  edit header fields
- DELETE /api/v1/claim-instances/{id}
- GET    /api/v1/claim-instances/{id}/chart            full matrix payload
- POST   /api/v1/claim-instances/{id}/recompute-support
- POST   /api/v1/claim-instances/{id}/elements         add matter-specific element
- PATCH  /api/v1/claim-elements/{id}                   label/desc/status/gap/risk/notes
- DELETE /api/v1/claim-elements/{id}
- POST   /api/v1/claim-elements/{id}/link-fact         proof-graph edge (invariant #1)
- DELETE /api/v1/claim-elements/{id}/link-fact/{link_id}
- POST   /api/v1/claim-elements/{id}/link-authority
- DELETE /api/v1/claim-elements/{id}/link-authority/{link_id}
- GET    /api/v1/claim-elements/{id}/support-candidates  ranked fact suggestions (Tech Spec §11.3)
"""
from __future__ import annotations

import csv
import io
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.claim import (
    ClaimElement,
    ClaimElementAuthorityLink,
    ClaimElementFactLink,
    ClaimInstance,
    ClaimTemplate,
    ClaimTemplateElement,
)
from app.models.enums import (
    AuthorityLinkType,
    BurdenStatus,
    ClaimSupportStatus,
    ReviewState,
    StrengthLabel,
    SupportType,
)
from app.models.fact import FactAssertion, FactSupportLink
from app.models.matter import Matter
from app.schemas.claim import (
    BurdenOut,
    CandidateFactOut,
    ClaimCreate,
    ClaimOut,
    ClaimUpdate,
    ChartElementOut,
    ChartOut,
    ElementAuthorityOut,
    ElementCreate,
    ElementFactOut,
    ElementUpdate,
    ElementWarningOut,
    EvidenceOut,
    GapOut,
    LinkAuthorityIn,
    LinkFactIn,
    ListOut,
    Pol,
    TemplateCreate,
    TemplateElementOut,
    TemplateOut,
)
from app.services.claim_burden import (
    ClaimBurden,
    DISQUALIFYING_REVIEW,
    ElementAssessment,
    PRIMARY_ANCHOR_STATUSES,
    assess_element,
    compute_claim_burden,
    load_claim_elements,
    recompute_claim,
    rollup_claim,
)

router = APIRouter(tags=["claims"])

BURDEN_LABELS = {
    BurdenStatus.unsupported: "Unsupported",
    BurdenStatus.partially_supported: "Partially supported",
    BurdenStatus.proven: "Proven (facially)",
}


# ----------------------------------------------------------------- utilities


def _get_claim(db: Session, claim_id: uuid.UUID) -> ClaimInstance:
    claim = db.get(ClaimInstance, claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim instance not found")
    return claim


def _get_element(db: Session, element_id: uuid.UUID) -> ClaimElement:
    element = db.get(ClaimElement, element_id)
    if element is None:
        raise HTTPException(status_code=404, detail="Claim element not found")
    return element


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Constraint violated: {exc.orig}") from exc


def _burden_out(b: ClaimBurden) -> BurdenOut:
    return BurdenOut(
        status=b.status,
        label=BURDEN_LABELS[b.status],
        elements_total=b.elements_total,
        proven_elements=b.proven_elements,
        partial_elements=b.partial_elements,
        unsupported_elements=b.unsupported_elements,
        conflicted_elements=b.conflicted_elements,
        explanation=b.explanation,
    )


@dataclass
class _Assessed:
    burden: ClaimBurden
    assessments: list[ElementAssessment]


def _assess_many(db: Session, claims: list[ClaimInstance]) -> dict[uuid.UUID, _Assessed]:
    """Burden rollups for many claims in a few queries (matrix page)."""
    out: dict[uuid.UUID, _Assessed] = {}
    if not claims:
        return out
    ids = [c.id for c in claims]
    elements = (
        db.query(ClaimElement)
        .options(*_element_load_options())
        .filter(ClaimElement.claim_instance_id.in_(ids))
        .order_by(ClaimElement.claim_instance_id, ClaimElement.element_order)
        .all()
    )
    grouped: dict[uuid.UUID, list[ClaimElement]] = defaultdict(list)
    for el in elements:
        grouped[el.claim_instance_id].append(el)
    for c in claims:
        assessments = [assess_element(el) for el in grouped.get(c.id, [])]
        out[c.id] = _Assessed(burden=rollup_claim(assessments), assessments=assessments)
    return out


def _element_load_options():
    from sqlalchemy.orm import joinedload, selectinload

    return (
        joinedload(ClaimElement.fact_links)
        .joinedload(ClaimElementFactLink.fact)
        .selectinload(FactAssertion.support_links)
        .joinedload(FactSupportLink.source),
        joinedload(ClaimElement.fact_links)
        .joinedload(ClaimElementFactLink.fact)
        .selectinload(FactAssertion.support_links)
        .joinedload(FactSupportLink.excerpt),
        joinedload(ClaimElement.authority_links).joinedload(
            ClaimElementAuthorityLink.authority
        ),
    )


def _claim_out(
    claim: ClaimInstance,
    assessed: _Assessed | None = None,
    *,
    with_burden: bool = True,
) -> ClaimOut:
    elements = claim.elements or []
    assessments = assessed.assessments if assessed else []
    burden = assessed.burden if assessed else None
    gap_count = sum(
        1
        for a in assessments
        if any(w.severity in ("alert", "caution") for w in a.warnings)
        or a.element.gap_text
    )
    return ClaimOut(
        id=claim.id,
        matter_id=claim.matter_id,
        template_id=claim.template_id,
        claim_code=claim.claim_code,
        name=claim.name,
        target_summary=claim.target_summary,
        status=claim.status,
        theory_summary=claim.theory_summary,
        highest_priority_gap=claim.highest_priority_gap,
        authority_verification_state=claim.authority_verification_state,
        notes=claim.notes,
        created_at=claim.created_at,
        updated_at=claim.updated_at,
        burden=_burden_out(burden) if (with_burden and burden) else None,
        element_count=len(elements),
        gap_count=gap_count if assessed else 0,
        support_fact_count=sum(len(a.support_links) for a in assessments),
        adverse_fact_count=sum(len(a.adverse_links) for a in assessments),
    )


def _evidence_for(fact: FactAssertion) -> list[EvidenceOut]:
    seen: set[tuple[str, str]] = set()
    out: list[EvidenceOut] = []
    for sl in fact.support_links:
        if sl.support_type != SupportType.supports or sl.source is None:
            continue
        src = sl.source
        excerpt = sl.excerpt
        key = (str(src.id), str(excerpt.id) if excerpt else "-")
        if key in seen:
            continue
        seen.add(key)
        out.append(
            EvidenceOut(
                source_id=src.id,
                title=src.title,
                source_type=src.source_type.value
                if hasattr(src.source_type, "value")
                else str(src.source_type),
                source_status=src.source_status.value
                if hasattr(src.source_status, "value")
                else str(src.source_status),
                evidence_review_status=src.evidence_review_status.value
                if hasattr(src.evidence_review_status, "value")
                else str(src.evidence_review_status),
                is_primary_anchor=(
                    src.source_status in PRIMARY_ANCHOR_STATUSES
                    and src.evidence_review_status not in DISQUALIFYING_REVIEW
                ),
                locator_text=excerpt.locator_text if excerpt else None,
                page_start=excerpt.page_start if excerpt else None,
                page_end=excerpt.page_end if excerpt else None,
                excerpt_text=(excerpt.excerpt_text[:400] if excerpt and excerpt.excerpt_text else None),
            )
        )
    return out


def _fact_link_out(link: ClaimElementFactLink) -> ElementFactOut:
    fact = link.fact
    assert fact is not None
    return ElementFactOut(
        link_id=link.id,
        fact_id=fact.id,
        short_label=fact.short_label,
        statement_text=fact.statement_text,
        review_state=fact.review_state.value
        if hasattr(fact.review_state, "value")
        else str(fact.review_state),
        confidence_level=fact.confidence_level.value
        if fact.confidence_level
        else None,
        fact_type=fact.fact_type.value if hasattr(fact.fact_type, "value") else str(fact.fact_type),
        link_polarity=link.link_polarity,
        weight_label=link.weight_label.value if link.weight_label else None,
        link_notes=link.notes,
        has_primary_source=any(e.is_primary_anchor for e in _evidence_for(fact)),
        evidence=_evidence_for(fact),
    )


def _chart_element_out(a: ElementAssessment) -> ChartElementOut:
    el = a.element
    return ChartElementOut(
        id=el.id,
        element_order=el.element_order,
        element_label=el.element_label,
        element_description=el.element_description,
        stored_support_status=el.support_status,
        computed_support_status=a.computed_status,
        burden_status=a.burden,
        support_points=a.support_points,
        adverse_points=a.adverse_points,
        has_primary_anchor=a.has_primary_anchor,
        testimony_only=a.testimony_only,
        conflicted=a.conflicted,
        has_controlling_authority=a.controlling_authority,
        gap_text=el.gap_text,
        risk_text=el.risk_text,
        notes=el.notes,
        warnings=[
            ElementWarningOut(code=w.code, message=w.message, severity=w.severity)
            for w in a.warnings
        ],
        support_facts=[_fact_link_out(l) for l in a.support_links if l.fact is not None],
        adverse_facts=[_fact_link_out(l) for l in a.adverse_links if l.fact is not None],
        context_facts=[_fact_link_out(l) for l in a.context_links if l.fact is not None],
        authorities=[
            ElementAuthorityOut(
                link_id=al.id,
                authority_id=al.authority_id,
                link_type=al.link_type.value if hasattr(al.link_type, "value") else str(al.link_type),
                authority_type=al.authority.authority_type if al.authority else AuthorityType.note,
                title=al.authority.title if al.authority else "(missing authority)",
                citation_text=al.authority.citation_text if al.authority else None,
                jurisdiction=al.authority.jurisdiction if al.authority else None,
                holding_summary=al.authority.holding_summary if al.authority else None,
            )
            for al in el.authority_links
        ],
    )


def _gaps(assessments: list[ElementAssessment]) -> list[GapOut]:
    gaps: list[GapOut] = []
    for a in assessments:
        for w in a.warnings:
            if w.severity == "info":
                continue
            gaps.append(
                GapOut(
                    element_id=a.element.id,
                    element_order=a.element.element_order,
                    element_label=a.element.element_label,
                    severity=w.severity,
                    code=w.code,
                    message=w.message,
                )
            )
        if a.element.gap_text:
            gaps.append(
                GapOut(
                    element_id=a.element.id,
                    element_order=a.element.element_order,
                    element_label=a.element.element_label,
                    severity="alert",
                    code="attorney_gap_note",
                    message=a.element.gap_text,
                )
            )
    order = {"alert": 0, "caution": 1, "info": 2}
    gaps.sort(key=lambda g: (order[g.severity], g.element_order))
    return gaps


def _chart_out(db: Session, claim: ClaimInstance) -> ChartOut:
    elements = load_claim_elements(db, claim)
    assessments = [assess_element(el) for el in elements]
    burden = rollup_claim(assessments)
    out = _claim_out(claim, _Assessed(burden=burden, assessments=assessments))
    return ChartOut(
        claim=out,
        burden=_burden_out(burden),
        elements=[_chart_element_out(a) for a in assessments],
        gaps=_gaps(assessments),
    )


def _evidence_counts(facts: list[ElementFactOut]) -> tuple[int, int, int]:
    """Return fact-link, evidence-anchor, and distinct-source counts."""
    anchors = [anchor for fact in facts for anchor in fact.evidence]
    return (
        len(facts),
        len(anchors),
        len({anchor.source_id for anchor in anchors}),
    )


def _element_export_out(element: ChartElementOut) -> dict[str, object]:
    support_counts = _evidence_counts(element.support_facts)
    adverse_counts = _evidence_counts(element.adverse_facts)
    return {
        "id": str(element.id),
        "element_order": element.element_order,
        "element_label": element.element_label,
        "support_status": element.computed_support_status.value,
        "burden_status": element.burden_status.value,
        "support_points": element.support_points,
        "adverse_points": element.adverse_points,
        "conflicted": element.conflicted,
        "gap_text": element.gap_text,
        "risk_text": element.risk_text,
        "supporting_fact_link_count": support_counts[0],
        "supporting_evidence_anchor_count": support_counts[1],
        "supporting_source_count": support_counts[2],
        "adverse_fact_link_count": adverse_counts[0],
        "adverse_evidence_anchor_count": adverse_counts[1],
        "adverse_source_count": adverse_counts[2],
    }


def _claim_export_out(db: Session, claim: ClaimInstance) -> dict[str, object]:
    chart = _chart_out(db, claim)
    elements = [_element_export_out(element) for element in chart.elements]
    support_counts = _evidence_counts([fact for element in chart.elements for fact in element.support_facts])
    adverse_counts = _evidence_counts([fact for element in chart.elements for fact in element.adverse_facts])
    return {
        "id": str(chart.claim.id),
        "matter_id": str(chart.claim.matter_id),
        "claim_code": chart.claim.claim_code,
        "name": chart.claim.name,
        "target_summary": chart.claim.target_summary,
        "status": chart.claim.status,
        "theory_summary": chart.claim.theory_summary,
        "highest_priority_gap": chart.claim.highest_priority_gap,
        "authority_verification_state": chart.claim.authority_verification_state,
        "burden": chart.burden.model_dump(mode="json"),
        "element_count": len(elements),
        "supporting_fact_link_count": support_counts[0],
        "supporting_evidence_anchor_count": support_counts[1],
        "supporting_source_count": support_counts[2],
        "adverse_fact_link_count": adverse_counts[0],
        "adverse_evidence_anchor_count": adverse_counts[1],
        "adverse_source_count": adverse_counts[2],
        "elements": elements,
    }


CSV_EXPORT_FIELDS = [
    "matter_id",
    "claim_id",
    "claim_code",
    "claim_name",
    "target_summary",
    "claim_status",
    "burden_status",
    "burden_label",
    "elements_total",
    "proven_elements",
    "partial_elements",
    "unsupported_elements",
    "conflicted_elements",
    "claim_supporting_fact_link_count",
    "claim_supporting_evidence_anchor_count",
    "claim_supporting_source_count",
    "claim_adverse_fact_link_count",
    "claim_adverse_evidence_anchor_count",
    "claim_adverse_source_count",
    "element_id",
    "element_order",
    "element_label",
    "element_support_status",
    "element_burden_status",
    "support_points",
    "adverse_points",
    "conflicted",
    "gap_text",
    "risk_text",
    "element_supporting_fact_link_count",
    "element_supporting_evidence_anchor_count",
    "element_supporting_source_count",
    "element_adverse_fact_link_count",
    "element_adverse_evidence_anchor_count",
    "element_adverse_source_count",
]


def _csv_safe(value: object) -> object:
    """Neutralize spreadsheet formula prefixes in untrusted text cells."""
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def _claim_export_csv(claims: list[dict[str, object]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=CSV_EXPORT_FIELDS, extrasaction="ignore")
    writer.writeheader()
    for claim in claims:
        burden = claim["burden"]
        assert isinstance(burden, dict)
        claim_fields = {
            "matter_id": claim["matter_id"],
            "claim_id": claim["id"],
            "claim_code": claim["claim_code"],
            "claim_name": claim["name"],
            "target_summary": claim["target_summary"],
            "claim_status": claim["status"],
            "burden_status": burden["status"],
            "burden_label": burden["label"],
            "elements_total": burden["elements_total"],
            "proven_elements": burden["proven_elements"],
            "partial_elements": burden["partial_elements"],
            "unsupported_elements": burden["unsupported_elements"],
            "conflicted_elements": burden["conflicted_elements"],
            "claim_supporting_fact_link_count": claim["supporting_fact_link_count"],
            "claim_supporting_evidence_anchor_count": claim["supporting_evidence_anchor_count"],
            "claim_supporting_source_count": claim["supporting_source_count"],
            "claim_adverse_fact_link_count": claim["adverse_fact_link_count"],
            "claim_adverse_evidence_anchor_count": claim["adverse_evidence_anchor_count"],
            "claim_adverse_source_count": claim["adverse_source_count"],
        }
        elements = claim["elements"]
        assert isinstance(elements, list)
        for element in elements or [{}]:
            assert isinstance(element, dict)
            row = {
                **claim_fields,
                "element_id": element.get("id"),
                "element_order": element.get("element_order"),
                "element_label": element.get("element_label"),
                "element_support_status": element.get("support_status"),
                "element_burden_status": element.get("burden_status"),
                "support_points": element.get("support_points"),
                "adverse_points": element.get("adverse_points"),
                "conflicted": element.get("conflicted"),
                "gap_text": element.get("gap_text"),
                "risk_text": element.get("risk_text"),
                "element_supporting_fact_link_count": element.get("supporting_fact_link_count"),
                "element_supporting_evidence_anchor_count": element.get("supporting_evidence_anchor_count"),
                "element_supporting_source_count": element.get("supporting_source_count"),
                "element_adverse_fact_link_count": element.get("adverse_fact_link_count"),
                "element_adverse_evidence_anchor_count": element.get("adverse_evidence_anchor_count"),
                "element_adverse_source_count": element.get("adverse_source_count"),
            }
            writer.writerow({key: _csv_safe(value) for key, value in row.items()})
    return output.getvalue()


# ------------------------------------------------------------------ templates


@router.get("/claim-templates", response_model=list[TemplateOut])
def list_claim_templates(
    jurisdiction: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[TemplateOut]:
    stmt = select(ClaimTemplate)
    if jurisdiction:
        stmt = stmt.where(ClaimTemplate.jurisdiction == jurisdiction.upper())
    if not include_inactive:
        stmt = stmt.where(ClaimTemplate.is_active.is_(True))
    templates = db.scalars(stmt.order_by(ClaimTemplate.category, ClaimTemplate.name)).all()
    out: list[TemplateOut] = []
    for t in templates:
        item = TemplateOut(
            id=t.id,
            jurisdiction=t.jurisdiction,
            name=t.name,
            category=t.category,
            source_authority_text=t.source_authority_text,
            notes=t.notes,
            is_active=t.is_active,
            elements=[
                TemplateElementOut(
                    id=e.id,
                    element_order=e.element_order,
                    element_label=e.element_label,
                    element_description=e.element_description,
                    is_issue_row=e.is_issue_row,
                )
                for e in t.elements
            ],
            element_count=len(t.elements),
        )
        out.append(item)
    return out


@router.post("/claim-templates", response_model=TemplateOut, status_code=201)
def create_claim_template(payload: TemplateCreate, db: Session = Depends(get_db)) -> TemplateOut:
    template = ClaimTemplate(
        jurisdiction=payload.jurisdiction.upper(),
        name=payload.name,
        category=payload.category,
        source_authority_text=payload.source_authority_text,
        notes=payload.notes,
    )
    for i, e in enumerate(payload.elements, start=1):
        template.elements.append(
            ClaimTemplateElement(
                element_order=i,
                element_label=e.element_label,
                element_description=e.element_description,
                is_issue_row=e.is_issue_row,
            )
        )
    db.add(template)
    _commit(db)
    db.refresh(template)
    return TemplateOut(
        id=template.id,
        jurisdiction=template.jurisdiction,
        name=template.name,
        category=template.category,
        source_authority_text=template.source_authority_text,
        notes=template.notes,
        is_active=template.is_active,
        elements=[
            TemplateElementOut(
                id=e.id,
                element_order=e.element_order,
                element_label=e.element_label,
                element_description=e.element_description,
                is_issue_row=e.is_issue_row,
            )
            for e in template.elements
        ],
        element_count=len(template.elements),
    )


# ------------------------------------------------------------- claim matrix


@router.get("/claim-instances", response_model=ListOut)
def list_claim_instances(
    matter_id: uuid.UUID | None = Query(default=None),
    burden: BurdenStatus | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, description="search name / code / target"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ListOut:
    stmt = select(ClaimInstance)
    if matter_id:
        stmt = stmt.where(ClaimInstance.matter_id == matter_id)
    if status:
        stmt = stmt.where(ClaimInstance.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(ClaimInstance.name.ilike(like), ClaimInstance.claim_code.ilike(like))
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    claims = list(
        db.scalars(
            stmt.order_by(ClaimInstance.claim_code.nulls_last(), ClaimInstance.created_at).offset(
                offset
            ).limit(limit)
        ).all()
    )
    assessed = _assess_many(db, claims)
    items = [
        _claim_out(c, assessed.get(c.id))
        for c in claims
        if burden is None or assessed[c.id].burden.status == burden
    ]
    return ListOut(items=items, limit=limit, offset=offset, total=total)


@router.get("/claims/export", response_model=None)
def export_claim_matrix(
    format: Literal["csv", "json"] = Query(default="csv", description="Export encoding."),
    matter_id: uuid.UUID | None = Query(default=None, description="Limit the export to one matter."),
    db: Session = Depends(get_db),
) -> Response:
    """Export claim burden rollups with one element-breakdown row per element.

    CSV is the default for direct downloads. JSON is available with
    ``?format=json``. Both formats can be scoped to a matter using
    ``?matter_id=<uuid>``.
    """
    stmt = select(ClaimInstance)
    if matter_id is not None:
        stmt = stmt.where(ClaimInstance.matter_id == matter_id)
    claims = list(
        db.scalars(
            stmt.order_by(ClaimInstance.claim_code.nulls_last(), ClaimInstance.created_at)
        ).all()
    )
    exported_claims = [_claim_export_out(db, claim) for claim in claims]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "matter_id": str(matter_id) if matter_id is not None else None,
        "total_claims": len(exported_claims),
        "claims": exported_claims,
    }
    filename = f"claims-matrix-{matter_id}.{format}" if matter_id else f"claims-matrix.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if format == "json":
        return JSONResponse(content=payload, headers=headers)
    return Response(
        content=_claim_export_csv(exported_claims),
        media_type="text/csv",
        headers=headers,
    )


@router.post("/claim-instances", response_model=ClaimOut, status_code=201)
def create_claim_instance(payload: ClaimCreate, db: Session = Depends(get_db)) -> ClaimOut:
    if db.get(Matter, payload.matter_id) is None:
        raise HTTPException(status_code=404, detail="Matter not found")

    claim = ClaimInstance(
        matter_id=payload.matter_id,
        template_id=payload.template_id,
        name=payload.name,
        claim_code=payload.claim_code or None,
        target_summary=payload.target_summary,
        status=payload.status or "working",
        theory_summary=payload.theory_summary,
        notes=payload.notes,
        authority_verification_state="pending",
    )

    if payload.template_id is not None:
        template = db.get(ClaimTemplate, payload.template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Claim template not found")
        for e in template.elements:
            claim.elements.append(
                ClaimElement(
                    element_order=e.element_order,
                    element_label=e.element_label,
                    element_description=e.element_description,
                    support_status=ClaimSupportStatus.not_researched,
                )
            )
    for i, e in enumerate(payload.elements or [], start=len(claim.elements) + 1):
        claim.elements.append(
            ClaimElement(
                element_order=i,
                element_label=e.element_label,
                element_description=e.element_description,
                support_status=ClaimSupportStatus.not_researched,
            )
        )

    db.add(claim)
    _commit(db)
    db.refresh(claim)
    return _claim_out(claim)


@router.get("/claim-instances/{claim_id}", response_model=ClaimOut)
def get_claim_instance(claim_id: uuid.UUID, db: Session = Depends(get_db)) -> ClaimOut:
    claim = _get_claim(db, claim_id)
    burden, assessments = compute_claim_burden(db, claim)
    return _claim_out(claim, _Assessed(burden=burden, assessments=assessments))


@router.patch("/claim-instances/{claim_id}", response_model=ClaimOut)
def update_claim_instance(
    claim_id: uuid.UUID, payload: ClaimUpdate, db: Session = Depends(get_db)
) -> ClaimOut:
    claim = _get_claim(db, claim_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(claim, field, value)
    _commit(db)
    db.refresh(claim)
    return _claim_out(claim)


@router.delete("/claim-instances/{claim_id}", status_code=204)
def delete_claim_instance(claim_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    claim = _get_claim(db, claim_id)
    db.delete(claim)
    _commit(db)


# --------------------------------------------------------------------- chart


@router.get("/claim-instances/{claim_id}/chart", response_model=ChartOut)
def get_claim_chart(claim_id: uuid.UUID, db: Session = Depends(get_db)) -> ChartOut:
    claim = _get_claim(db, claim_id)
    return _chart_out(db, claim)


@router.post("/claim-instances/{claim_id}/recompute-support", response_model=ChartOut)
def recompute_support(claim_id: uuid.UUID, db: Session = Depends(get_db)) -> ChartOut:
    claim = _get_claim(db, claim_id)
    recompute_claim(db, claim)
    db.refresh(claim)
    return _chart_out(db, claim)


@router.post("/claim-instances/{claim_id}/elements", response_model=ChartElementOut, status_code=201)
def add_claim_element(
    claim_id: uuid.UUID, payload: ElementCreate, db: Session = Depends(get_db)
) -> ChartElementOut:
    claim = _get_claim(db, claim_id)
    next_order = payload.element_order or (
        max((e.element_order for e in claim.elements), default=0) + 1
    )
    element = ClaimElement(
        claim_instance_id=claim.id,
        element_order=next_order,
        element_label=payload.element_label,
        element_description=payload.element_description,
        support_status=ClaimSupportStatus.not_researched,
    )
    db.add(element)
    _commit(db)
    db.refresh(element)
    return _chart_element_out(assess_element(element))


@router.patch("/claim-elements/{element_id}", response_model=ChartElementOut)
def update_claim_element(
    element_id: uuid.UUID, payload: ElementUpdate, db: Session = Depends(get_db)
) -> ChartElementOut:
    element = _get_element(db, element_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(element, field, value)
    claim = _get_claim(db, element.claim_instance_id)
    _commit(db)
    recompute_claim(db, claim)
    db.refresh(element)
    return _chart_element_out(assess_element(element))


@router.delete("/claim-elements/{element_id}", status_code=204)
def delete_claim_element(element_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    element = _get_element(db, element_id)
    claim = _get_claim(db, element.claim_instance_id)
    db.delete(element)
    _commit(db)
    recompute_claim(db, claim)


# ------------------------------------------------------------- proof linking


def _assert_polarity(p: Pol) -> str:
    return p


@router.post("/claim-elements/{element_id}/link-fact", response_model=ChartElementOut, status_code=201)
def link_fact_to_element(
    element_id: uuid.UUID, payload: LinkFactIn, db: Session = Depends(get_db)
) -> ChartElementOut:
    element = _get_element(db, element_id)
    fact = db.get(FactAssertion, payload.fact_id)
    if fact is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    if fact.matter_id != element.claim.matter_id:
        raise HTTPException(status_code=400, detail="Fact belongs to a different matter")
    clash = db.scalars(
        select(ClaimElementFactLink).where(
            ClaimElementFactLink.claim_element_id == element.id,
            ClaimElementFactLink.fact_id == fact.id,
            ClaimElementFactLink.link_polarity == _assert_polarity(payload.link_polarity),
        )
    ).first()
    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail="This fact is already linked to the element with that polarity",
        )
    element.fact_links.append(
        ClaimElementFactLink(
            fact_id=fact.id,
            link_polarity=payload.link_polarity,
            weight_label=payload.weight_label,
            notes=payload.notes,
        )
    )
    claim = _get_claim(db, element.claim_instance_id)
    _commit(db)
    recompute_claim(db, claim)  # Tech Spec §10.3: element links change -> recompute
    db.refresh(element)
    return _chart_element_out(assess_element(element))


@router.delete("/claim-elements/{element_id}/link-fact/{link_id}", status_code=204)
def unlink_fact_from_element(
    element_id: uuid.UUID, link_id: uuid.UUID, db: Session = Depends(get_db)
) -> None:
    element = _get_element(db, element_id)
    link = db.get(ClaimElementFactLink, link_id)
    if link is None or link.claim_element_id != element.id:
        raise HTTPException(status_code=404, detail="Fact link not found")
    db.delete(link)
    claim = _get_claim(db, element.claim_instance_id)
    _commit(db)
    recompute_claim(db, claim)


@router.post("/claim-elements/{element_id}/link-authority", response_model=ChartElementOut, status_code=201)
def link_authority_to_element(
    element_id: uuid.UUID, payload: LinkAuthorityIn, db: Session = Depends(get_db)
) -> ChartElementOut:
    from app.models.authority import Authority

    element = _get_element(db, element_id)
    if db.get(Authority, payload.authority_id) is None:
        raise HTTPException(status_code=404, detail="Authority not found")
    clash = db.scalars(
        select(ClaimElementAuthorityLink).where(
            ClaimElementAuthorityLink.claim_element_id == element.id,
            ClaimElementAuthorityLink.authority_id == payload.authority_id,
            ClaimElementAuthorityLink.link_type == payload.link_type,
        )
    ).first()
    if clash is not None:
        raise HTTPException(
            status_code=409, detail="Authority already linked to the element with that type"
        )
    element.authority_links.append(
        ClaimElementAuthorityLink(
            authority_id=payload.authority_id, link_type=payload.link_type
        )
    )
    _commit(db)
    claim = _get_claim(db, element.claim_instance_id)
    db.refresh(claim)
    if claim.authority_verification_state in (None, "pending"):
        claim.authority_verification_state = "verified" if payload.link_type in (
            AuthorityLinkType.controlling,
            AuthorityLinkType.persuasive,
        ) else claim.authority_verification_state
        _commit(db)
    db.refresh(element)
    return _chart_element_out(assess_element(element))


@router.delete("/claim-elements/{element_id}/link-authority/{link_id}", status_code=204)
def unlink_authority_from_element(
    element_id: uuid.UUID, link_id: uuid.UUID, db: Session = Depends(get_db)
) -> None:
    element = _get_element(db, element_id)
    link = db.get(ClaimElementAuthorityLink, link_id)
    if link is None or link.claim_element_id != element.id:
        raise HTTPException(status_code=404, detail="Authority link not found")
    db.delete(link)
    _commit(db)


# ---------------------------------------------------------------- candidates


_STOP = {
    "the", "and", "that", "this", "with", "for", "from", "were", "was", "had",
    "has", "have", "not", "but", "who", "whom", "which", "their", "them", "they",
    "upon", "into", "over", "under", "such", "also", "than", "then", "when",
    "where", "while", "after", "before", "between", "against", "because", "about",
}


def _tokens(text: str) -> set[str]:
    return {
        t.strip(".,;:()\"'—-")
        for t in (text or "").lower().split()
        if len(t) > 3 and t.strip(".,;:()\"'—-") not in _STOP
    }


@router.get(
    "/claim-elements/{element_id}/support-candidates",
    response_model=list[CandidateFactOut],
)
def support_candidates(
    element_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    include_linked: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[CandidateFactOut]:
    """Rank *accepted* facts as candidate support for an element (claim analysis
    flow step 2 / Tech Spec §11.3 element-support search, lexical v1)."""
    element = _get_element(db, element_id)
    claim = element.claim
    linked = {l.fact_id for l in element.fact_links}

    facts = (
        db.query(FactAssertion)
        .options(
            *element_load_for_fact_candidates()
        )
        .filter(FactAssertion.matter_id == claim.matter_id)
        .filter(FactAssertion.review_state.in_([ReviewState.accepted, ReviewState.accepted_with_edits]))
        .all()
    )

    el_tokens = _tokens(f"{element.element_label} {element.element_description or ''}")
    out: list[CandidateFactOut] = []
    for fact in facts:
        if not include_linked and fact.id in linked:
            continue
        score = 0
        reasons: list[str] = []
        overlap = len(el_tokens & _tokens(f"{fact.short_label or ''} {fact.statement_text}"))
        if overlap:
            score += overlap * 2
            reasons.append(f"{overlap} term match(es) with the element")
        anchors = [sl for sl in fact.support_links if sl.support_type == SupportType.supports and sl.source is not None]
        primary = [sl for sl in anchors if sl.source.source_status in PRIMARY_ANCHOR_STATUSES]
        if primary:
            score += 3
            reasons.append("anchored to a primary/public-record source")
        if fact.is_material:
            score += 2
            reasons.append("marked material")
        if fact.confidence_level == StrengthLabel.high:
            score += 1
            reasons.append("high confidence")
        titles = sorted({sl.source.title for sl in anchors})
        out.append(
            CandidateFactOut(
                fact_id=fact.id,
                short_label=fact.short_label,
                statement_text=fact.statement_text,
                review_state=fact.review_state.value,
                confidence_level=fact.confidence_level.value if fact.confidence_level else None,
                is_material=fact.is_material,
                score=score,
                score_reasons=reasons,
                evidence_sources=titles[:3],
            )
        )
    out.sort(key=lambda c: (-c.score, c.short_label or c.statement_text))
    return out[:limit]


def element_load_for_fact_candidates():
    from sqlalchemy.orm import selectinload

    return (
        selectinload(FactAssertion.support_links).joinedload(FactSupportLink.source),
    )

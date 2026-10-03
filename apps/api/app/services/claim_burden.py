"""Claim burden-of-proof engine (WS-CLAIMS).

Implements the two WS-CLAIMS invariants:

1. Elements are mapped to underlying *accepted* facts and, through
   ``fact_support_links``, to the evidence sources those facts rest on.
2. Burden-of-proof status is tracked at two levels:

   * per element  -> stored ``claim_elements.support_status``
     (``no_support | weak_support | moderate_support | strong_support |
     conflicted | not_researched``) and a derived 3-step burden
     (``unsupported | partially_supported | proven``)
   * per claim    -> derived rollup using the same 3-step vocabulary.

Derivation rules (documented so the UI can *explain* every badge):

``weight points``   high=3, medium=2, low=1, unset=2
``support_points``  sum of points over links with polarity ``support`` whose
                    fact is accepted (review_state accepted/accepted_with_edits)
``adverse_points``  same for polarity ``adverse``
``primary anchor``  at least one contributing supporting fact is anchored
                    (fact_support_link.support_type='supports') to a source with
                    source_status in {primary, public_record} and a review status
                    that is not excluded/privileged/settlement_restricted
``conflicted``      adverse_points >= 2, or a linked fact is disputed, or
                    adverse_points >= 1 while support_points <= 2

Computed element status:
  * no contributing support facts ................. ``no_support``
  * conflicted .................................... ``conflicted``
  * strong (>=4 pts, capped to moderate without a primary source anchor)
  * moderate (>=2 pts), otherwise ``weak_support``

Element burden:
  * ``unsupported``          no_support / not_researched
  * ``proven``               strong|moderate **and** a primary source anchor
                             (facially provable *from evidence*, not just notes)
  * ``partially_supported``  everything else (weak, conflicted, unanchored)

Claim rollup:
  * ``proven``               every element proven
  * ``unsupported``          no element reaches even partial support
  * ``partially_supported``  everything else
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session, joinedload

from app.models.claim import (
    ClaimElement,
    ClaimElementAuthorityLink,
    ClaimElementFactLink,
    ClaimInstance,
)
from app.models.enums import (
    AuthorityLinkType,
    BurdenStatus,
    ClaimSupportStatus,
    EvidenceReviewStatus,
    ReviewState,
    SourceStatus,
    StrengthLabel,
    SupportType,
)
from app.models.fact import FactAssertion

WEIGHT_POINTS: dict[StrengthLabel | None, int] = {
    StrengthLabel.high: 3,
    StrengthLabel.medium: 2,
    StrengthLabel.low: 1,
    None: 2,  # unweighted links count as medium
}

ACCEPTED_STATES = {ReviewState.accepted, ReviewState.accepted_with_edits}
DISPUTED_STATES = {ReviewState.disputed}

# Source classes that can carry the burden on their own.
PRIMARY_ANCHOR_STATUSES = {SourceStatus.primary, SourceStatus.public_record}
DISQUALIFYING_REVIEW = {
    EvidenceReviewStatus.excluded,
    EvidenceReviewStatus.privileged,
    EvidenceReviewStatus.settlement_restricted,
}

ELEMENT_SUPPORTS_BURDEN = {
    ClaimSupportStatus.moderate_support,
    ClaimSupportStatus.strong_support,
}
ELEMENT_ANY_SUPPORT = {
    ClaimSupportStatus.weak_support,
    ClaimSupportStatus.moderate_support,
    ClaimSupportStatus.strong_support,
    ClaimSupportStatus.conflicted,
}


@dataclass
class Warning:
    code: str
    message: str
    severity: str = "caution"  # "info" | "caution" | "alert"


@dataclass
class ElementAssessment:
    element: ClaimElement
    support_points: int = 0
    adverse_points: int = 0
    support_links: list[ClaimElementFactLink] = field(default_factory=list)
    adverse_links: list[ClaimElementFactLink] = field(default_factory=list)
    context_links: list[ClaimElementFactLink] = field(default_factory=list)
    inactive_links: list[ClaimElementFactLink] = field(default_factory=list)
    has_primary_anchor: bool = False
    testimony_only: bool = False
    has_disputed_fact: bool = False
    conflicted: bool = False
    computed_status: ClaimSupportStatus = ClaimSupportStatus.not_researched
    burden: BurdenStatus = BurdenStatus.unsupported
    warnings: list[Warning] = field(default_factory=list)

    @property
    def controlling_authority(self) -> bool:
        return any(
            a.link_type in (AuthorityLinkType.controlling, AuthorityLinkType.persuasive)
            for a in self.element.authority_links
        )


def _fact_is_accepted(fact: FactAssertion | None) -> bool:
    return fact is not None and fact.review_state in ACCEPTED_STATES


def _has_primary_anchor(fact: FactAssertion) -> bool:
    for sl in fact.support_links:
        if sl.support_type != SupportType.supports or sl.source is None:
            continue
        if sl.source.source_status in PRIMARY_ANCHOR_STATUSES and (
            sl.source.evidence_review_status not in DISQUALIFYING_REVIEW
        ):
            return True
    return False


def _source_backed_source_statuses(fact: FactAssertion) -> set[SourceStatus]:
    out: set[SourceStatus] = set()
    for sl in fact.support_links:
        if sl.support_type == SupportType.supports and sl.source is not None:
            out.add(sl.source.source_status)
    return out


def _classify_polarity(link: ClaimElementFactLink) -> str:
    polarity = (link.link_polarity or "support").lower()
    if polarity not in {"support", "adverse", "context"}:
        return "support"
    return polarity


def assess_element(element: ClaimElement) -> ElementAssessment:
    a = ElementAssessment(element=element)
    supporting_facts: list[FactAssertion] = []

    for link in element.fact_links:
        kind = _classify_polarity(link)
        fact = link.fact
        if fact is not None and fact.review_state in DISPUTED_STATES:
            a.has_disputed_fact = True
        if not _fact_is_accepted(fact):
            a.inactive_links.append(link)
            continue
        points = WEIGHT_POINTS.get(link.weight_label)
        if kind == "support":
            a.support_links.append(link)
            a.support_points += points
            if fact is not None:
                supporting_facts.append(fact)
        elif kind == "adverse":
            a.adverse_links.append(link)
            a.adverse_points += points
        else:
            a.context_links.append(link)

    a.has_primary_anchor = any(_has_primary_anchor(f) for f in supporting_facts)

    source_statuses: set[SourceStatus] = set()
    anchored_any = False
    for f in supporting_facts:
        sts = _source_backed_source_statuses(f)
        source_statuses |= sts
        anchored_any = anchored_any or bool(sts)
    a.testimony_only = anchored_any and source_statuses == {SourceStatus.testimony}

    a.conflicted = (
        a.adverse_points >= 2
        or a.has_disputed_fact
        or (a.adverse_points >= 1 and a.support_points <= 2)
    )

    if a.support_points == 0:
        a.computed_status = ClaimSupportStatus.no_support
    elif a.conflicted:
        a.computed_status = ClaimSupportStatus.conflicted
    else:
        if a.support_points >= 4:
            a.computed_status = (
                ClaimSupportStatus.strong_support
                if a.has_primary_anchor
                else ClaimSupportStatus.moderate_support
            )
        elif a.support_points >= 2:
            a.computed_status = ClaimSupportStatus.moderate_support
        else:
            a.computed_status = ClaimSupportStatus.weak_support

    if a.computed_status in (
        ClaimSupportStatus.no_support,
        ClaimSupportStatus.not_researched,
    ):
        a.burden = BurdenStatus.unsupported
    elif (
        a.computed_status in ELEMENT_SUPPORTS_BURDEN
        and a.has_primary_anchor
        and not a.conflicted
    ):
        a.burden = BurdenStatus.proven
    else:
        a.burden = BurdenStatus.partially_supported

    _attach_warnings(a)
    return a


def _attach_warnings(a: ElementAssessment) -> None:
    w = a.warnings
    if not a.support_links:
        w.append(
            Warning(
                "no_linked_facts",
                "No reviewed facts are linked to this element — the burden is entirely unmet.",
                "alert",
            )
        )
    elif a.support_points == 0:
        w.append(
            Warning(
                "no_accepted_support",
                "Linked facts are not accepted into the trusted record, so they cannot carry the burden.",
                "alert",
            )
        )
    if len(a.support_links) == 1 and a.support_points <= 3:
        w.append(
            Warning(
                "single_fact_support",
                "Only one fact supports this element; a single-source element is fragile under cross-examination.",
            )
        )
    if a.support_points > 0 and not a.has_primary_anchor:
        w.append(
            Warning(
                "no_primary_source_anchor",
                "No supporting fact is anchored to a primary or public-record source.",
            )
        )
    if a.testimony_only:
        w.append(
            Warning(
                "testimony_only",
                "Support rests only on testimony / working notes — no documentary anchor.",
                "alert",
            )
        )
    if a.adverse_points > 0:
        w.append(
            Warning(
                "adverse_facts",
                f"Adverse facts weigh against this element ({a.adverse_points} pts).",
                "alert",
            )
        )
    if a.has_disputed_fact:
        w.append(
            Warning(
                "disputed_fact",
                "A linked fact is currently marked disputed; resolve before relying on this element.",
                "alert",
            )
        )
    if not a.controlling_authority:
        w.append(
            Warning(
                "no_controlling_authority",
                "No controlling or persuasive authority is linked to this element.",
                "info",
            )
        )


# ---------------------------------------------------------------- claim level


@dataclass
class ClaimBurden:
    status: BurdenStatus
    elements_total: int
    proven_elements: int
    partial_elements: int
    unsupported_elements: int
    conflicted_elements: int
    explanation: str


def rollup_claim(assessments: list[ElementAssessment]) -> ClaimBurden:
    total = len(assessments)
    proven = sum(1 for a in assessments if a.burden == BurdenStatus.proven)
    partial = sum(1 for a in assessments if a.burden == BurdenStatus.partially_supported)
    unsupported = sum(1 for a in assessments if a.burden == BurdenStatus.unsupported)
    conflicted = sum(1 for a in assessments if a.computed_status == ClaimSupportStatus.conflicted)

    if total == 0:
        status = BurdenStatus.unsupported
        explanation = "The claim has no elements yet — chart it before assessing the burden."
    elif proven == total:
        status = BurdenStatus.proven
        explanation = (
            f"All {total} element(s) are supported by accepted facts anchored in primary evidence."
        )
    elif proven == 0 and partial == 0:
        status = BurdenStatus.unsupported
        explanation = "No element carries the burden yet — every element lacks anchored support."
    else:
        status = BurdenStatus.partially_supported
        explanation = (
            f"{proven} of {total} element(s) proven, {partial} partial, {unsupported} unsupported — "
            "the claim is not yet fully carried."
        )

    return ClaimBurden(
        status=status,
        elements_total=total,
        proven_elements=proven,
        partial_elements=partial,
        unsupported_elements=unsupported,
        conflicted_elements=conflicted,
        explanation=explanation,
    )


def highest_priority_gap(assessments: list[ElementAssessment]) -> str | None:
    """Pick the element most urgently in need of work, and phrase it for the chart header."""
    severity_rank = {
        "no_linked_facts": 3,
        "no_accepted_support": 3,
        "adverse_facts": 3,
        "disputed_fact": 3,
        "testimony_only": 2,
        "no_primary_source_anchor": 2,
        "single_fact_support": 1,
        "no_controlling_authority": 0,
    }
    best: tuple[int, ElementAssessment, Warning] | None = None
    for a in assessments:
        for warn in a.warnings:
            rank = severity_rank.get(warn.code, 0)
            if rank <= 0:
                continue
            if best is None or rank > best[0] or (
                rank == best[0] and a.element.element_order < best[1].element.element_order
            ):
                best = (rank, a, warn)
    if best is None:
        return None
    _, a, warn = best
    label = a.element.element_label
    return f"E{a.element.element_order} — {label}: {warn.message}"


# ------------------------------------------------------------------- loading


def load_claim_elements(db: Session, claim: ClaimInstance) -> list[ClaimElement]:
    return (
        db.query(ClaimElement)
        .options(
            joinedload(ClaimElement.fact_links)
            .joinedload(ClaimElementFactLink.fact)
            .selectinload(FactAssertion.support_links),
            joinedload(ClaimElement.authority_links).joinedload(
                ClaimElementAuthorityLink.authority
            ),
        )
        .filter(ClaimElement.claim_instance_id == claim.id)
        .order_by(ClaimElement.element_order)
        .all()
    )


def recompute_claim(db: Session, claim: ClaimInstance) -> list[ElementAssessment]:
    """Persist derived support status + highest-priority gap onto the row(s)."""
    elements = load_claim_elements(db, claim)
    assessments = [assess_element(el) for el in elements]
    for a in assessments:
        if a.element.support_status != a.computed_status:
            a.element.support_status = a.computed_status
    claim.highest_priority_gap = highest_priority_gap(assessments)
    db.commit()
    return assessments


def compute_claim_burden(db: Session, claim: ClaimInstance) -> tuple[ClaimBurden, list[ElementAssessment]]:
    elements = load_claim_elements(db, claim)
    assessments = [assess_element(el) for el in elements]
    return rollup_claim(assessments), assessments

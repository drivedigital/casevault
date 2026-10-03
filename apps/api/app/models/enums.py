"""Shared enums (Schema Draft §5). Names match `*_enum` Postgres types."""
from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


class _LabeledEnum(str, enum.Enum):
    """Base for value-equal enums so Pydantic and SQLAlchemy share the strings."""

    def label(self) -> str:  # pragma: no cover - display helper
        return self.value.replace("_", " ")


def sa_enum(member: type[_LabeledEnum], name: str) -> SAEnum:
    return SAEnum(
        member,
        name=name,
        values_callable=lambda e: [m.value for m in e],
        native_enum=True,
        create_constraint=True,
    )


class MatterType(_LabeledEnum):  # 5.2
    merits = "merits"
    proceeding = "proceeding"
    research = "research"
    other = "other"


class MatterStatus(_LabeledEnum):  # 5.3
    active = "active"
    planned = "planned"
    hold = "hold"
    archived = "archived"


class ActorType(_LabeledEnum):  # 5.4
    person = "person"
    entity = "entity"
    court = "court"
    agency = "agency"
    other = "other"


class SourceType(_LabeledEnum):  # 5.5
    pdf = "pdf"
    image = "image"
    email = "email"
    text = "text"
    markdown = "markdown"
    spreadsheet = "spreadsheet"
    note = "note"
    other = "other"


class SourceStatus(_LabeledEnum):  # 5.6 — proof classification
    primary = "primary"
    derived = "derived"
    testimony = "testimony"
    working_note = "working_note"
    public_record = "public_record"


class EvidenceReviewStatus(_LabeledEnum):  # 5.7
    uploaded = "uploaded"
    processing = "processing"
    reviewed = "reviewed"
    cited = "cited"
    included = "included"
    excluded = "excluded"
    duplicate = "duplicate"
    privileged = "privileged"
    settlement_restricted = "settlement_restricted"
    background_only = "background_only"
    impeachment_only = "impeachment_only"


class ReviewState(_LabeledEnum):  # 5.9
    proposed = "proposed"
    accepted = "accepted"
    accepted_with_edits = "accepted_with_edits"
    rejected = "rejected"
    deferred = "deferred"
    uncertain = "uncertain"
    superseded = "superseded"
    disputed = "disputed"


class FactType(_LabeledEnum):  # 5.10
    source_derived = "source_derived"
    user_entered = "user_entered"
    testimony = "testimony"
    procedural = "procedural"
    damage = "damage"
    other = "other"


class SupportType(_LabeledEnum):  # 5.11
    supports = "supports"
    contradicts = "contradicts"
    mentions = "mentions"
    background = "background"


class SupportOriginType(_LabeledEnum):  # 5.12
    source_excerpt = "source_excerpt"
    source_only = "source_only"
    user_memory = "user_memory"
    attorney_note = "attorney_note"
    agent_summary = "agent_summary"
    other = "other"


class StrengthLabel(_LabeledEnum):  # 5.13
    low = "low"
    medium = "medium"
    high = "high"


class ClaimSupportStatus(_LabeledEnum):  # 5.15
    no_support = "no_support"
    weak_support = "weak_support"
    moderate_support = "moderate_support"
    strong_support = "strong_support"
    conflicted = "conflicted"
    not_researched = "not_researched"


class AuthorityLinkType(_LabeledEnum):  # 5.16
    controlling = "controlling"
    persuasive = "persuasive"
    background = "background"
    open_question = "open_question"


class AuthorityType(_LabeledEnum):  # 5.21
    case = "case"
    statute = "statute"
    rule = "rule"
    jury_instruction = "jury_instruction"
    memo = "memo"
    note = "note"


class BurdenStatus(_LabeledEnum):
    """Claim-level burden-of-proof rollup (WS-CLAIMS invariant #2)."""

    unsupported = "unsupported"
    partially_supported = "partially_supported"
    proven = "proven"


class ElementLinkPolarity(_LabeledEnum):
    """`claim_element_fact_links.link_polarity` (Schema Draft 6.7)."""

    support = "support"
    adverse = "adverse"
    context = "context"

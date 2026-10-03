"""Wave 2 intake schema (contract wave2_intake_core.md v1.0, section 2).

Pins the shipped schema on both sides:
- the ORM metadata (this file runs against `Base.metadata.create_all`,
  see tests/api/conftest.py) and
- the Postgres objects themselves (tables, native enum types, constraints).

The migration path (upgrade -> downgrade base -> upgrade) is verified by
scripts/verify_all.sh; these tests pin the semantics that must hold in
both DDL sources: the five tables, the enum values/order, the
NULLS NOT DISTINCT link uniques, and the tags_json default.
"""
import uuid

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.models.actor import Actor
from app.models.enums import (
    FactType,
    ProposalType,
    ReviewState,
    StrengthLabel,
    SupportType,
)
from app.models.identity import User
from app.models.intake import (
    FactActorLink,
    FactAssertion,
    FactSourceLink,
    LedgerEntry,
    Proposal,
)
from app.models.matter import Matter
from app.models.source import Source
from app.models.workspace import Workspace

# Contract section 2: exact PG type names and value lists (order-sensitive —
# the enum sort order is part of the frozen contract).
CONTRACT_ENUMS = {
    "proposal_type_enum": [
        "fact",
        "event",
        "actor",
        "duplicate_merge",
        "date_normalization",
        "claim_mapping",
        "contradiction",
        "verification_task",
        "restriction",
    ],
    "review_state_enum": [
        "proposed",
        "accepted",
        "accepted_with_edits",
        "rejected",
        "deferred",
        "uncertain",
        "superseded",
        "disputed",
    ],
    "fact_type_enum": [
        "source_derived",
        "user_entered",
        "testimony",
        "procedural",
        "damage",
        "other",
    ],
    "support_type_enum": ["supports", "contradicts", "mentions", "background"],
    "strength_label_enum": ["low", "medium", "high"],
}

CONTRACT_TABLES = {
    "ledger_entries",
    "proposals",
    "fact_assertions",
    "fact_source_links",
    "fact_actor_links",
}

PYTHON_ENUMS = {
    "proposal_type_enum": ProposalType,
    "review_state_enum": ReviewState,
    "fact_type_enum": FactType,
    "support_type_enum": SupportType,
    "strength_label_enum": StrengthLabel,
}


def _seed(db):
    """User + workspace + matter + actor + source — the FK targets."""
    user = User(email="owner@example.test", display_name="Local Owner")
    db.add(user)
    db.flush()
    workspace = Workspace(name="Test Workspace", created_by_user_id=user.id)
    db.add(workspace)
    db.flush()
    matter = Matter(workspace_id=workspace.id, slug="m-1", name="Matter One")
    actor = Actor(
        workspace_id=workspace.id, actor_type="person", display_name="A. Witness"
    )
    source = Source(
        workspace_id=workspace.id,
        source_type="note",
        title="Source One",
        storage_path=f"scratch/{uuid.uuid4()}.txt",
    )
    db.add_all([matter, actor, source])
    db.flush()
    return workspace, matter, actor, source


def _enum_labels_for(db_engine_or_session, type_name):
    return [
        row[0]
        for row in db_engine_or_session.execute(
            sa.text(
                """
                SELECT e.enumlabel
                FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                WHERE t.typname = :name
                ORDER BY e.enumsortorder
                """
            ),
            {"name": type_name},
        )
    ]


def _unique_definition(session, table_name, constraint_name):
    return session.execute(
        sa.text(
            """
            SELECT pg_get_constraintdef(c.oid)
            FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = :table AND c.conname = :name
            """
        ),
        {"table": table_name, "name": constraint_name},
    ).scalar()


def test_intake_tables_exist(db):
    inspector = sa.inspect(db.get_bind())
    tables = set(inspector.get_table_names())
    assert CONTRACT_TABLES <= tables


def test_enum_types_match_contract(db):
    for type_name, expected in CONTRACT_ENUMS.items():
        assert _enum_labels_for(db, type_name) == expected, type_name


def test_python_enums_match_contract(db):
    for type_name, python_enum in PYTHON_ENUMS.items():
        assert [member.value for member in python_enum] == CONTRACT_ENUMS[type_name]
        assert [member.value for member in python_enum] == _enum_labels_for(db, type_name)


def test_ledger_tags_json_defaults_to_empty_array(db):
    workspace, *_ = _seed(db)
    entry = LedgerEntry(
        workspace_id=workspace.id,
        fact_short_name="Tenant excluded",
        fact_statement="Tenant was excluded from 2F on 2024-05-01.",
    )
    db.add(entry)
    db.flush()
    db.refresh(entry)
    assert entry.tags_json == []

    entry.tags_json = ["exclusion", "2024"]
    db.flush()
    db.refresh(entry)
    assert entry.tags_json == ["exclusion", "2024"]


def test_ledger_partial_unique_on_external_id(db):
    workspace, matter, *_ = _seed(db)
    common = {
        "workspace_id": workspace.id,
        "matter_id": matter.id,
        "external_ledger_id": "EXT-1",
        "fact_short_name": "Row",
        "fact_statement": "Statement.",
    }
    db.add(LedgerEntry(**common))
    db.flush()

    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(LedgerEntry(**common))
        db.flush()

    # NULL external ids never collide with each other (partial unique)
    for _ in range(2):
        db.add(
            LedgerEntry(
                workspace_id=workspace.id,
                matter_id=matter.id,
                fact_short_name="No external id",
                fact_statement="Statement.",
            )
        )
    db.flush()


def test_excerptless_source_links_cannot_duplicate(db):
    workspace, matter, _, source = _seed(db)
    fact = FactAssertion(
        workspace_id=workspace.id,
        matter_id=matter.id,
        statement_text="Tenant was excluded from 2F.",
        fact_type=FactType.source_derived,
    )
    db.add(fact)
    db.flush()

    # NULLS NOT DISTINCT: the constraint definition says so...
    definition = _unique_definition(
        db,
        "fact_source_links",
        "uq_fact_source_links__fact__source__excerpt__support",
    )
    assert definition is not None and "NULLS NOT DISTINCT" in definition

    # ...and two excerpt-less links with the same support type are rejected.
    db.add(
        FactSourceLink(
            fact_id=fact.id, source_id=source.id, excerpt_id=None,
            support_type=SupportType.supports,
        )
    )
    db.flush()
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            FactSourceLink(
                fact_id=fact.id, source_id=source.id, excerpt_id=None,
                support_type=SupportType.supports,
            )
        )
        db.flush()

    # A different support type (or a real excerpt) is a different tuple.
    db.add(
        FactSourceLink(
            fact_id=fact.id, source_id=source.id, excerpt_id=None,
            support_type=SupportType.contradicts,
        )
    )
    db.flush()


def test_roleless_actor_links_cannot_duplicate(db):
    workspace, matter, actor, _ = _seed(db)
    fact = FactAssertion(
        workspace_id=workspace.id,
        matter_id=matter.id,
        statement_text="Tenant was excluded from 2F.",
    )
    db.add(fact)
    db.flush()

    definition = _unique_definition(
        db, "fact_actor_links", "uq_fact_actor_links__fact__actor__role"
    )
    assert definition is not None and "NULLS NOT DISTINCT" in definition

    db.add(FactActorLink(fact_id=fact.id, actor_id=actor.id, role_in_fact=None))
    db.flush()
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(FactActorLink(fact_id=fact.id, actor_id=actor.id, role_in_fact=None))
        db.flush()

    # Same actor in a named role is a different tuple.
    db.add(FactActorLink(fact_id=fact.id, actor_id=actor.id, role_in_fact="custodian"))
    db.flush()


def test_contract_column_defaults(db):
    workspace, matter, *_ = _seed(db)

    proposal = Proposal(
        workspace_id=workspace.id, matter_id=matter.id, proposal_type=ProposalType.fact
    )
    fact = FactAssertion(
        workspace_id=workspace.id,
        matter_id=matter.id,
        statement_text="A newly created fact.",
    )
    db.add_all([proposal, fact])
    db.flush()
    db.refresh(proposal)
    db.refresh(fact)

    # §2: proposals default to review_state=proposed, structured json {}, system-created
    assert proposal.review_state == ReviewState.proposed
    assert proposal.proposed_structured_json == {}
    assert proposal.created_by_system is True
    # §2: facts default to proposed / source_derived / not material
    assert fact.review_state == ReviewState.proposed
    assert fact.fact_type == FactType.source_derived
    assert fact.is_material is False
    # attributes the review-state floor keeps null until approval
    assert fact.approved_by_user_id is None
    assert fact.approved_at is None
    # enum round-trip: members come back as enum instances
    assert fact.confidence_level is None
    assert isinstance(proposal.review_state, ReviewState)


def test_link_tables_have_created_at_only(db):
    """§2: link rows carry created_at, not updated_at."""
    inspector = sa.inspect(db.get_bind())
    for table in ("fact_source_links", "fact_actor_links"):
        columns = {c["name"] for c in inspector.get_columns(table)}
        assert "created_at" in columns
        assert "updated_at" not in columns


def test_strength_label_used_by_ledger_confidence(db):
    """§2: ledger confidence_level is the shared strength_label_enum."""
    workspace, matter, *_ = _seed(db)
    entry = LedgerEntry(
        workspace_id=workspace.id,
        matter_id=matter.id,
        fact_short_name="Row",
        fact_statement="Statement.",
        confidence_level=StrengthLabel.medium,
    )
    db.add(entry)
    db.flush()
    db.refresh(entry)
    assert entry.confidence_level == StrengthLabel.medium

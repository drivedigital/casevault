"""Wave 2 (WS-E) — intake core schema checks (contract wave2_intake_core.md
v1.0, section 2).

Runs against the real Postgres test database. The API fixture
(tests/api/conftest.py) builds the schema from model metadata with
create_all; the migration path (0004) itself is verified by the wave
gate's upgrade/downgrade/re-upgrade sequence on a fresh DB. These tests
pin the contract's tables, enum values, NULLS NOT DISTINCT uniques, and
defaults so a silent schema drift in either path fails CI.
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.actor import Actor
from app.models.enums import ActorType, SourceType
from app.models.identity import User
from app.models.intake import (
    FactActorLink,
    FactAssertion,
    FactSourceLink,
    LedgerEntry,
    Proposal,
)
from app.models.matter import Matter
from app.models.source import Source, SourceExcerpt
from app.models.workspace import Workspace

INTAKE_TABLES = (
    "ledger_entries",
    "proposals",
    "fact_assertions",
    "fact_source_links",
    "fact_actor_links",
)

# Contract §2: PG type names and exact values, in declaration order.
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


def _enum_values(db, type_name: str) -> list[str]:
    rows = db.execute(
        text(
            "SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid "
            "WHERE t.typname = :name ORDER BY e.enumsortorder"
        ),
        {"name": type_name},
    ).scalars()
    return list(rows)


@pytest.fixture()
def graph(db):
    """A minimal object graph satisfying the intake FKs."""
    user = User(email=f"intake-{uuid.uuid4().hex[:10]}@example.com", display_name="Intake")
    ws = Workspace(name="Intake WS", created_by_user_id=None)
    db.add(user)
    db.flush()
    ws.created_by_user_id = user.id
    db.add(ws)
    db.flush()

    matter = Matter(workspace_id=ws.id, slug="intake", name="Intake Matter")
    db.add(matter)
    db.flush()  # Python-side UUID default: matter.id is only set after flush

    source = Source(
        workspace_id=ws.id,
        source_type=SourceType.text,
        title="Intake Source",
        storage_path="intake/source.txt",
    )
    actor = Actor(
        workspace_id=ws.id, actor_type=ActorType.person, display_name="Intake Witness"
    )
    fact = FactAssertion(
        workspace_id=ws.id, matter_id=matter.id, statement_text="Tenant was excluded."
    )
    db.add_all([source, actor, fact])
    db.flush()
    excerpt = SourceExcerpt(
        source_id=source.id, excerpt_type="paragraph", page_start=1
    )
    db.add(excerpt)
    db.flush()
    # Commit so constraint-violation tests (savepoint + session rollback)
    # can clear session state without losing these rows. conftest still
    # truncates every table between tests.
    db.commit()
    yield {
        "user": user,
        "ws": ws,
        "matter": matter,
        "source": source,
        "actor": actor,
        "fact": fact,
        "excerpt": excerpt,
    }


def _expect_violation(db, obj):
    """Attempt to flush `obj` inside a savepoint and expect a constraint
    violation. The savepoint rollback undoes the offending INSERT; the
    follow-up session rollback only clears the session's pending-rollback
    state (the `graph` fixture commits its rows, so they survive)."""
    db.add(obj)
    with pytest.raises(IntegrityError), db.begin_nested():
        db.flush()
    db.rollback()


def test_intake_tables_exist(db):
    existing = {
        r[0]
        for r in db.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
    }
    missing = [t for t in INTAKE_TABLES if t not in existing]
    assert not missing, f"missing intake tables: {missing}"


def test_enum_types_match_contract(db):
    for type_name, expected in CONTRACT_ENUMS.items():
        assert _enum_values(db, type_name) == expected, f"{type_name} values drifted"
    # The Python enums must agree with the contract too (guards both sides).
    from app.models import enums

    assert [e.value for e in enums.ProposalType] == CONTRACT_ENUMS["proposal_type_enum"]
    assert [e.value for e in enums.ReviewState] == CONTRACT_ENUMS["review_state_enum"]
    assert [e.value for e in enums.FactType] == CONTRACT_ENUMS["fact_type_enum"]
    assert [e.value for e in enums.SupportType] == CONTRACT_ENUMS["support_type_enum"]
    assert [e.value for e in enums.StrengthLabel] == CONTRACT_ENUMS["strength_label_enum"]


def _constraint_def(db, constraint_name: str) -> str:
    return db.execute(
        text(
            "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
            "WHERE c.conname = :name"
        ),
        {"name": constraint_name},
    ).scalar_one()


def test_nulls_not_distinct_unique_constraints(db):
    # DDL level: both link uniques must be declared NULLS NOT DISTINCT.
    for name in (
        "uq_fact_source_links__fact__source__excerpt__support",
        "uq_fact_actor_links__fact__actor__role",
    ):
        assert "NULLS NOT DISTINCT" in _constraint_def(db, name).upper(), name


def test_excerptless_source_links_cannot_duplicate(db, graph):
    fact, source = graph["fact"], graph["source"]
    first = FactSourceLink(fact_id=fact.id, source_id=source.id)  # no excerpt
    db.add(first)
    db.flush()
    db.commit()  # must outlive the rollback inside _expect_violation

    # Same (fact, source, NULL excerpt, support_type) tuple → rejected.
    # A plain UNIQUE constraint would allow this (NULLs are distinct).
    _expect_violation(db, FactSourceLink(fact_id=fact.id, source_id=source.id))

    # Different support_type or a real excerpt is a different tuple → allowed.
    db.add(
        FactSourceLink(
            fact_id=fact.id, source_id=source.id, support_type="contradicts"
        )
    )
    db.add(
        FactSourceLink(
            fact_id=fact.id, source_id=source.id, excerpt_id=graph["excerpt"].id
        )
    )
    db.flush()
    assert len(fact.source_links) == 3

    # Support type defaulted to 'supports' per contract §2.
    assert first.support_type == "supports"


def test_roleless_actor_links_cannot_duplicate(db, graph):
    fact, actor = graph["fact"], graph["actor"]
    db.add(FactActorLink(fact_id=fact.id, actor_id=actor.id))  # no role
    db.flush()
    db.commit()  # must outlive the rollback inside _expect_violation

    _expect_violation(db, FactActorLink(fact_id=fact.id, actor_id=actor.id))

    db.add(FactActorLink(fact_id=fact.id, actor_id=actor.id, role_in_fact="witness"))
    db.flush()
    assert len(fact.actor_links) == 2


def test_ledger_tags_json_defaults_to_empty_array(db, graph):
    entry = LedgerEntry(
        workspace_id=graph["ws"].id,
        fact_short_name="Exclusion",
        fact_statement="Tenant was excluded from 2F.",
    )
    db.add(entry)
    db.flush()
    assert entry.tags_json == []

    # Explicit tags round-trip.
    entry.tags_json = ["rent-charge", "2024"]
    db.flush()
    db.refresh(entry)
    assert entry.tags_json == ["rent-charge", "2024"]


def test_ledger_partial_unique_on_external_id(db, graph):
    ws, matter = graph["ws"], graph["matter"]
    db.add(
        LedgerEntry(
            workspace_id=ws.id,
            matter_id=matter.id,
            external_ledger_id="EXT-1",
            fact_short_name="Row 1",
            fact_statement="Statement 1",
        )
    )
    db.flush()
    db.commit()  # must outlive the rollback inside _expect_violation

    # Same external id in the same matter → rejected.
    _expect_violation(
        db,
        LedgerEntry(
            workspace_id=ws.id,
            matter_id=matter.id,
            external_ledger_id="EXT-1",
            fact_short_name="Row 2",
            fact_statement="Statement 2",
        ),
    )

    # No external id → not constrained; multiple NULL rows are fine.
    for i in range(2):
        db.add(
            LedgerEntry(
                workspace_id=ws.id,
                matter_id=matter.id,
                fact_short_name=f"Row {i}",
                fact_statement=f"Statement {i}",
            )
        )
    db.flush()


def test_contract_column_defaults(db, graph):
    proposal = Proposal(
        workspace_id=graph["ws"].id,
        proposal_type="fact",
        proposed_text="Tenant was excluded from 2F.",
    )
    fact = FactAssertion(
        workspace_id=graph["ws"].id,
        matter_id=graph["matter"].id,
        statement_text="Statement",
    )
    db.add_all([proposal, fact])
    db.flush()

    assert proposal.review_state == "proposed"
    assert proposal.proposed_structured_json == {}
    assert proposal.created_by_system is True
    assert fact.review_state == "proposed"
    assert fact.fact_type == "source_derived"
    assert fact.is_material is False

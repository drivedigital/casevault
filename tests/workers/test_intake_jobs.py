"""W2-G — §4.4 proposal generation job, run against real Postgres.

Self-contained fixtures (tests/workers has no conftest of its own): the module
builds the schema from model metadata like tests/api/conftest.py, seeds sources
+ pages directly through the ORM, and calls the job the way a worker would —
plain string ids, its own session.
"""
import os
import tempfile

# never touch the real ./data tree from tests
os.environ.setdefault("LOCAL_STORAGE_ROOT", tempfile.mkdtemp(prefix="casevault-w2g-worker-"))

import pytest
from sqlalchemy import create_engine

import app.models  # noqa: F401  (registers every model with Base.metadata)
from app.db.base import Base
from app.models.enums import ProposalType, ReviewState, SourceType
from app.models.intake import Proposal
from app.models.source import Source, SourcePage
from app.models.workspace import Workspace

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault_test"),
)

from workers.pipeline.intake_jobs import (
    MAX_PARAGRAPH_CHARS,
    MIN_PARAGRAPH_CHARS,
    enqueue_proposal_generation,
    generate_fact_proposals,
)

_engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
Base.metadata.create_all(_engine)


@pytest.fixture()
def db():
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    session = factory()
    yield session
    session.close()
    with _engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def workspace(db):
    from app.models.identity import User

    user = User(email="worker@casevault.local", display_name="Worker Test User")
    db.add(user)
    db.flush()
    ws = Workspace(name="Worker Test Workspace", created_by_user_id=user.id)
    db.add(ws)
    db.commit()
    return ws


def seed_source(db, workspace, *page_texts, title="worker source"):
    source = Source(
        workspace_id=workspace.id,
        source_type=SourceType.text,
        title=title,
        storage_path="uploads/synthetic.txt",
        page_count=len(page_texts),
    )
    db.add(source)
    db.flush()
    for n, text in enumerate(page_texts, start=1):
        db.add(SourcePage(source_id=source.id, page_number=n, page_label=str(n), ocr_text=text))
    db.commit()
    return source


def _para(i: int, *, pad: int = 60) -> str:
    return f"Paragraph {i} padded to a comfortable length for intake." + ("x" * pad)


def test_generate_creates_proposals_from_pages(db, workspace):
    source = seed_source(
        db,
        workspace,
        # page 1: one long paragraph, one short skip, one duplicate of it below
        f"{_para(1)}\n\nshort one\n\n{_para(1)}\n\n{_para(2)}",
        # page 2: separate page, same sweep
        f"{_para(3)}\n\n   \n\n{_para(4)}",
    )
    result = generate_fact_proposals(str(source.id), str(workspace.id), database_url=TEST_DB_URL)
    assert result["job"] == "generate_fact_proposals"
    assert result["status"] == "complete"
    assert result["created"] == 4
    assert result["skipped"] == 2  # <40 chars + same-paragraph duplicate
    assert result["reason"] is None

    rows = db.query(Proposal).filter(Proposal.source_id == source.id).order_by(
        Proposal.created_at, Proposal.title
    ).all()
    assert len(rows) == 4
    for row in rows:
        # contract §4.4 + the §4.1 floor: system proposals land `proposed`
        assert row.proposal_type == ProposalType.fact
        assert row.review_state == ReviewState.proposed
        assert row.created_by_system is True
        assert row.confidence_score is None
        assert row.matter_id is None
        assert row.title == row.proposed_text[:80]
        assert len(row.title) <= 80
        assert row.proposed_structured_json["provenance_key"]
        assert "page_number" in row.proposed_structured_json
    db.expire_all()
    texts = [r.proposed_text for r in rows]
    assert texts == [_para(1), _para(2), _para(3), _para(4)]
    # short paragraphs never land, even trimmed
    assert all(len(t) >= MIN_PARAGRAPH_CHARS for t in texts)


def test_rerun_is_idempotent(db, workspace):
    source = seed_source(db, workspace, f"{_para(1)}\n\n{_para(2)}")
    first = generate_fact_proposals(str(source.id), str(workspace.id), database_url=TEST_DB_URL)
    assert first["created"] == 2
    again = generate_fact_proposals(str(source.id), str(workspace.id), database_url=TEST_DB_URL)
    assert again["status"] == "complete"
    assert again["created"] == 0
    assert again["skipped"] == 2  # provenance keys already recorded for this source
    assert db.query(Proposal).count() == 2


def test_max_proposals_cap(db, workspace):
    body = "\n\n".join(_para(i) for i in range(6))
    source = seed_source(db, workspace, body)
    result = generate_fact_proposals(
        str(source.id), str(workspace.id), max_proposals=3, database_url=TEST_DB_URL
    )
    assert result["created"] == 3
    assert result["skipped"] == 3  # everything past the cap counts as skipped
    assert db.query(Proposal).count() == 3


def test_long_paragraphs_are_trimmed_to_the_cap(db, workspace):
    long_para = "Very long complaint narrative. " * 200  # ~5600 chars
    source = seed_source(db, workspace, long_para)
    result = generate_fact_proposals(str(source.id), str(workspace.id), database_url=TEST_DB_URL)
    assert result["created"] == 1
    row = db.query(Proposal).one()
    assert len(row.proposed_text) == MAX_PARAGRAPH_CHARS


def test_pages_without_text_are_ignored(db, workspace):
    source = seed_source(db, workspace, "")
    # empty page (no extracted text) → nothing to propose, still complete
    result = generate_fact_proposals(str(source.id), str(workspace.id), database_url=TEST_DB_URL)
    assert result["status"] == "complete"
    assert (result["created"], result["skipped"]) == (0, 0)
    assert db.query(Proposal).count() == 0


def test_job_never_raises_on_bad_input(db, workspace):
    # unknown source id
    result = generate_fact_proposals(
        "2f4a0000-0000-4000-8000-000000000000", str(workspace.id), database_url=TEST_DB_URL
    )
    assert result["status"] == "failed"
    assert "not found" in result["reason"]
    # real source, wrong workspace → same treatment
    source = seed_source(db, workspace, _para(1))
    from app.models.identity import User

    user = db.query(User).first()
    other_ws = Workspace(name="Other Workspace", created_by_user_id=user.id)
    db.add(other_ws)
    db.commit()
    result = generate_fact_proposals(str(source.id), str(other_ws.id), database_url=TEST_DB_URL)
    assert result["status"] == "failed"
    assert result["created"] == 0
    assert db.query(Proposal).count() == 0


def test_enqueue_reports_gracefully_without_redis(db, workspace, monkeypatch):
    # an unused port: redis lib is installed, but nothing is listening → queued=False
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:6399/0")
    source = seed_source(db, workspace, _para(1))
    result = enqueue_proposal_generation(str(source.id), str(workspace.id))
    assert set(result) == {"queued", "job_id", "reason"}
    assert result["queued"] is False
    assert result["job_id"] is None
    assert isinstance(result["reason"], str) and result["reason"]


def test_enqueue_forwards_cap_through_real_rq_parsing(monkeypatch):
    """Integrator round 2 (on c174051): RQ 2.x `Queue.parse_args` asserts
    `args == ()` whenever explicit args=/kwargs= are used, so the previous
    `enqueue(f, sid, wid, kwargs=...)` mix was invalid RQ syntax — and being
    inside the try/except, it degraded silently to queued=False instead of
    failing the suite. This test drives the REAL rq argument-parsing layer
    with zero Redis: `create_job`/`enqueue_job` are the only steps that touch
    the connection, so they are stubbed at that boundary and everything before
    (parse_args incl.) runs unmocked. Covers both the supplied and omitted
    limit."""
    import sys
    import types
    from unittest import mock

    import rq
    from workers.pipeline import intake_jobs as ij

    captured: dict = {}

    def fake_create_job(self, func, *, args=None, kwargs=None, **options):
        captured["func"] = func
        captured["args"] = args
        captured["kwargs"] = kwargs
        captured["options"] = options
        return types.SimpleNamespace(id="job-42")

    def fake_enqueue_job(self, job, *, pipeline=None, at_front=False, unique=False):
        captured["queue"] = self.name
        return job

    monkeypatch.setattr(rq.Queue, "create_job", fake_create_job)
    monkeypatch.setattr(rq.Queue, "enqueue_job", fake_enqueue_job)
    conn = mock.MagicMock()
    monkeypatch.setitem(
        sys.modules, "redis",
        types.SimpleNamespace(Redis=types.SimpleNamespace(from_url=lambda *a, **k: conn)),
    )

    result = ij.enqueue_proposal_generation("src-id", "ws-id", max_proposals=1)
    assert result == {"queued": True, "job_id": "job-42", "reason": None}
    assert captured["queue"] == "extract"  # frozen queue name (workers/queues.py)
    assert captured["func"] == "workers.pipeline.intake_jobs.generate_fact_proposals"
    # exactly what a worker unpacks: two positional ids + the cap as a kwarg
    assert captured["args"] == ("src-id", "ws-id")
    assert captured["kwargs"] == {"max_proposals": 1}
    assert captured["options"]["status"] == "queued"

    # cap omitted -> wire stays clean; the job-side default (50) applies
    captured.clear()
    result = ij.enqueue_proposal_generation("src-id", "ws-id")
    assert result["queued"] is True and result["reason"] is None
    assert captured["args"] == ("src-id", "ws-id")
    assert captured["kwargs"] is None


def test_queued_job_consumes_the_forwarded_cap(db, workspace):
    """Parity: the job invoked with exactly what the enqueue puts on the wire —
    two positional ids plus a `max_proposals` kwarg — caps identically."""
    source = seed_source(db, workspace, *(_para(i) for i in range(5)))
    result = generate_fact_proposals(
        str(source.id), str(workspace.id), max_proposals=2, database_url=TEST_DB_URL
    )
    assert result["created"] == 2 and result["skipped"] == 3

"""API test fixtures.

Tests run against a REAL Postgres (TEST_DATABASE_URL or DATABASE_URL env,
defaulting to the local docker postgres target db `casevault_test`).
The schema is created from model metadata and all rows are deleted between
tests — migrations themselves are verified separately by CI's
`alembic upgrade head` step.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault_test"
    ),
)
# pytest runs other files (health tests) which don't need a DB; only this
# fixture requires one, and it fails loudly if postgres is down (that is the
# intended local/CI contract: make infra-up first).

_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
Base.metadata.create_all(_engine)


@pytest.fixture()
def db():
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    session = factory()
    yield session
    session.close()
    # clean all tables between tests, preserving schema + enum types
    with _engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture()
def client(db):
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

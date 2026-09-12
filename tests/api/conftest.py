"""API test fixtures.

Tests require an explicit TEST_DATABASE_URL naming a disposable test/CI database.
The schema is created from model metadata and all rows are deleted between
tests — migrations themselves are verified separately by CI's
`alembic upgrade head` step.
"""
import os

# Validate before app imports or any database connection.
import runpy
import tempfile
from pathlib import Path

_guard = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts/test_database_guard.py"))
TEST_DATABASE_URL = _guard["require_disposable_database"](os.environ.get("TEST_DATABASE_URL"))

# Redirect evidence storage to a scratch dir BEFORE the app/settings import
# so upload tests never write into the real ./data tree.
_STORAGE_ROOT = tempfile.mkdtemp(prefix="casevault-test-storage-")
os.environ["LOCAL_STORAGE_ROOT"] = _STORAGE_ROOT

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app

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

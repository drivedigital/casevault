"""Shared fixtures for API tests (SQLite in-memory; no Docker required)."""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register all models on metadata)
from app.db.base import Base
from app.db.session import get_db
from app.main import app as fastapi_app


@pytest.fixture()
def engine() -> Iterator[Engine]:
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as s:
        yield s


@pytest.fixture()
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    def _override() -> Iterator[Session]:
        with session_factory() as s:
            yield s

    fastapi_app.dependency_overrides[get_db] = _override
    # NOTE: constructed without a context manager on purpose — TestClient then
    # skips the app lifespan (no init_db against the real dev database).
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()


def S(x) -> str:  # noqa: N802 - shorthand
    return str(x)


@pytest.fixture()
def new_id() -> uuid.UUID:
    return uuid.uuid4()

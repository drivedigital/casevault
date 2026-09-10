"""WS-B contract tests: storage service (§4) + ingest/OCR jobs (§5).

Covers the brief's required proofs: storage round-trip, traversal guard,
sha256, the text-file OCR path, and the no-redis enqueue degrade.

The job tests run against a REAL Postgres (TEST_DATABASE_URL / DATABASE_URL —
repo posture: no DB mocks, handoff/AGENT_POLICY.md §4.3) and a scratch
LOCAL_STORAGE_ROOT; tests never write into the repo's ``data/`` tree and use
synthetic fixtures only.
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from workers.pipeline.enqueue import enqueue_ingest, enqueue_ocr
from workers.pipeline.source_jobs import ingest_source, ocr_source

from app.integrations.storage import (
    LocalFileStorage,
    StorageKeyError,
    StorageLimitError,
    StoredObject,
    classify_source_type,
    get_storage,
    ocr_page_key,
    original_key,
    processed_key,
    thumbnail_key,
)

# ---------------------------------------------------------------------------
# Environment pinning — must happen before the FIRST get_settings() call.
# (Settings are instantiated lazily everywhere, so plain imports above are
# safe; these lines re-point the process at the test database + scratch
# storage before any test can touch settings.)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault_test"),
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
# Scratch storage root: reuse the tests/api conftest dir in a full-suite run,
# create our own when this file runs standalone. Never the repo's ./data.
os.environ.setdefault(
    "LOCAL_STORAGE_ROOT", tempfile.mkdtemp(prefix="casevault-wsb-storage-")
)

from app.config import get_settings

get_settings.cache_clear()  # re-read the env pinned above
from app.db.base import Base
from app.db.session import get_engine, get_session_factory

get_engine.cache_clear()
get_session_factory.cache_clear()

from app.models.identity import User
from app.models.source import Source, SourceMetadata, SourcePage
from app.models.workspace import Workspace

_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
Base.metadata.create_all(_engine)

PYPDF_INSTALLED = importlib.util.find_spec("pypdf") is not None

_TEXT_BODY = b"Deposition line one.\nLine two of the synthetic fixture.\n"


# ---------------------------------------------------------------------------
# fixtures / helpers
# ---------------------------------------------------------------------------
@pytest.fixture()
def storage(tmp_path: Path) -> LocalFileStorage:
    """Explicit-root storage instance (unit-level, no settings dependency)."""
    return LocalFileStorage(root=tmp_path, max_upload_mb=200)


@pytest.fixture()
def db():
    """Session from the SAME factory the worker jobs use, cleaned per test."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
        with _engine.begin() as conn:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())


def _make_source(db, *, filename: str, content: bytes, source_type: str, write_file: bool = True):
    """Workspace + source row; the file lands at the §4.2 original key.

    Writes go through ``get_storage()`` — the SAME instance the worker jobs
    read with — so file paths line up. sha256/file_size_bytes are deliberately
    left NULL so ingest has work to do (contract: "recompute sha256/size when
    missing").
    """
    user = User(email=f"{uuid.uuid4().hex}@example.test", display_name="WS-B test")
    db.add(user)
    db.flush()
    workspace = Workspace(name=f"ws-{uuid.uuid4().hex[:8]}", created_by_user_id=user.id)
    db.add(workspace)
    db.flush()
    source_id = uuid.uuid4()
    key = original_key(workspace.id, source_id, os.path.splitext(filename)[1])
    if write_file:
        get_storage().save_upload(io.BytesIO(content), key=key)
    source = Source(
        id=source_id,
        workspace_id=workspace.id,
        source_type=source_type,
        title=filename,
        original_filename=filename,
        storage_path=key,
        processing_status="queued",
        ocr_status="not_started",
    )
    db.add(source)
    db.commit()
    return workspace, source


def _reload(db, model, pk):
    """Drop the local session's cache so job-side commits become visible."""
    db.expire_all()
    return db.get(model, pk)


def _temp_entries(root: Path) -> list[str]:
    """Files left in <root>/temp (the dir may legitimately not exist yet)."""
    temp = root / "temp"
    return [p.name for p in temp.iterdir()] if temp.is_dir() else []


# ---------------------------------------------------------------------------
# §4.2 key layout
# ---------------------------------------------------------------------------
def test_key_layout_matches_contract():
    ws, src = uuid.uuid4(), uuid.uuid4()
    assert original_key(ws, src, ".pdf") == f"uploads/{ws}/{src}/original.pdf"
    assert original_key(ws, src, "PDF") == f"uploads/{ws}/{src}/original.pdf"  # normalized
    assert original_key(ws, src, "") == f"uploads/{ws}/{src}/original"
    assert processed_key(ws, src, "layout.json") == f"processed/{ws}/{src}/layout.json"
    assert ocr_page_key(ws, src, 3) == f"ocr/{ws}/{src}/pages/3.json"
    assert thumbnail_key(ws, src, 2) == f"thumbnails/{ws}/{src}/page-2.png"


# ---------------------------------------------------------------------------
# §4.3 classification map
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("a.pdf", "pdf"),
        ("B.PNG", "image"),
        ("c.jpeg", "image"),
        ("d.tiff", "image"),
        ("e.heic", "image"),
        ("f.eml", "email"),
        ("g.msg", "email"),
        ("h.txt", "text"),
        ("i.log", "text"),
        ("j.rtf", "text"),
        ("k.md", "markdown"),
        ("l.markdown", "markdown"),
        ("m.csv", "spreadsheet"),
        ("n.xlsx", "spreadsheet"),
        ("o.xls", "spreadsheet"),
        ("p.docx", "other"),
        ("q.doc", "other"),
        ("r.pages", "other"),
        ("s.unknownext", "other"),
        ("noextension", "other"),
    ],
)
def test_classification_map(filename, expected):
    assert str(classify_source_type(filename)) == expected


# ---------------------------------------------------------------------------
# §4.1 LocalFileStorage — round-trip, sha256, size
# ---------------------------------------------------------------------------
def test_save_upload_round_trip_sha256_and_size(storage: LocalFileStorage):
    payload = b"hello evidence world"
    key = original_key(uuid.uuid4(), uuid.uuid4(), ".txt")

    stored = storage.save_upload(io.BytesIO(payload), key=key)

    assert isinstance(stored, StoredObject)
    assert stored.key == key
    assert stored.size_bytes == len(payload)
    assert stored.sha256 == hashlib.sha256(payload).hexdigest()
    assert storage.exists(key)
    assert storage.read_bytes(key) == payload

    path = storage.get_path(key)
    assert path.is_absolute() and path.is_file()
    assert storage.root in path.parents

    storage.delete(key)
    assert not storage.exists(key)
    storage.delete(key)  # idempotent


def test_write_derived_round_trip(storage: LocalFileStorage):
    key = ocr_page_key(uuid.uuid4(), uuid.uuid4(), 1)
    path = storage.write_derived(key, b'{"page_number": 1}')
    assert path.is_absolute() and path.is_file()
    assert storage.read_bytes(key) == b'{"page_number": 1}'


def test_upload_streams_through_temp_then_moves_to_final_key(storage: LocalFileStorage):
    """§4.4: uploads land via data/temp/ then move atomically to the final key."""
    key = original_key(uuid.uuid4(), uuid.uuid4(), ".txt")
    final_path = storage.get_path(key)
    assert not final_path.exists()

    storage.save_upload(io.BytesIO(_TEXT_BODY), key=key)

    # Bytes now live ONLY at the final key; temp/ holds no stray parts.
    assert final_path.read_bytes() == _TEXT_BODY
    assert _temp_entries(storage.root) == []


def test_upload_over_limit_aborts_and_cleans_up(tmp_path: Path):
    tiny = LocalFileStorage(root=tmp_path, max_upload_mb=1)
    key = original_key(uuid.uuid4(), uuid.uuid4(), ".bin")

    with pytest.raises(StorageLimitError):
        tiny.save_upload(io.BytesIO(b"\0" * (2 * 1024 * 1024)), key=key)

    assert not tiny.exists(key)  # nothing landed at the final key…
    assert _temp_entries(tmp_path) == []  # …and no temp debris


def test_get_storage_factory_is_cached_and_rooted_at_settings():
    get_storage.cache_clear()
    first = get_storage()
    assert get_storage() is first  # cached
    assert isinstance(first, LocalFileStorage)
    assert first.root == Path(get_settings().local_storage_root).resolve()
    get_storage.cache_clear()


# ---------------------------------------------------------------------------
# §4.1 traversal guard
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "bad_key",
    [
        "../escape.txt",
        "uploads/../../escape.txt",
        "/etc/passwd",
        "a\\b.txt",  # backslashes are not posix keys
        "",
        ".",
        "uploads/..",
    ],
)
def test_traversal_guard_rejects_bad_keys(storage: LocalFileStorage, bad_key):
    with pytest.raises(StorageKeyError):
        storage.get_path(bad_key)
    with pytest.raises(StorageKeyError):
        storage.save_upload(io.BytesIO(b"x"), key=bad_key)
    with pytest.raises(StorageKeyError):
        storage.write_derived(bad_key, b"x")
    with pytest.raises(StorageKeyError):
        storage.delete(bad_key)
    with pytest.raises(StorageKeyError):
        storage.exists(bad_key)


def test_rejected_key_writes_nothing_outside_root(storage: LocalFileStorage, tmp_path: Path):
    with pytest.raises(StorageKeyError):
        storage.save_upload(io.BytesIO(b"x"), key="../sneaky.txt")
    assert not (tmp_path / "sneaky.txt").exists()
    assert not (tmp_path.parent / "sneaky.txt").exists()
    assert _temp_entries(storage.root) == []


# ---------------------------------------------------------------------------
# §5 ingest_source (real Postgres)
# ---------------------------------------------------------------------------
def test_ingest_source_completes_and_fills_missing_fields(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="note.txt", content=_TEXT_BODY, source_type="text"
    )
    assert source.sha256 is None and source.file_size_bytes is None

    result = ingest_source(str(source.id), str(workspace.id))

    assert result["job"] == "ingest_source"
    assert result["status"] == "complete"
    assert result["sha256"] == hashlib.sha256(_TEXT_BODY).hexdigest()
    assert result["size_bytes"] == len(_TEXT_BODY)
    assert result["mime_type"] == "text/plain"

    fresh = _reload(db, Source, source.id)
    assert str(fresh.sha256) == result["sha256"]
    assert fresh.file_size_bytes == len(_TEXT_BODY)
    assert fresh.mime_type == "text/plain"
    assert fresh.processing_status == "complete"
    meta = _reload(db, SourceMetadata, source.id)
    assert meta.metadata_json["ingest_method"] == "workers.pipeline.source_jobs.ingest_source"

    # Idempotent: a re-run is a cheap no-op, not a second ingest.
    again = ingest_source(str(source.id), str(workspace.id))
    assert again["status"] == "already_complete"


def test_ingest_source_reclassifies_only_when_other(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="memo.md", content=b"# memo", source_type="other"
    )
    result = ingest_source(str(source.id), str(workspace.id))
    assert result["status"] == "complete"
    assert result["source_type"] == "markdown"  # re-classified from `other`


def test_ingest_source_keeps_explicit_type(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="scan.png", content=b"whatever", source_type="image"
    )
    result = ingest_source(str(source.id), str(workspace.id))
    assert result["source_type"] == "image"  # classification only fires for `other`


@pytest.mark.skipif(PYPDF_INSTALLED, reason="pypdf installed: real page counting runs instead")
def test_ingest_source_pdf_without_pypdf_still_completes_with_note(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="doc.pdf", content=b"%PDF-1.4 synthetic", source_type="pdf"
    )
    result = ingest_source(str(source.id), str(workspace.id))
    assert result["status"] == "complete"
    assert result["page_count"] is None
    meta = _reload(db, SourceMetadata, source.id)
    assert "pypdf" in (meta.metadata_json.get("ingest_note") or "")


def test_ingest_source_missing_file_marks_failed_without_raising(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="gone.txt", content=b"x", source_type="text", write_file=False
    )
    result = ingest_source(str(source.id), str(workspace.id))  # must not raise
    assert result["status"] == "failed"
    assert result["error"]

    fresh = _reload(db, Source, source.id)
    assert fresh.processing_status == "failed"
    meta = _reload(db, SourceMetadata, source.id)
    assert "ingest_error" in (meta.metadata_json or {})


def test_ingest_source_unknown_source_returns_not_found(db):
    assert ingest_source(str(uuid.uuid4()), str(uuid.uuid4()))["status"] == "not_found"


# ---------------------------------------------------------------------------
# §5 ocr_source (real Postgres)
# ---------------------------------------------------------------------------
def test_ocr_source_text_file_writes_page_one(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="transcript.txt", content=_TEXT_BODY, source_type="text"
    )

    result = ocr_source(str(source.id), str(workspace.id))

    assert result["job"] == "ocr_source"
    assert result["status"] == "complete"
    assert result["ocr_status"] == "complete"
    assert result["page_count"] == 1

    page = db.query(SourcePage).filter_by(source_id=source.id).one()
    assert page.page_number == 1
    assert page.ocr_text == _TEXT_BODY.decode()

    fresh = _reload(db, Source, source.id)
    assert fresh.ocr_status == "complete"
    assert fresh.page_count == 1
    meta = _reload(db, SourceMetadata, source.id)
    assert meta.metadata_json["ocr_method"] == "plain_text"

    # Idempotent: safe to re-run.
    assert ocr_source(str(source.id), str(workspace.id))["status"] == "already_complete"


def test_ocr_source_csv_spreadsheet_uses_plain_text_path(db, storage: LocalFileStorage):
    content = b"name,amount\nAcme Corp,1500\n"
    workspace, source = _make_source(
        db, filename="invoices.csv", content=content, source_type="spreadsheet"
    )
    result = ocr_source(str(source.id), str(workspace.id))
    assert result["status"] == "complete"
    page = db.query(SourcePage).filter_by(source_id=source.id).one()
    assert page.ocr_text == content.decode()  # csv content lands as page text


def test_ocr_source_skips_unsupported_type_with_note(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db,
        filename="ledger.xlsx",
        content=b"\xd0\xcf\x11\xe0synthetic",
        source_type="spreadsheet",
    )
    result = ocr_source(str(source.id), str(workspace.id))  # must not raise
    assert result["status"] == "skipped"

    fresh = _reload(db, Source, source.id)
    assert fresh.ocr_status == "skipped"
    meta = _reload(db, SourceMetadata, source.id)
    assert meta.metadata_json.get("ocr_note")


def test_ocr_source_missing_file_marks_failed_without_raising(db, storage: LocalFileStorage):
    workspace, source = _make_source(
        db, filename="lost.txt", content=b"x", source_type="text", write_file=False
    )
    result = ocr_source(str(source.id), str(workspace.id))  # must not raise
    assert result["status"] == "failed"
    assert result["error"]

    fresh = _reload(db, Source, source.id)
    assert fresh.ocr_status == "failed"
    meta = _reload(db, SourceMetadata, source.id)
    assert "ocr_error" in (meta.metadata_json or {})


def test_ocr_source_unknown_source_returns_not_found(db):
    assert ocr_source(str(uuid.uuid4()), str(uuid.uuid4()))["status"] == "not_found"


# ---------------------------------------------------------------------------
# §5 enqueue — graceful no-redis degrade
# ---------------------------------------------------------------------------
def test_enqueue_result_shape_matches_contract():
    for result in (
        enqueue_ingest(str(uuid.uuid4()), str(uuid.uuid4())),
        enqueue_ocr(str(uuid.uuid4()), str(uuid.uuid4())),
    ):
        assert set(result) == {"queued", "job_id", "reason"}


def test_enqueue_without_rq_library_degrades(monkeypatch):
    """No redis/rq installed → queued=False with a reason; never raises."""
    monkeypatch.setitem(sys.modules, "rq", None)  # simulate rq missing
    result = enqueue_ingest(str(uuid.uuid4()), str(uuid.uuid4()))
    assert result["queued"] is False
    assert result["job_id"] is None
    assert result["reason"] and "rq" in result["reason"]


def test_enqueue_with_unreachable_redis_degrades(monkeypatch):
    """rq present but redis unreachable → queued=False with a reason."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "redis_url", "redis://127.0.0.1:1/0")
    result = enqueue_ocr(str(uuid.uuid4()), str(uuid.uuid4()))
    assert result["queued"] is False
    assert result["job_id"] is None
    assert "redis" in (result["reason"] or "").lower()

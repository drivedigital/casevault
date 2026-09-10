"""Phase 2 API flows: evidence ingestion — upload, dedupe, classification,
lifecycle updates, matter links, extracted-text pages, file serving, and
the worker pipeline stub."""
import hashlib
import os

from workers.pipeline.jobs import process_source

# The worker connects on its own; point it at the same test database the
# API test fixtures use (see tests/api/conftest.py).
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault_test"),
)


def _upload(client, *, name="notice.txt", content=b"Tenant was excluded from 2F.", **fields):
    files = {"file": (name, content, fields.pop("mime", "text/plain"))}
    data = {k: v for k, v in fields.items() if v is not None}
    return client.post("/api/v1/sources", files=files, data=data or None)


def test_upload_text_source_creates_record_and_page(client):
    resp = _upload(client, title="Exclusion Notice")
    assert resp.status_code == 201
    src = resp.json()
    assert src["source_type"] == "text"
    assert src["title"] == "Exclusion Notice"
    assert src["sha256"] == hashlib.sha256(b"Tenant was excluded from 2F.").hexdigest()
    assert src["file_size_bytes"] == len(b"Tenant was excluded from 2F.")
    assert src["evidence_review_status"] == "uploaded"
    assert src["source_status"] == "derived"
    # text evidence is ingested inline: page + statuses immediately
    assert src["processing_status"] == "complete"
    assert src["ocr_status"] == "complete"
    assert src["page_count"] == 1
    assert src["duplicate_of"] is None

    pages = client.get(f"/api/v1/sources/{src['id']}/pages").json()
    assert len(pages) == 1
    assert pages[0]["ocr_text"] == "Tenant was excluded from 2F."

    # stored file round-trips through the download endpoint
    file_resp = client.get(f"/api/v1/sources/{src['id']}/file")
    assert file_resp.status_code == 200
    assert file_resp.content == b"Tenant was excluded from 2F."


def test_duplicate_upload_is_flagged(client):
    first = _upload(client, name="a.txt", content=b"same bytes").json()
    second = _upload(client, name="b.txt", content=b"same bytes").json()
    assert second["evidence_review_status"] == "duplicate"
    assert second["duplicate_of"]["source_id"] == first["id"]
    assert second["duplicate_of"]["title"] == first["title"]
    # the original is untouched
    again = client.get(f"/api/v1/sources/{first['id']}").json()
    assert again["evidence_review_status"] == "uploaded"


def test_source_type_classification_and_ocr_stub(client):
    # fake pdf bytes: binary types stay queued until the worker runs
    resp = _upload(
        client, name="summons.pdf", content=b"%PDF-1.4 fake", mime="application/pdf"
    )
    assert resp.status_code == 201
    src = resp.json()
    assert src["source_type"] == "pdf"
    assert src["processing_status"] == "queued"
    assert src["ocr_status"] == "not_started"
    assert src["page_count"] is None

    # direct worker run (no redis): stub marks skipped + reason
    result = process_source(src["id"], database_url=TEST_DB_URL)
    assert result["status"] == "complete"
    assert result["ocr_status"] == "skipped"
    detail = client.get(f"/api/v1/sources/{src['id']}").json()
    assert detail["processing_status"] == "complete"
    assert detail["ocr_status"] == "skipped"
    assert client.get(f"/api/v1/sources/{src['id']}/pages").json() == []

    # images classify from the extension too
    img = _upload(
        client, name="photo.png", content=b"\x89PNG fake", mime="image/png"
    ).json()
    assert img["source_type"] == "image"

    md = _upload(client, name="notes.md", content=b"# Heading").json()
    assert md["source_type"] == "markdown"
    assert md["ocr_status"] == "complete"


def test_filename_sanitize_and_traversal_safe(client):
    resp = _upload(client, name="../../../../etc/passwd", content=b"x")
    assert resp.status_code == 201
    src = resp.json()
    # directories are stripped; storage path stays under uploads/
    assert src["original_filename"] == "passwd"
    assert ".." not in src["storage_path"]
    assert src["storage_path"].startswith("uploads/")
    assert client.get(f"/api/v1/sources/{src['id']}/file").status_code == 200


def test_source_lifecycle_updates(client):
    src = _upload(client).json()
    # manual status transitions (acceptance: statuses settable by hand)
    resp = client.patch(
        f"/api/v1/sources/{src['id']}",
        json={"source_status": "primary", "evidence_review_status": "reviewed"},
    )
    assert resp.status_code == 200
    assert resp.json()["source_status"] == "primary"
    assert resp.json()["evidence_review_status"] == "reviewed"

    # exclusion with a reason
    resp = client.patch(
        f"/api/v1/sources/{src['id']}",
        json={"excluded_flag": True, "exclusion_reason": "Privileged"},
    )
    assert resp.status_code == 200
    assert resp.json()["excluded_flag"] is True

    # included AND excluded violates the check constraint -> 409
    resp = client.patch(f"/api/v1/sources/{src['id']}", json={"included_flag": True})
    assert resp.status_code == 409


def test_matter_linking_round_trip(client):
    src = _upload(client, title="Lease").json()
    matter = client.post("/api/v1/matters", json={"name": "Link Matter"}).json()

    resp = client.post(
        f"/api/v1/matters/{matter['id']}/sources",
        json={"source_id": src["id"], "link_reason": "central lease"},
    )
    assert resp.status_code == 201
    link = resp.json()
    assert link["source_title"] == "Lease"
    assert link["matter_name"] == "Link Matter"

    # duplicate link rejected
    assert (
        client.post(
            f"/api/v1/matters/{matter['id']}/sources", json={"source_id": src["id"]}
        ).status_code
        == 409
    )

    # visible from both sides
    matter_sources = client.get(f"/api/v1/matters/{matter['id']}/sources").json()
    assert [s["id"] for s in matter_sources] == [src["id"]]
    source_matters = client.get(f"/api/v1/sources/{src['id']}/matters").json()
    assert [m["matter_id"] for m in source_matters] == [matter["id"]]
    # matter-side link rows carry link ids (used for unlinking in the UI)
    link_rows = client.get(f"/api/v1/matters/{matter['id']}/source-links").json()
    assert [row["id"] for row in link_rows] == [link["id"]]
    assert link_rows[0]["source_title"] == "Lease"

    # filtered listing by matter
    other = _upload(client, name="unlinked.txt", content=b"other").json()
    assert [s["id"] for s in client.get("/api/v1/sources").json()].count(other["id"]) == 1
    assert other["id"] not in [s["id"] for s in matter_sources]

    # unlink
    assert (
        client.delete(f"/api/v1/source-matter-links/{link['id']}").status_code == 204
    )
    assert client.get(f"/api/v1/sources/{src['id']}/matters").json() == []


def test_list_filters_and_search(client):
    a = _upload(client, name="lease.txt", content=b"lease doc", title="Lease Agreement").json()
    _upload(client, name="photo.png", content=b"\x89PNG", mime="image/png", title="Damage Photo")
    _upload(client, name="letter.txt", content=b"letter", title="Demand Letter")

    # by type
    texts = client.get("/api/v1/sources", params={"source_type": "text"}).json()
    assert {s["title"] for s in texts} == {"Lease Agreement", "Demand Letter"}

    # by review status
    client.patch(f"/api/v1/sources/{a['id']}", json={"evidence_review_status": "reviewed"})
    reviewed = client.get(
        "/api/v1/sources", params={"evidence_review_status": "reviewed"}
    ).json()
    assert [s["id"] for s in reviewed] == [a["id"]]

    # by title search
    found = client.get("/api/v1/sources", params={"q": "demand"}).json()
    assert [s["title"] for s in found] == ["Demand Letter"]
    assert client.get("/api/v1/sources", params={"q": "nothing-matches"}).json() == []


def test_upload_guards(client):
    # empty file
    resp = _upload(client, name="empty.txt", content=b"")
    assert resp.status_code == 422
    # oversize (limit overridden in tests via settings? no — use a >100MB
    # substitute by checking the error path with a tiny patched limit)
    from app.config import get_settings

    original = get_settings().max_upload_bytes
    get_settings().max_upload_bytes = 10
    try:
        resp = _upload(client, name="big.txt", content=b"x" * 100)
        assert resp.status_code == 413
    finally:
        get_settings().max_upload_bytes = original


def test_workspace_scoping_404(client, db):
    from app.models.workspace import Workspace
    from app.services import identity_service

    # upload FIRST: the default workspace is "first by created_at", so a
    # workspace created before the bootstrap would itself become default.
    src = _upload(client).json()

    other = Workspace(
        name="Other Workspace",
        created_by_user_id=identity_service.get_local_user(db).id,
    )
    db.add(other)
    db.commit()

    # asking for the source under the other workspace's id -> 404
    resp = client.get(f"/api/v1/sources/{src['id']}", params={"workspace_id": str(other.id)})
    assert resp.status_code == 404
    # and it is visible under its own workspace (the default one)
    assert client.get(f"/api/v1/sources/{src['id']}").status_code == 200

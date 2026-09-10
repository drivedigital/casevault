"""W2-EV evidence follow-ups: excerpts and per-source reprocessing."""
from __future__ import annotations


def _upload(client, *, name="source.txt", content=b"Source text."):
    return client.post(
        "/api/v1/sources",
        files={"file": (name, content, "text/plain")},
    )


def test_excerpt_create_list_delete_round_trip(client):
    source = _upload(client, name="notice.txt", content=b"A useful text source.").json()
    payload = {
        "page_start": 2,
        "page_end": 3,
        "locator_text": "Bates CV-0002 through CV-0003",
        "excerpt_text": "A useful selected passage.",
        "excerpt_type": "quote",
        "anchor_json": {"x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3},
    }

    created_response = client.post(f"/api/v1/sources/{source['id']}/excerpts", json=payload)
    assert created_response.status_code == 201
    created = created_response.json()
    assert created["source_id"] == source["id"]
    assert {key: created[key] for key in payload} == payload
    assert created["created_by"] == "system"

    listed_response = client.get(f"/api/v1/sources/{source['id']}/excerpts")
    assert listed_response.status_code == 200
    assert [item["id"] for item in listed_response.json()] == [created["id"]]

    deleted_response = client.delete(f"/api/v1/source-excerpts/{created['id']}")
    assert deleted_response.status_code == 204
    assert client.get(f"/api/v1/sources/{source['id']}/excerpts").json() == []
    assert client.delete(f"/api/v1/source-excerpts/{created['id']}").status_code == 404


def test_excerpt_workspace_scoping(client, db):
    source = _upload(client, name="scoped.txt", content=b"Workspace scoped source.").json()

    from app.models.workspace import Workspace
    from app.services import identity_service

    other_workspace = Workspace(
        name="Excerpt Other Workspace",
        created_by_user_id=identity_service.get_local_user(db).id,
    )
    db.add(other_workspace)
    db.commit()
    other_id = str(other_workspace.id)

    excerpt_payload = {"excerpt_type": "paragraph", "excerpt_text": "Not visible here."}
    assert (
        client.post(
            f"/api/v1/sources/{source['id']}/excerpts",
            params={"workspace_id": other_id},
            json=excerpt_payload,
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/v1/sources/{source['id']}/excerpts",
            params={"workspace_id": other_id},
        ).status_code
        == 404
    )

    created = client.post(
        f"/api/v1/sources/{source['id']}/excerpts", json=excerpt_payload
    ).json()
    assert (
        client.delete(
            f"/api/v1/source-excerpts/{created['id']}",
            params={"workspace_id": other_id},
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/sources/{source['id']}/excerpts").json()


def test_reprocess_without_redis_returns_202_and_keeps_status_queued(client, monkeypatch):
    source = _upload(client, name="reprocess.txt", content=b"Reprocess this source.").json()

    # Use an explicitly unreachable endpoint even when a developer happens to
    # have Redis running locally. The API must still return a graceful 202.
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "redis_url", "redis://127.0.0.1:6399/0")
    response = client.post(
        f"/api/v1/sources/{source['id']}/reprocess",
        json={"stages": ["ingest", "ocr"]},
    )
    assert response.status_code == 202
    result = response.json()
    print("queued:false reprocess response:", result)
    assert result["queued"] is False
    assert result["job_id"] is None
    assert result["reason"]

    refreshed = client.get(f"/api/v1/sources/{source['id']}").json()
    assert refreshed["processing_status"] == "queued"
    assert refreshed["ocr_status"] == "queued"


def test_reprocess_defaults_to_ocr_without_body(client, monkeypatch):
    source = _upload(client, name="default-stage.txt", content=b"Default OCR stage.").json()

    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "redis_url", "redis://127.0.0.1:6399/0")
    response = client.post(f"/api/v1/sources/{source['id']}/reprocess")
    assert response.status_code == 202
    assert response.json()["queued"] is False
    refreshed = client.get(f"/api/v1/sources/{source['id']}").json()
    assert refreshed["processing_status"] == "complete"
    assert refreshed["ocr_status"] == "queued"

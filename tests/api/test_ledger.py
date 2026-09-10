"""Wave 2 source-ledger API tests (synthetic rows only)."""
from __future__ import annotations

import uuid


def _workspace(client):
    response = client.get("/api/v1/workspaces/current")
    assert response.status_code == 200
    return response.json()


def _row(*, statement="Synthetic lease statement", external="L-001", tags=None, **overrides):
    value = {
        "external_ledger_id": external,
        "date_start": "2025-01-02",
        "date_end": "2025-01-03",
        "date_text_raw": "January 2–3, 2025",
        "fact_short_name": "Synthetic lease fact",
        "fact_statement": statement,
        "claim_use_text": "Synthetic claim use",
        "relief_use_text": "Synthetic relief use",
        "source_path_text": "synthetic/source.txt",
        "source_locator_text": "page 2",
        "source_status": "primary",
        "authentication_or_witness": "Synthetic witness",
        "confidence_level": "high",
        "verification_task_text": "Confirm synthetic date",
        "restrictions_or_notes": "Synthetic note",
        "tags": tags or ["synthetic", "lease"],
    }
    value.update(overrides)
    return value


def test_ledger_crud_filters_and_workspace_scope(client):
    workspace = _workspace(client)
    created = client.post("/api/v1/ledger-entries", json=_row()).json()
    entry_id = created["id"]
    assert created["workspace_id"] == workspace["id"]
    assert created["tags"] == ["synthetic", "lease"]
    assert created["linked_source"] is None

    response = client.get(
        "/api/v1/ledger-entries",
        params={"q": "synthetic lease", "tag": "lease", "has_verification_task": True},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == entry_id
    assert response.json()["limit"] == 50
    assert response.json()["offset"] == 0

    updated = client.patch(
        f"/api/v1/ledger-entries/{entry_id}",
        json={"fact_statement": "Updated synthetic statement", "tags": ["updated"]},
    )
    assert updated.status_code == 200
    assert updated.json()["fact_statement"] == "Updated synthetic statement"
    assert updated.json()["tags"] == ["updated"]

    other_workspace = client.post(
        "/api/v1/workspaces", json={"name": "Synthetic Other Workspace"}
    ).json()
    hidden = client.get(
        f"/api/v1/ledger-entries/{entry_id}",
        params={"workspace_id": other_workspace["id"]},
    )
    assert hidden.status_code == 404
    assert client.patch(
        f"/api/v1/ledger-entries/{entry_id}",
        params={"workspace_id": other_workspace["id"]},
        json={"tags": ["must-not-leak"]},
    ).status_code == 404

    assert client.delete(f"/api/v1/ledger-entries/{entry_id}").status_code == 204
    assert client.get(f"/api/v1/ledger-entries/{entry_id}").status_code == 404


def test_csv_export_import_round_trip_and_sample(client):
    workspace = _workspace(client)
    matter_a = client.post("/api/v1/matters", json={"name": "Synthetic Export Matter"}).json()
    matter_b = client.post("/api/v1/matters", json={"name": "Synthetic Import Matter"}).json()
    source_row = _row(external="ROUND-001", matter_id=matter_a["id"])
    source_row["tags"] = ["synthetic", "round trip"]
    created = client.post("/api/v1/ledger-entries", json=source_row)
    assert created.status_code == 201

    exported = client.get(
        "/api/v1/ledger-entries/export.csv",
        params={"workspace_id": workspace["id"], "matter_id": matter_a["id"]},
    )
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert exported.content.startswith(b"external_ledger_id,date_start")
    # This is intentionally synthetic and doubles as the round-trip sample.
    print("CSV SAMPLE:\n" + exported.text)

    imported = client.post(
        "/api/v1/ledger-entries/import",
        params={"workspace_id": workspace["id"], "matter_id": matter_b["id"]},
        files={"file": ("synthetic-ledger.csv", exported.content, "text/csv")},
    )
    assert imported.status_code == 200
    assert imported.json()["created"] == 1

    round_trip = client.get(
        "/api/v1/ledger-entries",
        params={"workspace_id": workspace["id"], "matter_id": matter_b["id"]},
    ).json()["items"]
    assert len(round_trip) == 1
    assert round_trip[0]["external_ledger_id"] == "ROUND-001"
    assert round_trip[0]["fact_statement"] == source_row["fact_statement"]
    assert round_trip[0]["tags"] == ["synthetic", "round trip"]


def test_csv_malformed_rows_and_dry_run_do_not_write(client):
    workspace = _workspace(client)
    matter = client.post("/api/v1/matters", json={"name": "Synthetic Import Validation"}).json()
    csv_text = "external_ledger_id,fact_statement,date_start,confidence_level\r\n"
    csv_text += "BAD-001,,2025-01-01,high\r\n"
    csv_text += "BAD-002,Valid synthetic statement,not-a-date,high\r\n"
    csv_text += "GOOD-001,Valid synthetic statement,2025-01-01,high\r\n"

    result = client.post(
        "/api/v1/ledger-entries/import",
        params={
            "workspace_id": workspace["id"],
            "matter_id": matter["id"],
            "dry_run": "true",
        },
        files={"file": ("synthetic.csv", csv_text.encode(), "text/csv")},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["valid"] == 1
    assert body["created"] == 0
    assert len(body["errors"]) == 2

    rows = client.get(
        "/api/v1/ledger-entries",
        params={"workspace_id": workspace["id"], "matter_id": matter["id"]},
    ).json()
    assert rows["total"] == 0

    malformed_header = client.post(
        "/api/v1/ledger-entries/import",
        params={"workspace_id": workspace["id"]},
        files={"file": ("bad.csv", b"wrong_header\nvalue\n", "text/csv")},
    )
    assert malformed_header.status_code == 422
    assert "expected_columns" in str(malformed_header.json())


def test_bulk_partial_success(client):
    _workspace(client)
    first = client.post("/api/v1/ledger-entries", json=_row(external="BULK-001")).json()
    second = client.post(
        "/api/v1/ledger-entries", json=_row(external="BULK-002", tags=["before"])
    ).json()
    missing = str(uuid.uuid4())
    response = client.post(
        "/api/v1/ledger-entries/bulk",
        json={
            "ids": [first["id"], missing, second["id"], second["id"]],
            "patch": {"tags": ["bulk-updated"], "confidence_level": "medium"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body["updated"]) == {first["id"], second["id"]}
    assert body["skipped"] == [second["id"]]
    assert body["errors"][0]["id"] == missing


def test_link_source_and_duplicate_external_id(client):
    _workspace(client)
    matter = client.post("/api/v1/matters", json={"name": "Synthetic Duplicate Matter"}).json()
    source = client.post(
        "/api/v1/sources",
        files={"file": ("synthetic.txt", b"Synthetic source only", "text/plain")},
    ).json()
    first = client.post(
        "/api/v1/ledger-entries",
        json=_row(external="DUP-001", matter_id=matter["id"]),
    ).json()
    linked = client.post(
        f"/api/v1/ledger-entries/{first['id']}/link-source",
        json={"source_id": source["id"]},
    )
    assert linked.status_code == 200
    assert linked.json()["linked_source"]["id"] == source["id"]
    duplicate = client.post(
        "/api/v1/ledger-entries",
        json=_row(external="DUP-001", matter_id=matter["id"]),
    )
    assert duplicate.status_code == 409

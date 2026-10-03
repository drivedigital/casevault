"""Wave 3 WS-CHRONO events/chronology API tests (synthetic rows only).

Covers the chronology invariant (only `accepted` facts can be linked to
events), events CRUD + filters, link management, date validation, and the
matter chronology feed.
"""
from __future__ import annotations


def _workspace(client):
    response = client.get("/api/v1/workspaces/current")
    assert response.status_code == 200
    return response.json()


def _matter(client, name="Synthetic Chronology Matter"):
    response = client.post("/api/v1/matters", json={"name": name})
    assert response.status_code in (200, 201)
    return response.json()


def _fact(client, matter_id, statement="Synthetic accepted fact", approved=True):
    response = client.post(
        "/api/v1/facts",
        json={"matter_id": matter_id, "statement_text": statement},
    )
    assert response.status_code == 201
    fact = response.json()
    assert fact["review_state"] == "proposed"  # review-state floor (contract §4.1)
    if approved:
        approved_resp = client.post(f"/api/v1/facts/{fact['id']}/approve")
        assert approved_resp.status_code == 200
        fact = approved_resp.json()
        assert fact["review_state"] == "accepted"
    return fact


def _actor(client, name="Synthetic Witness"):
    response = client.post(
        "/api/v1/actors", json={"display_name": name, "actor_type": "person"}
    )
    assert response.status_code in (200, 201)
    return response.json()


def _event(client, matter_id, **overrides):
    payload = {
        "matter_id": matter_id,
        "title": "Synthetic door exclusion",
        "description": "A synthetic chronology event for tests.",
        "date_start": "2025-06-03",
        "date_precision": "exact",
        "significance_level": "high",
    }
    payload.update(overrides)
    response = client.post("/api/v1/events", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_event_crud_defaults_and_workspace_scope(client):
    workspace = _workspace(client)
    matter = _matter(client)

    created = _event(client, matter["id"])
    assert created["workspace_id"] == workspace["id"]
    assert created["review_state"] == "accepted"  # Schema Draft §6.6 default
    assert created["date_precision"] == "exact"
    assert created["fact_links"] == []
    assert created["actor_links"] == []
    assert created["created_from_proposal"] is None
    event_id = created["id"]

    # Minimal create: defaults land date_precision=unknown.
    minimal = client.post(
        "/api/v1/events", json={"matter_id": matter["id"], "title": "Undated event"}
    )
    assert minimal.status_code == 201
    assert minimal.json()["date_precision"] == "unknown"
    assert minimal.json()["date_start"] is None

    fetched = client.get(f"/api/v1/events/{event_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Synthetic door exclusion"

    updated = client.patch(
        f"/api/v1/events/{event_id}",
        json={
            "title": "Renamed synthetic event",
            "date_start": "2025-06-04",
            "date_end": "2025-06-05",
            "date_precision": "range",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed synthetic event"
    assert updated.json()["date_precision"] == "range"
    assert updated.json()["date_end"] == "2025-06-05"

    # Workspace scoping: another workspace cannot see or edit the event.
    other = client.post(
        "/api/v1/workspaces", json={"name": "Synthetic Other Workspace"}
    ).json()
    hidden = client.get(
        f"/api/v1/events/{event_id}", params={"workspace_id": other["id"]}
    )
    assert hidden.status_code == 404
    assert (
        client.patch(
            f"/api/v1/events/{event_id}",
            params={"workspace_id": other["id"]},
            json={"title": "must not leak"},
        ).status_code
        == 404
    )

    assert client.delete(f"/api/v1/events/{event_id}").status_code == 204
    assert client.get(f"/api/v1/events/{event_id}").status_code == 404
    assert client.delete(f"/api/v1/events/{event_id}").status_code == 404


def test_event_server_owned_fields_rejected(client):
    matter = _matter(client)
    # review_state / created_from_proposal_id are server-owned; unknown keys
    # too — all 422 via extra=forbid, never silently ignored.
    for body in (
        {"matter_id": matter["id"], "title": "x", "review_state": "proposed"},
        {"matter_id": matter["id"], "title": "x", "created_from_proposal_id": None},
        {"matter_id": matter["id"], "title": "x", "bogus_field": 1},
    ):
        assert client.post("/api/v1/events", json=body).status_code == 422, body
    created = _event(client, matter["id"])
    assert (
        client.patch(f"/api/v1/events/{created['id']}", json={"review_state": "rejected"}).status_code
        == 422
    )


def test_event_date_validation(client):
    matter = _matter(client)
    bad_range = client.post(
        "/api/v1/events",
        json={
            "matter_id": matter["id"],
            "title": "Backwards range",
            "date_start": "2025-06-10",
            "date_end": "2025-06-01",
        },
    )
    assert bad_range.status_code == 422

    precision_needs_both = client.post(
        "/api/v1/events",
        json={
            "matter_id": matter["id"],
            "title": "Range without end",
            "date_start": "2025-06-01",
            "date_precision": "range",
        },
    )
    assert precision_needs_both.status_code == 422

    # PATCH is validated against the MERGED state: moving date_start past a
    # stored date_end must fail even though the patch body alone looks fine.
    event = _event(
        client,
        matter["id"],
        date_start="2025-06-01",
        date_end="2025-06-05",
        date_precision="range",
    )
    broken_patch = client.patch(
        f"/api/v1/events/{event['id']}", json={"date_start": "2025-06-20"}
    )
    assert broken_patch.status_code == 422


def test_event_list_filters_and_pagination(client):
    matter_a = _matter(client, "Synthetic Matter A")
    matter_b = _matter(client, "Synthetic Matter B")
    _event(client, matter_a["id"], title="Early filing", date_start="2025-01-10")
    _event(client, matter_a["id"], title="Late hearing", date_start="2025-09-02")
    _event(client, matter_a["id"], title="Undated note", date_start=None,
           date_precision="unknown")
    _event(client, matter_b["id"], title="Other matter event", date_start="2025-03-03")

    listed = client.get("/api/v1/events", params={"matter_id": matter_a["id"]}).json()
    assert listed["total"] == 3
    titles = [item["title"] for item in listed["items"]]
    # Chronological: dated events by date_start, undated last.
    assert titles == ["Early filing", "Late hearing", "Undated note"]

    windowed = client.get(
        "/api/v1/events",
        params={"matter_id": matter_a["id"], "date_from": "2025-02-01", "date_to": "2025-12-31"},
    ).json()
    assert [item["title"] for item in windowed["items"]] == ["Late hearing"]

    searched = client.get("/api/v1/events", params={"q": "hearing"}).json()
    assert searched["total"] == 1
    assert searched["items"][0]["title"] == "Late hearing"

    significance = client.get(
        "/api/v1/events", params={"significance_level": "high", "matter_id": matter_a["id"]}
    ).json()
    assert significance["total"] == 3  # _event() defaults significance to high

    paged = client.get(
        "/api/v1/events", params={"matter_id": matter_a["id"], "limit": 2, "offset": 2}
    ).json()
    assert paged["total"] == 3
    assert paged["limit"] == 2 and paged["offset"] == 2
    assert [item["title"] for item in paged["items"]] == ["Undated note"]


def test_link_fact_requires_accepted_review_state(client):
    """Brief invariant §1: chronology consumes facts in review_state=accepted."""
    matter = _matter(client)
    event = _event(client, matter["id"])
    proposed = _fact(client, matter["id"], statement="Synthetic proposed fact", approved=False)

    rejected = client.post(
        f"/api/v1/events/{event['id']}/facts", json={"fact_id": proposed["id"]}
    )
    assert rejected.status_code == 409
    assert "accepted" in rejected.json()["detail"]

    # Approving the fact makes it linkable.
    assert client.post(f"/api/v1/facts/{proposed['id']}/approve").status_code == 200
    linked = client.post(
        f"/api/v1/events/{event['id']}/facts",
        json={"fact_id": proposed["id"], "relationship_type": "supports_event"},
    )
    assert linked.status_code == 201, linked.text
    body = linked.json()
    assert body["event_id"] == event["id"]
    assert body["fact_id"] == proposed["id"]
    assert body["relationship_type"] == "supports_event"
    assert body["fact_review_state"] == "accepted"
    assert body["fact_statement"] == "Synthetic proposed fact"

    # Duplicate (same relationship_type) is 409, a different type is allowed.
    duplicate = client.post(
        f"/api/v1/events/{event['id']}/facts", json={"fact_id": proposed["id"]}
    )
    assert duplicate.status_code == 409
    context = client.post(
        f"/api/v1/events/{event['id']}/facts",
        json={"fact_id": proposed["id"], "relationship_type": "context_only"},
    )
    assert context.status_code == 201

    # Unknown relationship_type → 422; unknown fact / cross-workspace fact → 404.
    assert (
        client.post(
            f"/api/v1/events/{event['id']}/facts",
            json={"fact_id": proposed["id"], "relationship_type": "vibes"},
        ).status_code
        == 422
    )
    import uuid as _uuid

    assert (
        client.post(
            f"/api/v1/events/{event['id']}/facts", json={"fact_id": str(_uuid.uuid4())}
        ).status_code
        == 404
    )

    # Cross-matter fact → 409.
    other_matter = _matter(client, "Synthetic Other Matter")
    foreign_fact = _fact(client, other_matter["id"], statement="Synthetic foreign fact")
    assert (
        client.post(
            f"/api/v1/events/{event['id']}/facts", json={"fact_id": foreign_fact["id"]}
        ).status_code
        == 409
    )

    # Links surface on the event, and can be removed.
    listed = client.get(f"/api/v1/events/{event['id']}/facts").json()
    assert len(listed) == 2
    event_body = client.get(f"/api/v1/events/{event['id']}").json()
    assert len(event_body["fact_links"]) == 2

    assert client.delete(f"/api/v1/event-fact-links/{body['id']}").status_code == 204
    assert len(client.get(f"/api/v1/events/{event['id']}/facts").json()) == 1
    assert client.delete(f"/api/v1/event-fact-links/{body['id']}").status_code == 404


def test_event_actor_links(client):
    matter = _matter(client)
    event = _event(client, matter["id"])
    actor = _actor(client)

    linked = client.post(
        f"/api/v1/events/{event['id']}/actors",
        json={"actor_id": actor["id"], "role_in_event": "witness"},
    )
    assert linked.status_code == 201, linked.text
    assert linked.json()["actor_name"] == "Synthetic Witness"

    duplicate = client.post(
        f"/api/v1/events/{event['id']}/actors",
        json={"actor_id": actor["id"], "role_in_event": "witness"},
    )
    assert duplicate.status_code == 409

    # NULLS NOT DISTINCT: a second role-less link for the same actor is 409.
    roleless_a = client.post(f"/api/v1/events/{event['id']}/actors", json={"actor_id": actor["id"]})
    assert roleless_a.status_code == 201
    roleless_b = client.post(f"/api/v1/events/{event['id']}/actors", json={"actor_id": actor["id"]})
    assert roleless_b.status_code == 409

    assert len(client.get(f"/api/v1/events/{event['id']}/actors").json()) == 2
    assert client.delete(f"/api/v1/event-actor-links/{linked.json()['id']}").status_code == 204
    assert len(client.get(f"/api/v1/events/{event['id']}/actors").json()) == 1

    import uuid as _uuid

    assert (
        client.post(
            f"/api/v1/events/{event['id']}/actors", json={"actor_id": str(_uuid.uuid4())}
        ).status_code
        == 404
    )


def test_matter_chronology_feed(client):
    matter = _matter(client)
    other = _matter(client, "Synthetic Feed Other Matter")

    late = _event(client, matter["id"], title="Late event", date_start="2025-09-01")
    early = _event(client, matter["id"], title="Early event", date_start="2025-01-15")
    undated = _event(client, matter["id"], title="Undated event", date_start=None,
                   date_precision="unknown")
    _event(client, other["id"], title="Elsewhere event", date_start="2025-05-05")

    accepted_unlinked = _fact(client, matter["id"], statement="Synthetic unlinked fact")
    _fact(client, matter["id"], statement="Synthetic proposed only", approved=False)
    linked_fact = _fact(client, matter["id"], statement="Synthetic linked fact")
    assert (
        client.post(
            f"/api/v1/events/{early['id']}/facts", json={"fact_id": linked_fact["id"]}
        ).status_code
        == 201
    )

    feed = client.get(f"/api/v1/matters/{matter['id']}/chronology")
    assert feed.status_code == 200
    body = feed.json()
    assert body["matter_id"] == matter["id"]
    assert [e["title"] for e in body["events"]] == [
        "Early event",
        "Late event",
        "Undated event",
    ]
    # 2 accepted facts total, 1 linked → 1 unlinked candidate.
    assert body["unlinked_accepted_fact_count"] == 1
    assert accepted_unlinked["review_state"] == "accepted"

    # Early event carries its denormalized fact link.
    assert len(body["events"][0]["fact_links"]) == 1
    assert body["events"][0]["fact_links"][0]["fact_statement"] == "Synthetic linked fact"

    import uuid as _uuid

    assert client.get(f"/api/v1/matters/{_uuid.uuid4()}/chronology").status_code == 404

    # Workspace scoping: the feed 404s for a foreign workspace.
    foreign = client.post(
        "/api/v1/workspaces", json={"name": "Synthetic Feed Foreign Workspace"}
    ).json()
    assert (
        client.get(
            f"/api/v1/matters/{matter['id']}/chronology",
            params={"workspace_id": foreign["id"]},
        ).status_code
        == 404
    )


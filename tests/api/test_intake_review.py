"""Wave 2 / W2-G — proposal review inbox + trusted fact store.

The heart of this file is the review-state floor (contract §4.1): every route
that can create or touch a fact must leave it `proposed`, and only
`POST /facts/{id}/approve` may ever yield `accepted`. Forbidden body fields
must 422, not be ignored. Then the §4.2/§4.3 transition rules (409s), bulk
partial success, link uniqueness, and the inline generation flow.
"""
import uuid

import pytest

# --- helpers -----------------------------------------------------------------


def _matter(client, name="Intake Matter"):
    resp = client.post("/api/v1/matters", json={"name": name})
    assert resp.status_code == 201
    return resp.json()


def _upload_text(client, content: bytes, name="notice.txt"):
    resp = client.post(
        "/api/v1/sources", files={"file": (name, content, "text/plain")}, data={"title": name}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _proposal(client, *, text="The lease was signed on 3 March.", **extra):
    body = {"proposal_type": "fact", "proposed_text": text}
    body.update(extra)
    resp = client.post("/api/v1/proposals", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _fact(client, matter_id, **extra):
    body = {"matter_id": matter_id, "statement_text": "The notice was hand-delivered."}
    body.update(extra)
    resp = client.post("/api/v1/facts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def matter(client):
    return _matter(client)


@pytest.fixture()
def matter_b(client):
    return _matter(client, "Second Matter")


# --- §4.1 floor: creation paths -----------------------------------------------


def test_manual_proposal_is_created_as_proposed(client, matter):
    p = _proposal(client, matter_id=matter["id"], title="Signing date")
    assert p["review_state"] == "proposed"
    assert p["created_by_system"] is False
    assert p["reviewed_by_user_id"] is None and p["reviewed_at"] is None
    assert p["created_fact_id"] is None
    assert p["source"] is None and p["excerpt"] is None


def test_post_fact_always_proposed(client, matter):
    f = _fact(client, matter["id"])
    assert f["review_state"] == "proposed"
    assert f["approved_at"] is None and f["approved_by_user_id"] is None
    assert f["created_from_proposal_id"] is None
    assert f["supersedes_fact_id"] is None
    assert f["source_links"] == [] and f["actor_links"] == []


def test_accept_and_accept_with_edits_only_ever_yield_proposed(client, matter):
    p1 = _proposal(client, matter_id=matter["id"])
    p2 = _proposal(client, matter_id=matter["id"], text="Witness saw the hallway light on.")
    r1 = client.post(f"/api/v1/proposals/{p1['id']}/review", json={"action": "accept"})
    r2 = client.post(
        f"/api/v1/proposals/{p2['id']}/review",
        json={"action": "accept_with_edits", "edits": {"statement_text": "Edited statement."}},
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["fact"]["review_state"] == "proposed"
    assert r2.json()["fact"]["review_state"] == "proposed"
    # the floor query the whole product relies on: nothing is trusted yet
    accepted = client.get("/api/v1/facts", params={"review_state": "accepted"}).json()
    assert accepted["total"] == 0
    # generation (inline, via a text source) also stays proposed and creates
    # no facts at all
    src = _upload_text(client, b"Paragraph one is comfortably longer than forty characters.\n\n"
                       b"Paragraph two is also comfortably longer than forty characters.")
    gen = client.post("/api/v1/proposals/generate", json={"source_id": src["id"]})
    assert gen.status_code == 200 and gen.json()["created"] == 2
    # generated proposals are all still `proposed` — generation never accepts
    page = client.get("/api/v1/proposals", params={"source_id": src["id"]}).json()
    assert page["total"] == 2
    assert {p["review_state"] for p in page["items"]} == {"proposed"}
    # and generation creates no facts whatsoever
    assert client.get("/api/v1/facts").json()["total"] == 2
    # approve is the single way in
    fact_id = r1.json()["fact"]["id"]
    ap = client.post(f"/api/v1/facts/{fact_id}/approve")
    assert ap.status_code == 200
    assert ap.json()["review_state"] == "accepted"
    assert ap.json()["approved_at"] is not None
    assert ap.json()["approved_by_user_id"] is not None
    accepted = client.get("/api/v1/facts", params={"review_state": "accepted"}).json()
    assert [f["id"] for f in accepted["items"]] == [fact_id]


def test_review_state_accepted_forbidden_via_review_state_route(client, matter):
    f = _fact(client, matter["id"])
    resp = client.post(f"/api/v1/facts/{f['id']}/review-state", json={"review_state": "accepted"})
    assert resp.status_code == 409  # per §4.3: 409 here, must use /approve
    assert client.get(f"/api/v1/facts/{f['id']}").json()["review_state"] == "proposed"
    # `proposed` is not a transition target either
    resp = client.post(f"/api/v1/facts/{f['id']}/review-state", json={"review_state": "proposed"})
    assert resp.status_code == 409


# --- §4.1 floor: forbidden fields → 422 ---------------------------------------


def test_forbidden_fields_are_rejected_not_ignored(client, matter):
    f = _fact(client, matter["id"])
    p = _proposal(client, matter_id=matter["id"])
    other = uuid.uuid4()
    cases = [
        ("post", "/api/v1/facts", {"matter_id": matter["id"], "statement_text": "x",
                                   "review_state": "accepted"}),
        ("post", "/api/v1/facts", {"matter_id": matter["id"], "statement_text": "x",
                                   "created_from_proposal_id": str(other)}),
        ("post", "/api/v1/facts", {"matter_id": matter["id"], "statement_text": "x",
                                   "approved_by_user_id": str(other)}),
        ("patch", f"/api/v1/facts/{f['id']}", {"review_state": "accepted"}),
        ("patch", f"/api/v1/facts/{f['id']}", {"supersedes_fact_id": str(other)}),
        ("post", "/api/v1/proposals", {"proposal_type": "fact", "review_state": "accepted"}),
        ("post", "/api/v1/proposals", {"proposal_type": "fact", "created_by_system": True}),
        ("patch", f"/api/v1/proposals/{p['id']}", {"review_state": "rejected"}),
        ("post", f"/api/v1/proposals/{p['id']}/review", {"action": "accept", "review_state": "x"}),
        ("post", "/api/v1/proposals/bulk-review", {"ids": [p["id"]], "action": "reject",
                                                     "review_state": "accepted"}),
        # unknown fields are rejected too, not dropped
        ("post", "/api/v1/facts", {"matter_id": matter["id"], "statement_text": "x",
                                   "totally_unknown": 1}),
    ]
    for method, path, body in cases:
        resp = getattr(client, method)(path, json=body)
        assert resp.status_code == 422, f"{method.upper()} {path} {body} -> {resp.status_code}"
    # nothing changed on the server either way
    assert client.get(f"/api/v1/facts/{f['id']}").json()["review_state"] == "proposed"
    assert client.get(f"/api/v1/proposals/{p['id']}").json()["review_state"] == "proposed"
    assert client.get("/api/v1/facts").json()["total"] == 1


# --- §4.2 proposal review -------------------------------------------------------


def test_accept_stamps_proposal_and_links_fact(client, matter):
    p = _proposal(client, matter_id=matter["id"], text="The superintendent emailed on Monday.")
    r = client.post(
        f"/api/v1/proposals/{p['id']}/review",
        json={"action": "accept", "review_notes": "checked against inbox export"},
    )
    assert r.status_code == 200
    body = r.json()
    prop, fact = body["proposal"], body["fact"]
    assert prop["review_state"] == "accepted"
    assert prop["reviewed_at"] is not None and prop["reviewed_by_user_id"] is not None
    assert prop["review_notes"] == "checked against inbox export"
    assert prop["created_fact_id"] == fact["id"]
    assert fact["created_from_proposal_id"] == p["id"]
    assert fact["matter_id"] == matter["id"]
    assert fact["statement_text"] == "The superintendent emailed on Monday."
    # the proposal ref inside FactOut
    assert client.get(f"/api/v1/facts/{fact['id']}").json()["created_from_proposal"] == {
        "id": p["id"],
        "proposal_type": "fact",
    }


def test_accept_with_edits_moves_matter_and_sets_fields(client, matter, matter_b):
    p = _proposal(client, matter_id=matter["id"])
    fact = client.post(
        f"/api/v1/proposals/{p['id']}/review",
        json={
            "action": "accept_with_edits",
            "edits": {
                "statement_text": "Corrected: signed 4 March.",
                "short_label": "signing",
                "fact_type": "user_entered",
                "confidence_level": "high",
                "is_material": True,
                "matter_id": matter_b["id"],
            },
        },
    ).json()["fact"]
    assert fact["statement_text"] == "Corrected: signed 4 March."
    assert fact["short_label"] == "signing"
    assert fact["fact_type"] == "user_entered"
    assert fact["confidence_level"] == "high"
    assert fact["is_material"] is True
    assert fact["matter_id"] == matter_b["id"]


def test_accept_requires_text_or_edits_422(client, matter):
    p = _proposal(client, matter_id=matter["id"], text=None)
    resp = client.post(f"/api/v1/proposals/{p['id']}/review", json={"action": "accept"})
    assert resp.status_code == 422
    # a failed accept leaves the proposal untouched
    assert client.get(f"/api/v1/proposals/{p['id']}").json()["review_state"] == "proposed"
    # ...and can then be accepted with edited text
    ok = client.post(
        f"/api/v1/proposals/{p['id']}/review",
        json={"action": "accept_with_edits", "edits": {"statement_text": "Provided later."}},
    )
    assert ok.status_code == 200


def test_accept_needs_a_matter_422(client):
    p = _proposal(client)  # no matter on the proposal
    resp = client.post(f"/api/v1/proposals/{p['id']}/review", json={"action": "accept"})
    assert resp.status_code == 422
    assert "matter" in resp.json()["detail"].lower()


def test_non_accept_actions_touch_only_the_proposal(client, matter):
    states = {"reject": "rejected", "defer": "deferred", "uncertain": "uncertain",
              "dispute": "disputed"}
    for action, state in states.items():
        p = _proposal(client, matter_id=matter["id"])
        r = client.post(f"/api/v1/proposals/{p['id']}/review", json={"action": action})
        assert r.status_code == 200
        assert r.json()["proposal"]["review_state"] == state
        assert r.json()["fact"] is None
    assert client.get("/api/v1/facts").json()["total"] == 0


def test_review_and_patch_conflicts(client, matter):
    p = _proposal(client, matter_id=matter["id"])
    assert client.post(f"/api/v1/proposals/{p['id']}/review", json={"action": "accept"}).status_code == 200
    # re-review of an accepted proposal → 409 (any action)
    resp = client.post(f"/api/v1/proposals/{p['id']}/review", json={"action": "reject"})
    assert resp.status_code == 409
    # PATCH only while proposed → 409 after review
    resp = client.patch(f"/api/v1/proposals/{p['id']}", json={"title": "late edit"})
    assert resp.status_code == 409
    # deferred/uncertain remain reviewable per §4.2
    p2 = _proposal(client, matter_id=matter["id"])
    client.post(f"/api/v1/proposals/{p2['id']}/review", json={"action": "defer"})
    # ...but patching a deferred proposal is still off-limits (proposed only)
    assert client.patch(f"/api/v1/proposals/{p2['id']}", json={"title": "t"}).status_code == 409
    r = client.post(
        f"/api/v1/proposals/{p2['id']}/review",
        json={"action": "accept"},
    )
    assert r.status_code == 200


def test_patch_proposal_fields_while_proposed(client, matter):
    p = _proposal(client, matter_id=matter["id"])
    resp = client.patch(
        f"/api/v1/proposals/{p['id']}",
        json={"title": "Fixed title", "confidence_score": 0.75,
              "proposed_structured_json": {"dates": ["2024-03-03"]}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Fixed title"
    assert abs(body["confidence_score"] - 0.75) < 1e-6
    assert body["proposed_structured_json"] == {"dates": ["2024-03-03"]}
    assert body["review_state"] == "proposed"  # patch never changes the floor


# --- §4.2 bulk review: partial success --------------------------------------------


def test_bulk_review_partial_success(client, matter):
    good = _proposal(client, matter_id=matter["id"], text="Good proposal with enough text.")
    empty = _proposal(client, matter_id=matter["id"], text=None)
    ghost = str(uuid.uuid4())
    pre = _proposal(client, matter_id=matter["id"])
    client.post(f"/api/v1/proposals/{pre['id']}/review", json={"action": "reject"})

    resp = client.post(
        "/api/v1/proposals/bulk-review",
        json={"ids": [good["id"], empty["id"], ghost, pre["id"]], "action": "accept",
              "review_notes": "bulk pass"},
    )
    assert resp.status_code == 200
    body = resp.json()
    ok_by_id = {r["id"]: r for r in body["results"]}
    assert ok_by_id[good["id"]]["ok"] is True and ok_by_id[good["id"]]["error"] is None
    assert ok_by_id[empty["id"]]["ok"] is False and "text" in ok_by_id[empty["id"]]["error"].lower()
    assert ok_by_id[ghost]["ok"] is False and "not found" in ok_by_id[ghost]["error"].lower()
    assert ok_by_id[pre["id"]]["ok"] is False and "already reviewed" in ok_by_id[pre["id"]]["error"]
    good_fact_id = client.get(f"/api/v1/proposals/{good['id']}").json()["created_fact_id"]
    assert body["created_facts"] == [good_fact_id]
    # successes persisted; failures did not
    assert client.get(f"/api/v1/proposals/{good['id']}").json()["review_state"] == "accepted"
    assert client.get(f"/api/v1/proposals/{empty['id']}").json()["review_state"] == "proposed"
    # and even the successes are only `proposed` facts
    fact_id = body["created_facts"][0]
    assert client.get(f"/api/v1/facts/{fact_id}").json()["review_state"] == "proposed"


def test_bulk_review_reject_flow(client, matter):
    a = _proposal(client, matter_id=matter["id"])
    b = _proposal(client, matter_id=matter["id"])
    resp = client.post("/api/v1/proposals/bulk-review", json={"ids": [a["id"], b["id"]],
                                                              "action": "reject"})
    assert resp.status_code == 200
    assert all(r["ok"] for r in resp.json()["results"])
    assert resp.json()["created_facts"] == []
    states = {client.get(f"/api/v1/proposals/{i['id']}").json()["review_state"] for i in (a, b)}
    assert states == {"rejected"}


# --- §4.4 (via the API): generation ------------------------------------------------


def test_generate_from_text_source_flow(client, matter):
    text = (
        "First paragraph, comfortably over the forty-character minimum, about the notice.\n\n"
        "too short\n\n"
        "Second paragraph, also comfortably over the forty-character minimum, about the visit.\n\n"
        "First paragraph, comfortably over the forty-character minimum, about the notice."  # dup
    )
    src = _upload_text(client, text.encode())
    gen = client.post("/api/v1/proposals/generate", json={"source_id": src["id"]})
    assert gen.status_code == 200
    body = gen.json()
    assert body["created"] == 2
    assert body["skipped"] == 2  # one <40-char, one duplicate provenance key
    assert body["queued"] is False

    page = client.get("/api/v1/proposals", params={"source_id": src["id"]}).json()
    assert page["total"] == 2
    for p in page["items"]:
        assert p["review_state"] == "proposed"
        assert p["created_by_system"] is True
        assert p["proposal_type"] == "fact"
        assert p["source"]["id"] == src["id"]
        assert p["confidence_score"] is None
        assert len(p["title"]) <= 80

    # re-run is idempotent: nothing new is created
    again = client.post("/api/v1/proposals/generate", json={"source_id": src["id"]}).json()
    assert again["created"] == 0 and again["skipped"] == 4
    assert client.get("/api/v1/proposals").json()["total"] == 2

    # the max_proposals cap applies to the run
    big_text = "\n\n".join(
        f"Paragraph number {i} padded out well past the forty-character skip threshold."
        for i in range(6)
    )
    src2 = _upload_text(client, big_text.encode(), name="big.txt")
    capped = client.post(
        "/api/v1/proposals/generate", json={"source_id": src2["id"], "max_proposals": 2}
    ).json()
    assert capped["created"] == 2 and capped["skipped"] == 4
    # and >50 is rejected (schema cap), not silently honored
    assert client.post("/api/v1/proposals/generate",
                       json={"source_id": src2["id"], "max_proposals": 500}).status_code == 422

    # accept one generated proposal: it has no matter, so edits supply one
    generated = client.get("/api/v1/proposals", params={"source_id": src2["id"]}).json()["items"][0]
    r = client.post(
        f"/api/v1/proposals/{generated['id']}/review",
        json={"action": "accept", "edits": {"matter_id": matter["id"]}},
    )
    assert r.status_code == 200 and r.json()["fact"]["review_state"] == "proposed"


def test_generate_unknown_source_404(client):
    resp = client.post("/api/v1/proposals/generate", json={"source_id": str(uuid.uuid4())})
    assert resp.status_code == 404


# --- §4.3 facts: approve, review-state, supersede ------------------------------------


def test_approve_only_once(client, matter):
    f = _fact(client, matter["id"])
    r = client.post(f"/api/v1/facts/{f['id']}/approve")
    assert r.status_code == 200
    again = client.post(f"/api/v1/facts/{f['id']}/approve")
    assert again.status_code == 409


def test_review_state_transitions_and_notes(client, matter):
    f = _fact(client, matter["id"])
    for state in ("rejected", "deferred", "uncertain", "disputed", "accepted_with_edits"):
        r = client.post(f"/api/v1/facts/{f['id']}/review-state",
                        json={"review_state": state, "notes": "kept for audit sprint"})
        assert r.status_code == 200, (state, r.text)
        assert r.json()["review_state"] == state
    # notes have no storage before Migration 010 (contract §2 "Deferred");
    # the endpoint must still accept them — see W2-G note, Contract gaps
    assert client.get(f"/api/v1/facts/{f['id']}").json()["review_state"] == "accepted_with_edits"


def test_supersede_flow(client, matter):
    f = _fact(client, matter["id"], short_label="original", confidence_level="medium")
    approve = client.post(f"/api/v1/facts/{f['id']}/approve")
    assert approve.status_code == 200
    r = client.post(
        f"/api/v1/facts/{f['id']}/supersede",
        json={"statement_text": "Replacement statement for the fact.", "short_label": "v2"},
    )
    assert r.status_code == 200
    old, new = r.json()["old_fact"], r.json()["new_fact"]
    assert old["review_state"] == "superseded"
    assert new["review_state"] == "proposed"  # the floor again
    assert new["supersedes_fact_id"] == f["id"]
    assert new["short_label"] == "v2"
    assert new["confidence_level"] == "medium"  # falls back to the old fact
    assert new["matter_id"] == matter["id"]
    # superseded facts are frozen
    ghost = str(uuid.uuid4())
    assert client.post(f"/api/v1/facts/{f['id']}/supersede",
                       json={"statement_text": "again"}).status_code == 409
    assert client.post(f"/api/v1/facts/{f['id']}/review-state",
                       json={"review_state": "deferred"}).status_code == 409
    assert client.post(f"/api/v1/facts/{f['id']}/approve").status_code == 409
    assert client.post(f"/api/v1/facts/{ghost}/supersede",
                       json={"statement_text": "x"}).status_code == 404


def test_fact_patch_touches_content_only(client, matter):
    f = _fact(client, matter["id"])
    client.post(f"/api/v1/facts/{f['id']}/approve")
    r = client.patch(
        f"/api/v1/facts/{f['id']}",
        json={"statement_text": "Reworded statement.", "is_material": True,
              "fact_type": "testimony"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["statement_text"] == "Reworded statement."
    assert body["is_material"] is True
    assert body["fact_type"] == "testimony"
    assert body["review_state"] == "accepted"  # untouched by PATCH


# --- §4.3 links ------------------------------------------------------------------------


def test_fact_source_link_uniques(client, matter, db):
    from app.models.source import SourceExcerpt

    src = _upload_text(client, b"Body of the source used for linking." * 3)
    other = _upload_text(client, b"Another source entirely, long enough to pass.", name="o.txt")
    f = _fact(client, matter["id"])

    link = client.post(
        f"/api/v1/facts/{f['id']}/source-links",
        json={"source_id": src["id"], "support_type": "supports", "strength": "high"},
    )
    assert link.status_code == 201
    assert link.json()["source_title"] == src["title"]

    # duplicate (fact, source, excerpt=NULL, support_type) → 409 (§2 NULLS NOT DISTINCT)
    dup = client.post(f"/api/v1/facts/{f['id']}/source-links",
                      json={"source_id": src["id"], "support_type": "supports"})
    assert dup.status_code == 409
    # a different support_type is a different tuple
    contra = client.post(f"/api/v1/facts/{f['id']}/source-links",
                         json={"source_id": src["id"], "support_type": "contradicts"})
    assert contra.status_code == 201

    # excerpt-attached link: excerpt belongs to the source
    ex = SourceExcerpt(source_id=src["id"], excerpt_type="quote",
                       excerpt_text="Body of the", page_start=1)
    db.add(ex)
    db.commit()
    with_ex = client.post(f"/api/v1/facts/{f['id']}/source-links",
                          json={"source_id": src["id"], "excerpt_id": str(ex.id),
                                "support_type": "mentions"})
    assert with_ex.status_code == 201
    other_excerpt = SourceExcerpt(source_id=other["id"], excerpt_type="quote",
                                  excerpt_text="x", page_start=1)
    db.add(other_excerpt)
    db.commit()
    mismatch = client.post(f"/api/v1/facts/{f['id']}/source-links",
                           json={"source_id": src["id"], "excerpt_id": str(other_excerpt.id),
                                 "support_type": "background"})
    assert mismatch.status_code == 422

    # unknown source / excerpt → 404
    assert client.post(f"/api/v1/facts/{f['id']}/source-links",
                       json={"source_id": str(uuid.uuid4())}).status_code == 404
    assert client.post(f"/api/v1/facts/{f['id']}/source-links",
                       json={"source_id": src["id"],
                             "excerpt_id": str(uuid.uuid4())}).status_code == 404

    listed = client.get(f"/api/v1/facts/{f['id']}/source-links").json()
    assert {l["id"] for l in listed} == {link.json()["id"], contra.json()["id"],
                                        with_ex.json()["id"]}
    # the link surfaces inside FactOut as well
    assert len(client.get(f"/api/v1/facts/{f['id']}").json()["source_links"]) == 3

    # delete round-trip (routes mount under /api/v1 like their siblings)
    gone = client.delete(f"/api/v1/fact-source-links/{listed[0]['id']}")
    assert gone.status_code == 204
    assert client.delete(f"/api/v1/fact-source-links/{listed[0]['id']}").status_code == 404
    assert len(client.get(f"/api/v1/facts/{f['id']}/source-links").json()) == 2


def test_fact_actor_link_uniques(client, matter):
    actor = client.post("/api/v1/actors",
                        json={"display_name": "J. Rivera", "actor_type": "person"}).json()
    f = _fact(client, matter["id"])
    l1 = client.post(f"/api/v1/facts/{f['id']}/actor-links",
                     json={"actor_id": actor["id"], "role_in_fact": "witness"})
    assert l1.status_code == 201
    dup = client.post(f"/api/v1/facts/{f['id']}/actor-links",
                      json={"actor_id": actor["id"], "role_in_fact": "witness"})
    assert dup.status_code == 409
    other_role = client.post(f"/api/v1/facts/{f['id']}/actor-links",
                             json={"actor_id": actor["id"], "role_in_fact": "custodian"})
    assert other_role.status_code == 201
    listed = client.get(f"/api/v1/facts/{f['id']}/actor-links").json()
    assert len(listed) == 2
    assert client.post(f"/api/v1/facts/{f['id']}/actor-links",
                       json={"actor_id": str(uuid.uuid4())}).status_code == 404
    assert client.delete(f"/api/v1/fact-actor-links/{other_role.json()['id']}").status_code == 204
    assert len(client.get(f"/api/v1/facts/{f['id']}/actor-links").json()) == 1
    # unknown fact id → 404 on the link routes too
    assert client.post(f"/api/v1/facts/{uuid.uuid4()}/actor-links",
                       json={"actor_id": actor["id"]}).status_code == 404


# --- §3/§4.3 listing + envelope ------------------------------------------------------------


def test_fact_list_filters_and_envelope(client, matter, matter_b):
    f1 = _fact(client, matter["id"], statement_text="Hallway light was on at 11pm.",
               fact_type="testimony", is_material=True)
    f2 = _fact(client, matter_b["id"], statement_text="Lease renewal letter dated April.",
               fact_type="source_derived")
    client.post(f"/api/v1/facts/{f1['id']}/approve")
    client.post(f"/api/v1/facts/{f2['id']}/review-state", json={"review_state": "rejected"})

    page = client.get("/api/v1/facts").json()
    assert set(page) == {"items", "total", "limit", "offset"}
    assert page["total"] == 2 and page["limit"] == 50 and page["offset"] == 0

    assert [f["id"] for f in
            client.get("/api/v1/facts", params={"review_state": "accepted"}).json()["items"]] == [f1["id"]]
    both = client.get("/api/v1/facts",
                      params=[("review_state", "accepted"), ("review_state", "rejected")]).json()
    assert {f["id"] for f in both["items"]} == {f1["id"], f2["id"]}
    assert client.get("/api/v1/facts", params={"matter_id": matter_b["id"]}).json()["total"] == 1
    assert client.get("/api/v1/facts", params={"q": "hallway"}).json()["total"] == 1
    assert client.get("/api/v1/facts", params={"fact_type": "testimony"}).json()["total"] == 1
    assert client.get("/api/v1/facts", params={"is_material": "false"}).json()["total"] == 1
    # paging
    lp = client.get("/api/v1/facts", params={"limit": 1, "offset": 1}).json()
    assert lp["total"] == 2 and len(lp["items"]) == 1
    # limits are bounded (§3 preamble: limit ≤ 200)
    assert client.get("/api/v1/facts", params={"limit": 201}).status_code == 422
    # unknown facts 404 everywhere
    ghost = str(uuid.uuid4())
    assert client.get(f"/api/v1/facts/{ghost}").status_code == 404
    assert client.post(f"/api/v1/facts/{ghost}/approve").status_code == 404


def test_proposal_list_filters(client, matter):
    hi = _proposal(client, matter_id=matter["id"], confidence_score=0.9)
    _proposal(client, matter_id=matter["id"], proposal_type="verification_task",
              confidence_score=0.1, text="Ask the superintendent for the work order log, please.")
    assert client.get("/api/v1/proposals", params={"min_confidence": 0.5}).json()["total"] == 1
    assert client.get("/api/v1/proposals", params={"proposal_type": "verification_task"}
                       ).json()["total"] == 1
    assert client.get("/api/v1/proposals", params={"matter_id": matter["id"]}).json()["total"] == 2
    assert client.get("/api/v1/proposals", params={"review_state": "accepted"}).json()["total"] == 0
    client.post(f"/api/v1/proposals/{hi['id']}/review", json={"action": "defer"})
    assert client.get("/api/v1/proposals", params={"review_state": "deferred"}).json()["total"] == 1
    assert client.get(f"/api/v1/proposals/{uuid.uuid4()}").status_code == 404


def test_workspace_scoping(client, matter):
    _fact(client, matter["id"])
    # unknown workspace → 404 before any listing happens
    resp = client.get("/api/v1/facts", params={"workspace_id": str(uuid.uuid4())})
    assert resp.status_code == 404
    resp = client.get("/api/v1/proposals", params={"workspace_id": str(uuid.uuid4())})
    assert resp.status_code == 404

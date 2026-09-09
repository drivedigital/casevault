"""Phase 1 API flows: local identity bootstrap, workspace, matters,
cross-matter links, actor registry, and matter role assignment."""


def test_bootstrap_creates_owner_and_workspace(client):
    resp = client.get("/api/v1/workspaces/current")
    assert resp.status_code == 200
    ws = resp.json()
    assert ws["name"] == "CaseVault Workspace"
    assert ws["jurisdiction_default"] == "NY"
    assert ws["ai_sharing_default"] == "no_ai"
    # idempotent: second call returns the same workspace
    assert client.get("/api/v1/workspaces/current").json()["id"] == ws["id"]


def test_matter_crud_and_autoslug(client):
    payload = {
        "name": "230 CPS — 2F Bedroom C",
        "matter_type": "merits",
        "theory_summary": "Unlawful exclusion from 2F.",
    }
    resp = client.post("/api/v1/matters", json=payload)
    assert resp.status_code == 201
    matter = resp.json()
    assert matter["slug"] == "230-cps-2f-bedroom-c"
    assert matter["status"] == "active"
    assert matter["jurisdiction"] == "NY"
    assert matter["ai_sharing_policy"] == "no_ai"

    # duplicate slug rejected
    resp = client.post("/api/v1/matters", json=payload)
    assert resp.status_code == 409

    # patch + archive
    resp = client.patch(
        f"/api/v1/matters/{matter['id']}", json={"status": "archived"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"
    assert resp.json()["archived_at"] is not None

    # filters
    assert client.get("/api/v1/matters", params={"status": "active"}).json() == []
    assert len(client.get("/api/v1/matters", params={"status": "archived"}).json()) == 1


def test_overlay_proceeding_links_both_directions(client):
    m1 = client.post("/api/v1/matters", json={"name": "Merits One"}).json()
    m2 = client.post("/api/v1/matters", json={"name": "Merits Two"}).json()
    p19 = client.post(
        "/api/v1/matters",
        json={"name": "Part 19 — Article 81 leave", "matter_type": "proceeding"},
    ).json()
    assert p19["matter_type"] == "proceeding"

    for target in (m1, m2):
        resp = client.post(
            f"/api/v1/matters/{p19['id']}/links",
            json={"to_matter_id": target["id"], "link_type": "overlays"},
        )
        assert resp.status_code == 201

    # the overlay matter sees both outgoing links
    links = client.get(f"/api/v1/matters/{p19['id']}/links").json()
    assert len(links) == 2
    assert all(link["direction"] == "outgoing" for link in links)

    # each merits matter sees the same link as incoming
    links = client.get(f"/api/v1/matters/{m1['id']}/links").json()
    assert len(links) == 1
    assert links[0]["direction"] == "incoming"
    assert links[0]["from_matter_name"] == "Part 19 — Article 81 leave"

    # duplicate link rejected; self-link rejected
    assert client.post(
        f"/api/v1/matters/{p19['id']}/links",
        json={"to_matter_id": m1["id"], "link_type": "overlays"},
    ).status_code == 409
    assert client.post(
        f"/api/v1/matters/{p19['id']}/links",
        json={"to_matter_id": p19["id"], "link_type": "related"},
    ).status_code == 422

    # delete link
    link_id = client.get(f"/api/v1/matters/{p19['id']}/links").json()[0]["id"]
    assert client.delete(f"/api/v1/matter-links/{link_id}").status_code == 204
    assert len(client.get(f"/api/v1/matters/{p19['id']}/links").json()) == 1


def test_actor_registry_and_matter_roles(client):
    actor = client.post(
        "/api/v1/actors",
        json={
            "display_name": "Dana  Grove",
            "actor_type": "person",
            "aliases": ["DG", "D. Grove"],
        },
    ).json()
    assert actor["normalized_name"] == "dana grove"
    assert len(actor["aliases"]) == 2

    # search matches the display name
    found = client.get("/api/v1/actors", params={"q": "dana"}).json()
    assert any(a["id"] == actor["id"] for a in found)

    # search also matches alias text that does not appear in the display name
    found = client.get("/api/v1/actors", params={"q": "dg"}).json()
    assert any(a["id"] == actor["id"] for a in found)
    found = client.get("/api/v1/actors", params={"q": "no-such-actor"}).json()
    assert found == []

    matter_id = client.post("/api/v1/matters", json={"name": "Role Matter"}).json()["id"]
    other_id = client.post("/api/v1/matters", json={"name": "Other Matter"}).json()["id"]

    resp = client.post(
        f"/api/v1/matters/{matter_id}/actors",
        json={"actor_id": actor["id"], "role_label": "plaintiff"},
    )
    assert resp.status_code == 201
    # same actor, different role in a different matter — no duplication
    resp = client.post(
        f"/api/v1/matters/{other_id}/actors",
        json={"actor_id": actor["id"], "role_label": "witness"},
    )
    assert resp.status_code == 201
    # duplicate role rejected
    resp = client.post(
        f"/api/v1/matters/{matter_id}/actors",
        json={"actor_id": actor["id"], "role_label": "plaintiff"},
    )
    assert resp.status_code == 409

    # matter actor list
    actors = client.get(f"/api/v1/matters/{matter_id}/actors").json()
    assert len(actors) == 1
    assert actors[0]["role_label"] == "plaintiff"

    # dossier shows both matters
    dossier = client.get(f"/api/v1/actors/{actor['id']}").json()
    assert len(dossier["roles"]) == 2
    matter_names = {r["matter_name"] for r in dossier["roles"]}
    assert matter_names == {"Role Matter", "Other Matter"}

    # alias add + duplicate rejected + delete
    alias = client.post(
        f"/api/v1/actors/{actor['id']}/aliases", json={"alias_text": "Dana G."}
    ).json()
    assert client.post(
        f"/api/v1/actors/{actor['id']}/aliases", json={"alias_text": "Dana G."}
    ).status_code == 409
    assert client.delete(f"/api/v1/actor-aliases/{alias['id']}").status_code == 204

    # role delete
    role_id = client.get(f"/api/v1/matters/{matter_id}/actors").json()[0]["role_id"]
    assert client.delete(f"/api/v1/matter-roles/{role_id}").status_code == 204
    assert client.get(f"/api/v1/matters/{matter_id}/actors").json() == []

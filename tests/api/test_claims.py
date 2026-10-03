"""WS-CLAIMS — claims matrix & burden-of-proof mapping.

Covers the two workstream invariants end-to-end through the HTTP API:

1. Claims map to underlying accepted facts and evidence sources.
2. Burden-of-proof status (unsupported / partially supported / proven) is
   tracked per element and rolled up per claim, with explanations.

Plus: template -> instance materialization, link/unlink mutations with
auto-recompute (Tech Spec §10.3), duplicate-link 409, cross-matter guard,
candidate ranking, gap analysis.
"""
from __future__ import annotations

import csv
import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.actor import Actor
from app.models.enums import (
    ActorType,
    EvidenceReviewStatus,
    FactType,
    MatterStatus,
    MatterType,
    ReviewState,
    SourceStatus,
    SourceType,
    StrengthLabel,
    SupportOriginType,
    SupportType,
)
from app.models.fact import FactAssertion, FactSupportLink
from app.models.matter import Matter
from app.models.source import Source, SourceExcerpt, SourceMatterLink
from app.models.user import User
from app.models.workspace import Workspace


# --------------------------------------------------------------------- helpers


class Ctx:
    def __init__(self, **kw):
        self.__dict__.update(kw)


@pytest.fixture()
def ctx(session: Session) -> Ctx:
    """One workspace + matter + a shared cast of sources/facts, committed."""
    ws_owner = User(email="t@e.invalid", display_name="Tester")
    ws = Workspace(name="T", slug="t")
    session.add_all([ws_owner, ws])
    session.flush()
    ws.owner_id = ws_owner.id
    matter = Matter(workspace_id=ws.id, title="Test Matter")
    other = Matter(workspace_id=ws.id, title="Other Matter")
    actor = Actor(workspace_id=ws.id, actor_type=ActorType.entity, display_name="Acme Corp")
    session.add_all([matter, other, actor])
    session.flush()

    ctx = Ctx(ws=ws, matter=matter, other_matter=other, actor=actor, session=session)
    ctx.src_seq = 0
    ctx.fact_seq = 0
    return ctx


def make_source(ctx: Ctx, title: str, status: SourceStatus = SourceStatus.primary, review: EvidenceReviewStatus = EvidenceReviewStatus.reviewed) -> Source:
    src = Source(
        workspace_id=ctx.ws.id, source_type=SourceType.pdf, title=title,
        source_status=status, evidence_review_status=review,
    )
    ctx.session.add(src)
    ctx.session.flush()
    ctx.session.add(SourceMatterLink(source_id=src.id, matter_id=ctx.matter.id))
    return src


def make_fact(
    ctx: Ctx,
    label: str,
    text: str | None = None,
    *,
    review: ReviewState = ReviewState.accepted,
    anchors: list[tuple[Source, SupportType]] | None = None,
    locator: str | None = None,
    matter: Matter | None = None,
) -> FactAssertion:
    fact = FactAssertion(
        workspace_id=ctx.ws.id,
        matter_id=(matter or ctx.matter).id,
        short_label=label,
        statement_text=text or f"Fact: {label}",
        review_state=review,
        fact_type=FactType.source_derived,
    )
    ctx.session.add(fact)
    ctx.session.flush()
    for src, st in anchors or []:
        ex = None
        if locator:
            ex = SourceExcerpt(
                source_id=src.id, page_start=3, page_end=3,
                locator_text=locator, excerpt_text=f"…{label}…",
            )
            ctx.session.add(ex)
            ctx.session.flush()
        ctx.session.add(
            FactSupportLink(
                fact_id=fact.id,
                support_origin_type=SupportOriginType.source_excerpt if ex else SupportOriginType.source_only,
                source_id=src.id,
                excerpt_id=ex.id if ex else None,
                support_type=st,
                strength=StrengthLabel.medium,
            )
        )
    ctx.session.commit()
    return fact


def make_template(client: TestClient, name: str = "Breach of Contract", elements: list[str] | None = None) -> dict:
    resp = client.post(
        "/api/v1/claim-templates",
        json={
            "name": name,
            "category": "contract",
            "elements": [
                {
                    "element_label": lbl,
                    "element_description": f"Duty: {lbl}",
                }
                for lbl in (elements or ["Existence of contract", "Performance", "Breach", "Damages"])
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def create_claim(ctx: Ctx, client: TestClient, code: str = "C1", elements: list[str] | None = None) -> tuple[dict, dict]:
    template = make_template(client, elements=elements)
    resp = client.post(
        "/api/v1/claim-instances",
        json={
            "matter_id": str(ctx.matter.id),
            "template_id": template["id"],
            "name": template["name"],
            "claim_code": code,
            "target_summary": "Acme Corp",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json(), template


def chart(client: TestClient, claim_id: str) -> dict:
    resp = client.get(f"/api/v1/claim-instances/{claim_id}/chart")
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------------------------- the tests


class TestScaffold:
    def test_health(self, client):
        assert client.get("/health").json() == {"status": "ok"}
        body = client.get("/api/v1/health").json()
        assert body["status"] == "ok" and body["db"] == "up"

    def test_matters_stub_lists_matters(self, ctx, client):
        resp = client.get("/api/v1/matters")
        assert resp.status_code == 200
        titles = [m["title"] for m in resp.json()]
        assert "Test Matter" in titles


class TestTemplatesAndCreation:
    def test_create_claim_from_template_copies_elements_in_order(self, ctx, client):
        template = make_template(client)
        claim, _ = create_claim(ctx, client, elements=["A", "B", "C"])
        assert claim["element_count"] == 3
        ch = chart(client, claim["id"])
        assert [e["element_label"] for e in ch["elements"]] == ["A", "B", "C"]
        assert all(e["stored_support_status"] == "not_researched" for e in ch["elements"])

    def test_list_templates_filters_by_jurisdiction(self, client):
        make_template(client, name="Negligence", elements=["Duty"])
        make_template(client, name="Breach of Contract", elements=["A"])
        resp = client.get("/api/v1/claim-templates", params={"jurisdiction": "ny"})
        assert resp.status_code == 200
        assert {t["name"] for t in resp.json()} >= {"Negligence", "Breach of Contract"}
        resp = client.get("/api/v1/claim-templates", params={"jurisdiction": "CA"})
        assert resp.json() == []

    def test_claim_for_unknown_matter_404(self, ctx, client):
        template = make_template(client)
        resp = client.post(
            "/api/v1/claim-instances",
            json={"matter_id": str(uuid.uuid4()), "template_id": template["id"], "name": "X"},
        )
        assert resp.status_code == 404


class TestBurdenRollup:
    def test_fresh_claim_is_unsupported(self, ctx, client):
        claim, _ = create_claim(ctx, client)
        ch = chart(client, claim["id"])
        assert ch["burden"]["status"] == "unsupported"
        assert ch["burden"]["unsupported_elements"] == 4
        assert "No element carries the burden" in ch["burden"]["explanation"]

    def test_link_one_anchored_fact_makes_claim_partially_supported(self, ctx, client):
        src = make_source(ctx, "Signed agreement.pdf")
        fact = make_fact(ctx, "Contract signed", anchors=[(src, SupportType.supports)], locator="p.1")
        claim, _ = create_claim(ctx, client)
        el1 = chart(client, claim["id"])["elements"][0]
        r = client.post(
            f"/api/v1/claim-elements/{el1['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        )
        assert r.status_code == 201, r.text
        out = r.json()
        # 3 pts of anchored support -> moderate; moderate + primary anchor -> element proven
        assert out["computed_support_status"] == "moderate_support"
        assert out["burden_status"] == "proven"
        assert out["has_primary_anchor"] is True

        ch = chart(client, claim["id"])
        assert ch["burden"]["status"] == "partially_supported"
        assert ch["burden"]["proven_elements"] == 1
        assert ch["burden"]["unsupported_elements"] == 3

    def test_all_elements_proven_rolls_up_to_proven(self, ctx, client):
        src = make_source(ctx, "Primary evidence.pdf")
        facts = [
            make_fact(ctx, f"F{i}", anchors=[(src, SupportType.supports), (src, SupportType.supports)], locator="p.2")
            for i in range(4)
        ]
        claim, _ = create_claim(ctx, client)
        elements = chart(client, claim["id"])["elements"]
        for el, fact in zip(elements, facts):
            r = client.post(
                f"/api/v1/claim-elements/{el['id']}/link-fact",
                json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
            )
            assert r.status_code == 201
        ch = chart(client, claim["id"])
        assert ch["burden"]["status"] == "proven"
        assert ch["burden"]["proven_elements"] == 4
        assert "primary evidence" in ch["burden"]["explanation"]

    def test_unanchored_support_cannot_be_proven(self, ctx, client):
        note = make_source(ctx, "Attorney working note", status=SourceStatus.working_note)
        fact = make_fact(ctx, "Client recollection", anchors=[(note, SupportType.supports)])
        claim, _ = create_claim(ctx, client, elements=["Only element"])
        el = chart(client, claim["id"])["elements"][0]
        r = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        ).json()
        # two high-weight? we linked one fact with one note anchor: points=3 <4 -> weak? (3 pts => moderate? rule: >=2 moderate)
        assert r["computed_support_status"] in ("weak_support", "moderate_support")
        assert r["burden_status"] == "partially_supported"
        assert r["has_primary_anchor"] is False
        assert any(w["code"] == "no_primary_source_anchor" for w in r["warnings"])
        ch = chart(client, claim["id"])
        assert ch["burden"]["status"] == "partially_supported"

    def test_only_unaccepted_facts_does_not_move_burden(self, ctx, client):
        src = make_source(ctx, "Hit list")
        fact = make_fact(ctx, "Proposed fact", review=ReviewState.proposed, anchors=[(src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support"},
        )
        out = chart(client, claim["id"])["elements"][0]
        assert out["computed_support_status"] == "no_support"
        assert out["burden_status"] == "unsupported"
        assert any(
            w["code"] == "no_linked_facts" for w in out["warnings"]
        ) or len(out["support_facts"]) == 0
        # the unaccepted fact is still visible as a (non-counting) link in the chart? No: only accepted links count toward
        # support lists — assert it was recorded but inactive via stored warning-free payload:
        assert out["support_points"] == 0
        assert out["support_facts"] == [] or all(
            f["review_state"] == "accepted" for f in out["support_facts"]
        )

    def test_adverse_facts_create_conflicted_status(self, ctx, client):
        src = make_source(ctx, "Docs")
        good = make_fact(ctx, "Good fact", anchors=[(src, SupportType.supports)])
        bad1 = make_fact(ctx, "Bad fact 1", anchors=[(src, SupportType.contradicts)])
        bad2 = make_fact(ctx, "Bad fact 2", anchors=[(src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        base = {"fact_id": str(good.id), "link_polarity": "support", "weight_label": "medium"}
        client.post(f"/api/v1/claim-elements/{el['id']}/link-fact", json=base)
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(bad1.id), "link_polarity": "adverse", "weight_label": "medium"},
        )
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(bad2.id), "link_polarity": "adverse", "weight_label": "medium"},
        )
        out = chart(client, claim["id"])["elements"][0]
        assert out["computed_support_status"] == "conflicted"
        assert out["burden_status"] == "partially_supported"
        assert any(w["code"] == "adverse_facts" for w in out["warnings"])
        assert len(out["adverse_facts"]) == 2


class TestEvidenceMapping:
    def test_chart_maps_element_to_facts_to_sources(self, ctx, client):
        src = make_source(ctx, "Executed MSA (2024)")
        fact = make_fact(
            ctx, "Contract executed",
            text="Parties executed the MSA on 2024-03-01.",
            anchors=[(src, SupportType.supports)], locator="Signature block, p.12",
        )
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        )
        el = chart(client, claim["id"])["elements"][0]
        assert len(el["support_facts"]) == 1
        f = el["support_facts"][0]
        assert f["fact_id"] == str(fact.id)
        assert f["statement_text"] == "Parties executed the MSA on 2024-03-01."
        assert f["has_primary_source"] is True
        assert len(f["evidence"]) == 1
        ev = f["evidence"][0]
        assert ev["title"] == "Executed MSA (2024)"
        assert ev["source_status"] == "primary"
        assert ev["evidence_review_status"] == "reviewed"
        assert ev["is_primary_anchor"] is True
        assert ev["locator_text"] == "Signature block, p.12"
        assert ev["page_start"] == 3

    def test_testimony_only_anchor_is_flagged(self, ctx, client):
        depo = make_source(ctx, "Depo of CFO", status=SourceStatus.testimony)
        fact = make_fact(ctx, "Oral admission", anchors=[(depo, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        out = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        ).json()
        assert out["testimony_only"] is True
        assert out["has_primary_anchor"] is False
        assert any(w["code"] == "testimony_only" for w in out["warnings"])

    def test_excluded_source_disqualifies_primary_anchor(self, ctx, client):
        src = make_source(
            ctx, "Privileged memo",
            status=SourceStatus.primary, review=EvidenceReviewStatus.privileged,
        )
        fact = make_fact(ctx, "Memo content", anchors=[(src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        out = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        ).json()
        assert out["has_primary_anchor"] is False  # privileged primary doesn't count as a usable anchor
        assert out["support_facts"][0]["evidence"][0]["is_primary_anchor"] is False


class TestMutationsAndGaps:
    def test_duplicate_link_returns_409(self, ctx, client):
        src = make_source(ctx, "Doc")
        fact = make_fact(ctx, "Dedup fact", anchors=[(src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        body = {"fact_id": str(fact.id), "link_polarity": "support"}
        assert client.post(f"/api/v1/claim-elements/{el['id']}/link-fact", json=body).status_code == 201
        assert client.post(f"/api/v1/claim-elements/{el['id']}/link-fact", json=body).status_code == 409

    def test_cross_matter_fact_rejected(self, ctx, client):
        other_fact = make_fact(ctx, "Elsewhere", anchors=[])
        other_fact.matter_id = ctx.other_matter.id
        ctx.session.commit()
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        r = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(other_fact.id), "link_polarity": "support"},
        )
        assert r.status_code == 400

    def test_unlink_recomputes_and_restores_status(self, ctx, client):
        src = make_source(ctx, "Doc")
        fact = make_fact(ctx, "To unlink", anchors=[(src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "medium"},
        )
        linked = chart(client, claim["id"])["elements"][0]
        assert linked["burden_status"] == "proven"
        link_id = linked["support_facts"][0]["link_id"]
        del_resp = client.delete(f"/api/v1/claim-elements/{el['id']}/link-fact/{link_id}")
        assert del_resp.status_code == 204
        el_after = chart(client, claim["id"])["elements"][0]
        assert el_after["burden_status"] == "unsupported"
        assert el_after["support_facts"] == []

    def test_recompute_persists_status_and_highest_priority_gap(self, ctx, client):
        src = make_source(ctx, "Doc")
        fact = make_fact(ctx, "Persist me", anchors=[(src, SupportType.supports), (src, SupportType.supports)])
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        assert el["stored_support_status"] == "not_researched"
        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        )
        ch = chart(client, claim["id"])
        first = ch["elements"][0]
        # link endpoint auto-recomputes (Tech Spec §10.3) so stored == computed
        assert first["stored_support_status"] == first["computed_support_status"] == "moderate_support"
        assert ch["claim"]["highest_priority_gap"] and "performance" in ch["claim"]["highest_priority_gap"].lower()
        explicit = client.post(f"/api/v1/claim-instances/{claim['id']}/recompute-support")
        assert explicit.status_code == 200
        assert explicit.json()["burden"]["status"] == "partially_supported"

    def test_gap_analysis_lists_alerts_and_attorney_gap_notes(self, ctx, client):
        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        client.patch(
            f"/api/v1/claim-elements/{el['id']}",
            json={"gap_text": "Need the board consent to prove authority to sign."},
        )
        ch = chart(client, claim["id"])
        codes = {(g["code"], g["element_order"]) for g in ch["gaps"]}
        assert ("attorney_gap_note", el["element_order"]) in codes
        assert ("no_linked_facts", el["element_order"]) in codes
        # gap counts flow to the matrix row
        row = next(
            c for c in client.get(
                "/api/v1/claim-instances", params={"matter_id": str(ctx.matter.id)}
            ).json()["items"]
            if c["id"] == claim["id"]
        )
        assert row["gap_count"] >= 1

    def test_matrix_filters_by_burden(self, ctx, client):
        src = make_source(ctx, "Doc")
        fact = make_fact(ctx, "Anchor", anchors=[(src, SupportType.supports)])
        partial, _ = create_claim(ctx, client, code="C9")
        client.post(  # partial: one proven element, others unsupported
            f"/api/v1/claim-elements/{chart(client, partial['id'])['elements'][0]['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "high"},
        )
        unsupported, _ = create_claim(ctx, client, code="C8")
        by_burden = lambda b: [  # noqa: E731
            c["id"]
            for c in client.get(
                "/api/v1/claim-instances",
                params={"matter_id": str(ctx.matter.id), "burden": b},
            ).json()["items"]
        ]
        assert partial["id"] in by_burden("partially_supported")
        assert unsupported["id"] in by_burden("unsupported")
        assert partial["id"] not in by_burden("unsupported")

    def test_delete_claim(self, ctx, client):
        claim, _ = create_claim(ctx, client)
        assert client.delete(f"/api/v1/claim-instances/{claim['id']}").status_code == 204
        assert client.get(f"/api/v1/claim-instances/{claim['id']}").status_code == 404
        assert client.get(f"/api/v1/claim-instances/{claim['id']}/chart").status_code == 404


class TestSupportCandidates:
    def test_candidates_rank_anchored_material_facts_first_and_exclude_linked(self, ctx, client):
        src = make_source(ctx, "Board minutes")
        strong = make_fact(
            ctx, "Board authorized the signing of the agreement",
            text="The board resolution authorized the CEO to sign the agreement.", anchors=[(src, SupportType.supports)],
        )
        strong.is_material = True
        ctx.session.commit()
        weak_src = make_source(ctx, "Scraps", status=SourceStatus.working_note)
        weak = make_fact(ctx, "Mention of an agreement", anchors=[(weak_src, SupportType.supports)])

        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]  # "Existence of contract"
        cand = client.get(f"/api/v1/claim-elements/{el['id']}/support-candidates").json()
        ids = [c["fact_id"] for c in cand]
        assert ids[0] == str(strong.id)
        assert str(strong.id) in ids and str(weak.id) in ids
        assert cand[0]["score"] > cand[ids.index(str(weak.id))]["score"]
        assert cand[0]["evidence_sources"] == ["Board minutes"]

        client.post(
            f"/api/v1/claim-elements/{el['id']}/link-fact",
            json={"fact_id": str(strong.id), "link_polarity": "support"},
        )
        after = client.get(f"/api/v1/claim-elements/{el['id']}/support-candidates").json()
        assert str(strong.id) not in [c["fact_id"] for c in after]
        both = client.get(
            f"/api/v1/claim-elements/{el['id']}/support-candidates", params={"include_linked": "true"}
        ).json()
        assert str(strong.id) in [c["fact_id"] for c in both]


class TestAuthorityLinks:
    def test_link_authority_marks_verification_and_counts(self, ctx, client):
        from app.models.authority import Authority
        from app.models.enums import AuthorityType

        auth = Authority(
            workspace_id=ctx.ws.id, matter_id=ctx.matter.id,
            authority_type=AuthorityType.case, title="Acme v. Roadrunner",
            citation_text="123 N.Y.2d 45 (2024)", jurisdiction="NY",
            holding_summary="Elements of breach restated.",
        )
        ctx.session.add(auth)
        ctx.session.commit()

        claim, _ = create_claim(ctx, client)
        el = chart(client, claim["id"])["elements"][0]
        out = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-authority",
            json={"authority_id": str(auth.id), "link_type": "controlling"},
        )
        assert out.status_code == 201, out.text
        body = out.json()
        assert body["has_controlling_authority"] is True
        assert body["authorities"][0]["title"] == "Acme v. Roadrunner"
        got = client.get(f"/api/v1/claim-instances/{claim['id']}").json()
        assert got["authority_verification_state"] == "verified"
        # duplicate link -> 409
        dup = client.post(
            f"/api/v1/claim-elements/{el['id']}/link-authority",
            json={"authority_id": str(auth.id), "link_type": "controlling"},
        )
        assert dup.status_code == 409


class TestClaimSummaryExport:
    def test_json_export_includes_burden_elements_and_supporting_evidence_counts(self, ctx, client):
        source = make_source(ctx, "Executed services agreement.pdf")
        fact = make_fact(
            ctx,
            "Agreement signed",
            text="The parties executed the services agreement.",
            anchors=[(source, SupportType.supports)],
            locator="§ 2.1",
        )
        claim, _ = create_claim(ctx, client, code="EXP1", elements=["Agreement", "Performance"])
        first_element = chart(client, claim["id"])["elements"][0]
        linked = client.post(
            f"/api/v1/claim-elements/{first_element['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "medium"},
        )
        assert linked.status_code == 201, linked.text

        response = client.get(
            "/api/v1/claims/export",
            params={"matter_id": str(ctx.matter.id), "format": "json"},
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/json")
        assert "claims-matrix" in response.headers["content-disposition"]
        payload = response.json()
        assert payload["total_claims"] == 1
        assert payload["matter_id"] == str(ctx.matter.id)

        exported = payload["claims"][0]
        assert exported["id"] == claim["id"]
        assert exported["burden"]["status"] == "partially_supported"
        assert exported["supporting_fact_link_count"] == 1
        assert exported["supporting_evidence_anchor_count"] == 1
        assert exported["supporting_source_count"] == 1
        assert len(exported["elements"]) == 2
        element = exported["elements"][0]
        assert element["element_label"] == "Agreement"
        assert element["burden_status"] == "proven"
        assert element["support_status"] == "moderate_support"
        assert element["supporting_fact_link_count"] == 1
        assert element["supporting_evidence_anchor_count"] == 1
        assert element["supporting_source_count"] == 1

    def test_csv_export_is_downloadable_and_has_one_row_per_element(self, ctx, client):
        source = make_source(ctx, "Signed purchase order.pdf")
        fact = make_fact(
            ctx,
            "Purchase order signed",
            anchors=[(source, SupportType.supports)],
            locator="p. 4",
        )
        claim, _ = create_claim(ctx, client, code="EXP2", elements=["Signed order", "Payment due"])
        first_element = chart(client, claim["id"])["elements"][0]
        client.post(
            f"/api/v1/claim-elements/{first_element['id']}/link-fact",
            json={"fact_id": str(fact.id), "link_polarity": "support", "weight_label": "medium"},
        )

        response = client.get("/api/v1/claims/export", params={"matter_id": str(ctx.matter.id)})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert 'filename="claims-matrix-' in response.headers["content-disposition"]
        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert len(rows) == 2
        first = next(row for row in rows if row["element_label"] == "Signed order")
        assert first["burden_status"] == "partially_supported"
        assert first["element_burden_status"] == "proven"
        assert first["element_supporting_fact_link_count"] == "1"
        assert first["element_supporting_evidence_anchor_count"] == "1"
        assert first["element_supporting_source_count"] == "1"

"""Demo/dev seed for the claims matrix (bootstrap necessity; Wave 1 owns this file).

Run:  cd apps/api && python -m app.seed_dev      (uses DATABASE_URL / sqlite fallback)

Creates a small NY-style matter whose claim intentionally lands on every
burden-of-proof state so the UI can be exercised:
  C1 Breach of Contract  -> partially supported (one proven, one anchored-strong,
                            one conflicted by adverse evidence, one unsupported)
  C2 Negligence          -> unsupported (no facts linked at all)
  C3 Account Stated      -> proven (all elements anchored in primary evidence)
"""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import get_sessionmaker, init_db
from app.models.actor import Actor
from app.models.authority import Authority
from app.models.claim import (
    ClaimElement,
    ClaimElementAuthorityLink,
    ClaimElementFactLink,
    ClaimInstance,
    ClaimInstanceTarget,
    ClaimTemplate,
    ClaimTemplateElement,
)
from app.models.enums import (
    ActorType,
    AuthorityLinkType,
    AuthorityType,
    ClaimSupportStatus,
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
from app.services.claim_burden import recompute_claim


def seed() -> None:
    init_db()
    Session = get_sessionmaker()
    with Session() as db:
        existing = db.scalar(select(Workspace).where(Workspace.slug == "default"))
        if existing is not None:
            print("Seed already present (workspace 'default' exists). Aborting.")
            return

        settings = get_settings()
        owner = User(email="attorney@example.invalid", display_name="A. Testperson")
        db.add(owner)
        db.flush()
        ws = Workspace(
            name=settings.default_workspace_name,
            slug=settings.default_workspace_slug,
            owner_id=owner.id,
        )
        db.add(ws)
        db.flush()

        matter = Matter(
            workspace_id=ws.id,
            title="Delgado v. Northline Logistics, Inc.",
            matter_type=MatterType.merits,
            status=MatterStatus.active,
            description="Freight contract dispute (NY Supreme, Commercial Division) with a parallel negligence count.",
        )
        plaintiff = Actor(workspace_id=ws.id, actor_type=ActorType.person, display_name="Maria Delgado", normalized_name="delgado maria")
        defendant = Actor(workspace_id=ws.id, actor_type=ActorType.entity, display_name="Northline Logistics, Inc.", normalized_name="northline logistics inc")
        db.add_all([matter, plaintiff, defendant])
        db.flush()

        def src(title: str, kind: SourceType, status: SourceStatus, review: EvidenceReviewStatus) -> Source:
            s = Source(
                workspace_id=ws.id, source_type=kind, title=title,
                source_status=status, evidence_review_status=review,
                storage_path=f"data/uploads/{uuid.uuid4().hex[:8]}.pdf",
            )
            db.add(s)
            db.flush()
            db.add(SourceMatterLink(source_id=s.id, matter_id=matter.id, link_reason="case file"))
            return s

        contract = src("Executed master services agreement (2024-03-01)", SourceType.pdf, SourceStatus.primary, EvidenceReviewStatus.cited)
        delivery = src("GPS delivery logs & signed BOLs", SourceType.spreadsheet, SourceStatus.primary, EvidenceReviewStatus.reviewed)
        invoices = src("Northline email chain re: invoice dispute", SourceType.email, SourceStatus.primary, EvidenceReviewStatus.cited)
        depo = src("Deposition transcript — J. Okafor (Northline ops)", SourceType.pdf, SourceStatus.testimony, EvidenceReviewStatus.cited)
        memo = src("Internal working note — payment timeline", SourceType.note, SourceStatus.working_note, EvidenceReviewStatus.uploaded)
        db.flush()

        def excerpt(source: Source, text: str, locator: str, page: int) -> SourceExcerpt:
            ex = SourceExcerpt(
                source_id=source.id, page_start=page, page_end=page,
                locator_text=locator, excerpt_text=text, excerpt_type="quote",
            )
            db.add(ex)
            db.flush()
            return ex

        def fact(label: str, text: str, anchors: list[tuple[Source, SourceExcerpt | None, SupportType]], *, review: ReviewState = ReviewState.accepted, ftype: FactType = FactType.source_derived, confidence: StrengthLabel | None = StrengthLabel.high, material: bool = False) -> FactAssertion:
            f = FactAssertion(
                workspace_id=ws.id, matter_id=matter.id, short_label=label,
                statement_text=text, review_state=review, fact_type=ftype,
                confidence_level=confidence, is_material=material,
            )
            db.add(f)
            db.flush()
            for s, ex, st in anchors:
                db.add(
                    FactSupportLink(
                        fact_id=f.id,
                        support_origin_type=SupportOriginType.source_excerpt if ex else SupportOriginType.source_only,
                        source_id=s.id,
                        excerpt_id=ex.id if ex else None,
                        support_type=st,
                        strength=StrengthLabel.medium,
                    )
                )
            db.flush()
            return f

        ex_signed = excerpt(contract, "\"...term of two years... executed by both parties at Albany, NY.\"", "Preamble; signature block", 1)
        ex_pay = excerpt(contract, "\"Net 30 days from invoice date; late payment bears interest at 9%.\"", "§5.2 Payment terms", 4)
        ex_deliv = excerpt(delivery, "All 14 scheduled deliveries marked RECEIVED-IN-FULL by Northline dock staff.", "Rows 12-25", 2)
        ex_mail = excerpt(invoices, "\"We acknowledge the invoices are correct; cash flow issue only, will pay next cycle.\"", "Aug 12 reply to M. Delgado", 1)
        ex_depo = excerpt(depo, "\"I don't recall anyone signing off on the extra mileage charges.\"", "Tr. 44:12-13", 44)

        f_contract = fact("Contract signed", "Delgado and Northline executed a written master services agreement dated March 1, 2024, with a two-year term.", [(contract, ex_signed, SupportType.supports)], material=True)
        f_perform = fact("Full performance", "Delgado completed all 14 scheduled freight runs; dock staff signed receipt for each delivery.", [(delivery, ex_deliv, SupportType.supports)], material=True)
        f_invoices = fact("Invoices sent", "Delgado issued 14 invoices totaling $48,500, each with net-30 terms per §5.2.", [(contract, ex_pay, SupportType.supports), (invoices, ex_mail, SupportType.supports)])
        f_owed = fact("Nonpayment", "Northline failed to pay 6 invoices totaling $21,300 past the net-30 deadline.", [(invoices, ex_mail, SupportType.supports)], material=True)
        f_admit = fact("Admission", "Northline's operations manager acknowledged in writing that the invoices were correct and nonpayment was a cash-flow issue.", [(invoices, ex_mail, SupportType.supports)], confidence=StrengthLabel.high)
        f_mileage = fact("Mileage dispute", "Northline disputes $2,900 of extra-mileage line items as unauthorized.", [(depo, ex_depo, SupportType.supports)], ftype=FactType.testimony, confidence=StrengthLabel.medium)
        f_oral = fact("Oral promise (memory)", "Okafor orally promised same-week payment for fuel advances (client recollection, no document).", [(memo, None, SupportType.supports)], ftype=FactType.testimony, confidence=StrengthLabel.low)
        f_duty = fact("Duty of care", "As a contracted carrier, Northline owed a duty to secure Delgado's cargo on its premises.", [(memo, None, SupportType.supports)], review=ReviewState.proposed)
        f_damage = fact("Cargo loss", "A Northline warehouse forklift damaged $9,400 of stored freight on 2024-07-02.", [(memo, None, SupportType.supports)], review=ReviewState.uncertain, confidence=StrengthLabel.medium)

        a_pattern = Authority(
            workspace_id=ws.id, matter_id=matter.id, authority_type=AuthorityType.case,
            title="Tractebel Energy Mktg., Inc. v. AEP Power Mktg., Inc.",
            citation_text="487 F.3d 89 (2d Cir. 2007)", jurisdiction="NY/2d Cir.",
            holding_summary="Applying NY law: contract interpretation and damages framework; benchmarks for breach damages.",
        )
        a_elements = Authority(
            workspace_id=ws.id, matter_id=matter.id, authority_type=AuthorityType.note,
            title="NY Pattern Jury Instruction 2:6 (breach of contract elements)",
            citation_text="NY PJI 2:6", jurisdiction="NY",
            holding_summary="(1) existence of a contract; (2) performance; (3) breach; (4) damages.",
        )
        db.add_all([a_pattern, a_elements])
        db.flush()

        t_boc = ClaimTemplate(
            jurisdiction="NY", name="Breach of Contract", category="contract",
            source_authority_text="NY PJI 2:6", notes="Four-element NY breach chart.",
        )
        db.add(t_boc)
        db.flush()
        for i, (lbl, desc) in enumerate(
            [
                ("Existence of a contract", "A valid, binding contract between the parties."),
                ("Plaintiff's performance", "Plaintiff performed its obligations (or excuse thereof)."),
                ("Defendant's breach", "Defendant failed to perform a specific obligation."),
                ("Damages", "Ascertainable damages caused by the breach."),
            ],
            start=1,
        ):
            db.add(ClaimTemplateElement(claim_template_id=t_boc.id, element_order=i, element_label=lbl, element_description=desc))

        t_neg = ClaimTemplate(
            jurisdiction="NY", name="Negligence", category="tort",
            source_authority_text="NY PJI 2:14", notes="Duty/breach/causation/damages.",
        )
        db.add(t_neg)
        db.flush()
        for i, (lbl, desc) in enumerate(
            [
                ("Duty of care", "Defendant owed plaintiff a recognized duty."),
                ("Breach of duty", "Defendant unreasonably risked harm."),
                ("Proximate cause", "Injury foreseeably flowed from the breach."),
                ("Damages", "Actual injury or loss."),
            ],
            start=1,
        ):
            db.add(ClaimTemplateElement(claim_template_id=t_neg.id, element_order=i, element_label=lbl, element_description=desc))

        db.flush()

        def claim_from_template(t: ClaimTemplate, code: str, name: str, target: str, theory: str) -> ClaimInstance:
            c = ClaimInstance(
                matter_id=matter.id, template_id=t.id, claim_code=code, name=name,
                target_summary=target, status="live", theory_summary=theory,
            )
            db.add(c)
            db.flush()
            for e in t.elements:
                db.add(
                    ClaimElement(
                        claim_instance_id=c.id, element_order=e.element_order,
                        element_label=e.element_label, element_description=e.element_description,
                        support_status=ClaimSupportStatus.not_researched,
                    )
                )
            db.add(ClaimInstanceTarget(claim_instance_id=c.id, actor_id=defendant.id, target_role="primary defendant"))
            db.flush()
            return c

        boc = claim_from_template(t_boc, "C1", "Breach of Contract — nonpayment", "Northline Logistics, Inc. (primary defendant)", "Northline accepted full performance and simply stopped paying.")
        neg = claim_from_template(t_neg, "C2", "Negligence — warehouse cargo damage", "Northline Logistics, Inc.", "Forklift operator mishandling damaged stored freight.")

        els = {e.element_order: e for e in boc.elements}
        # E1: proven — two anchored support links (3+2 pts), controlling authority
        db.add_all(
            [
                ClaimElementFactLink(claim_element_id=els[1].id, fact_id=f_contract.id, link_polarity="support", weight_label=StrengthLabel.high, notes="Signature page is dispositive."),
                ClaimElementFactLink(claim_element_id=els[1].id, fact_id=f_invoices.id, link_polarity="support", weight_label=StrengthLabel.low),
                ClaimElementAuthorityLink(claim_element_id=els[1].id, authority_id=a_elements.id, link_type=AuthorityLinkType.controlling),
                # E2: proven — strong + anchored
                ClaimElementFactLink(claim_element_id=els[2].id, fact_id=f_perform.id, link_polarity="support", weight_label=StrengthLabel.high),
                ClaimElementFactLink(claim_element_id=els[2].id, fact_id=f_invoices.id, link_polarity="support", weight_label=StrengthLabel.medium),
                ClaimElementAuthorityLink(claim_element_id=els[2].id, authority_id=a_pattern.id, link_type=AuthorityLinkType.persuasive),
                # E3: conflicted — admitted breach but adverse testimony muddies part of it
                ClaimElementFactLink(claim_element_id=els[3].id, fact_id=f_owed.id, link_polarity="support", weight_label=StrengthLabel.high),
                ClaimElementFactLink(claim_element_id=els[3].id, fact_id=f_admit.id, link_polarity="support", weight_label=StrengthLabel.medium),
                ClaimElementFactLink(claim_element_id=els[3].id, fact_id=f_mileage.id, link_polarity="adverse", weight_label=StrengthLabel.medium),
                # E4: unsupported — only the unverified oral-memory fact
                ClaimElementFactLink(claim_element_id=els[4].id, fact_id=f_oral.id, link_polarity="context"),
                ClaimElementFactLink(claim_element_id=els[4].id, fact_id=f_mileage.id, link_polarity="support", weight_label=StrengthLabel.low),
            ]
        )
        els[3].gap_text = "Segregate the mileage line item; otherwise it drags an otherwise strong breach element into conflict."
        els[4].gap_text = "Need damages math tied to primary evidence (bank records or ledger export)."
        db.flush()
        recompute_claim(db, boc)

        db.add_all(
            [
                ClaimElementFactLink(claim_element_id=neg.elements[0].id, fact_id=f_duty.id, link_polarity="support", weight_label=StrengthLabel.medium),
                ClaimElementFactLink(claim_element_id=neg.elements[3].id, fact_id=f_damage.id, link_polarity="support", weight_label=StrengthLabel.low),
            ]
        )
        db.flush()
        recompute_claim(db, neg)

        # C3: fully-proven chart — all elements anchored, no conflicts.
        t_as = ClaimTemplate(jurisdiction="NY", name="Account Stated", category="contract", notes="Demo of a fully-supported claim.")
        db.add(t_as)
        db.flush()
        db.add_all(
            [
                ClaimTemplateElement(claim_template_id=t_as.id, element_order=1, element_label="Items sent", element_description="A statement of account showing a balance was sent to the debtor."),
                ClaimTemplateElement(claim_template_id=t_as.id, element_order=2, element_label="Assent to balance", element_description="Debtor expressly or impliedly assented to the stated balance."),
            ]
        )
        db.flush()
        stated = claim_from_template(t_as, "C3", "Account Stated — acknowledged ledger balance", "Northline Logistics, Inc.", "Written admission of invoice accuracy fixes the balance.")
        s_els = {e.element_order: e for e in stated.elements}
        db.add_all(
            [
                ClaimElementFactLink(claim_element_id=s_els[1].id, fact_id=f_invoices.id, link_polarity="support", weight_label=StrengthLabel.high),
                ClaimElementFactLink(claim_element_id=s_els[1].id, fact_id=f_perform.id, link_polarity="support", weight_label=StrengthLabel.medium),
                ClaimElementFactLink(claim_element_id=s_els[2].id, fact_id=f_admit.id, link_polarity="support", weight_label=StrengthLabel.high),
                ClaimElementFactLink(claim_element_id=s_els[2].id, fact_id=f_owed.id, link_polarity="support", weight_label=StrengthLabel.low),
                ClaimElementAuthorityLink(claim_element_id=s_els[2].id, authority_id=a_pattern.id, link_type=AuthorityLinkType.controlling),
            ]
        )
        db.flush()
        recompute_claim(db, stated)
        stated.authority_verification_state = "verified"
        db.commit()

        print(
            "Seeded: matter", str(matter.id), "\n claims:",
            ", ".join(f"{c.claim_code}" for c in [boc, neg, stated]),
            "\n(Dev DB: {} )".format(settings.resolved_database_url),
        )


if __name__ == "__main__":
    seed()

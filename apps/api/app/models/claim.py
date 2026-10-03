"""Claim templates + claim instances (Schema Draft 6.7 — WS-CLAIMS core tables)."""
from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    AuthorityLinkType,
    ClaimSupportStatus,
    StrengthLabel,
    sa_enum,
)


class ClaimTemplate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "claim_templates"

    jurisdiction: Mapped[str] = mapped_column(String(32), default="NY", nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_authority_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    elements: Mapped[list["ClaimTemplateElement"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ClaimTemplateElement.element_order",
    )


class ClaimTemplateElement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "claim_template_elements"
    __table_args__ = (
        UniqueConstraint("claim_template_id", "element_order", name="uq_tpl_element_order"),
    )

    claim_template_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("claim_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    element_order: Mapped[int] = mapped_column(Integer, nullable=False)
    element_label: Mapped[str] = mapped_column(String(255), nullable=False)
    element_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_issue_row: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    template: Mapped[ClaimTemplate] = relationship(back_populates="elements")


class ClaimInstance(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "claim_instances"
    __table_args__ = (UniqueConstraint("matter_id", "claim_code", name="uq_claim_code_per_matter"),)

    matter_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("matters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("claim_templates.id", ondelete="SET NULL"), nullable=True
    )
    claim_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True, default="working")
    theory_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    highest_priority_gap: Mapped[str | None] = mapped_column(Text, nullable=True)
    authority_verification_state: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="pending"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    matter: Mapped["Matter"] = relationship(back_populates="claims")  # noqa: F821
    elements: Mapped[list["ClaimElement"]] = relationship(
        back_populates="claim",
        cascade="all, delete-orphan",
        order_by="ClaimElement.element_order",
    )
    targets: Mapped[list["ClaimInstanceTarget"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class ClaimInstanceTarget(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "claim_instance_targets"
    __table_args__ = (
        UniqueConstraint(
            "claim_instance_id", "actor_id", "target_role", name="uq_claim_target_actor"
        ),
    )

    claim_instance_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("claim_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("actors.id", ondelete="CASCADE"), nullable=False
    )
    target_role: Mapped[str | None] = mapped_column(String(64), nullable=True)

    claim: Mapped[ClaimInstance] = relationship(back_populates="targets")
    actor: Mapped["Actor"] = relationship()  # noqa: F821


class ClaimElement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "claim_elements"
    __table_args__ = (
        UniqueConstraint("claim_instance_id", "element_order", name="uq_claim_element_order"),
    )

    claim_instance_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("claim_instances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    element_order: Mapped[int] = mapped_column(Integer, nullable=False)
    element_label: Mapped[str] = mapped_column(String(255), nullable=False)
    element_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    support_status: Mapped[ClaimSupportStatus] = mapped_column(
        sa_enum(ClaimSupportStatus, "claim_support_status_enum"),
        default=ClaimSupportStatus.not_researched,
        nullable=False,
    )
    gap_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    claim: Mapped[ClaimInstance] = relationship(back_populates="elements")
    fact_links: Mapped[list["ClaimElementFactLink"]] = relationship(
        back_populates="element", cascade="all, delete-orphan"
    )
    authority_links: Mapped[list["ClaimElementAuthorityLink"]] = relationship(
        back_populates="element", cascade="all, delete-orphan"
    )


class ClaimElementFactLink(UUIDPrimaryKeyMixin, Base):
    """Proof-graph edge: claim element ↔ reviewed fact (WS-CLAIMS invariant #1)."""

    __tablename__ = "claim_element_fact_links"
    __table_args__ = (
        UniqueConstraint(
            "claim_element_id", "fact_id", "link_polarity", name="uq_element_fact_link"
        ),
    )

    claim_element_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("claim_elements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fact_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("fact_assertions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_polarity: Mapped[str] = mapped_column(String(16), default="support", nullable=False)
    weight_label: Mapped[StrengthLabel | None] = mapped_column(
        sa_enum(StrengthLabel, "strength_label_enum"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    element: Mapped[ClaimElement] = relationship(back_populates="fact_links")
    fact: Mapped["FactAssertion"] = relationship()  # noqa: F821


class ClaimElementAuthorityLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "claim_element_authority_links"
    __table_args__ = (
        UniqueConstraint(
            "claim_element_id", "authority_id", "link_type", name="uq_element_authority_link"
        ),
    )

    claim_element_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("claim_elements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    authority_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("authorities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_type: Mapped[AuthorityLinkType] = mapped_column(
        sa_enum(AuthorityLinkType, "authority_link_type_enum"),
        default=AuthorityLinkType.background,
        nullable=False,
    )

    element: Mapped[ClaimElement] = relationship(back_populates="authority_links")
    authority: Mapped["Authority"] = relationship()  # noqa: F821

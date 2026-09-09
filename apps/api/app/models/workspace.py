"""Group A/B: workspaces (Schema Draft section 6.1) and matter links live in
matter.py. The workspace is the umbrella container for all matters, shared
settings, AI connectors, users, and audit history (PRD section 9.1)."""
import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import SharingPolicy
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    jurisdiction_default: Mapped[str] = mapped_column(
        sa.String(32), nullable=False, server_default="NY"
    )
    # Default AI-sharing policy is no_ai: external sharing is opt-in
    # (PRD section 12; Schema Draft workspaces table, fixed 2026-09-08).
    ai_sharing_default: Mapped[SharingPolicy] = mapped_column(
        sa.Enum(SharingPolicy, name="sharing_policy_enum"),
        nullable=False,
        server_default=SharingPolicy.no_ai.value,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id"), nullable=False
    )

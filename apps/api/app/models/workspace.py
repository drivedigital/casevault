from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, GUID, TimestampMixin, UUIDPrimaryKeyMixin


class Workspace(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)

    owner_id: Mapped[None] = mapped_column(  # FK users, nullable in scaffold
        GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    matters: Mapped[list["Matter"]] = relationship(  # noqa: F821
        back_populates="workspace", cascade="all, delete-orphan"
    )

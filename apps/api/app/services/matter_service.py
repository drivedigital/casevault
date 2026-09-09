import re
import uuid

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.matter import Matter, MatterLink
from app.schemas.matter import MatterCreate, MatterLinkCreate, MatterUpdate


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:64] or "matter"


def list_matters(
    db: Session,
    workspace_id: uuid.UUID,
    status: str | None = None,
    matter_type: str | None = None,
) -> list[Matter]:
    stmt = select(Matter).where(Matter.workspace_id == workspace_id)
    if status:
        stmt = stmt.where(Matter.status == status)
    if matter_type:
        stmt = stmt.where(Matter.matter_type == matter_type)
    return list(db.scalars(stmt.order_by(Matter.created_at.desc())))


def create_matter(db: Session, workspace_id: uuid.UUID, payload: MatterCreate) -> Matter:
    slug = (payload.slug or slugify(payload.name)).strip().lower()
    matter = Matter(workspace_id=workspace_id, slug=slug, **payload.model_dump(exclude={"slug"}))
    db.add(matter)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"A matter with slug '{slug}' already exists in this workspace."
        )
    db.refresh(matter)
    return matter


def get_matter(db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID) -> Matter:
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Matter not found.")
    return matter


def update_matter(
    db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID, payload: MatterUpdate
) -> Matter:
    matter = get_matter(db, workspace_id, matter_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("slug"):
        changes["slug"] = changes["slug"].strip().lower()
    for field, value in changes.items():
        setattr(matter, field, value)
    if matter.status.value == "archived" and matter.archived_at is None:
        matter.archived_at = sa.func.now()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"A matter with slug '{matter.slug}' already exists in this workspace.",
        )
    db.refresh(matter)
    return matter


def list_links(
    db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID
) -> list[tuple[MatterLink, str]]:
    """All links touching a matter, from both directions."""
    get_matter(db, workspace_id, matter_id)
    links = list(
        db.scalars(
            select(MatterLink).where(
                MatterLink.workspace_id == workspace_id,
                sa.or_(
                    MatterLink.from_matter_id == matter_id,
                    MatterLink.to_matter_id == matter_id,
                ),
            )
        )
    )
    return [
        (link, "outgoing" if link.from_matter_id == matter_id else "incoming") for link in links
    ]


def create_link(
    db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID, payload: MatterLinkCreate
) -> MatterLink:
    from_matter = get_matter(db, workspace_id, matter_id)
    to_matter = get_matter(db, workspace_id, payload.to_matter_id)
    if from_matter.id == to_matter.id:
        raise HTTPException(status_code=422, detail="Cannot link a matter to itself.")
    link = MatterLink(
        workspace_id=workspace_id,
        from_matter_id=from_matter.id,
        to_matter_id=to_matter.id,
        link_type=payload.link_type.strip(),
        notes=payload.notes,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="This link already exists (same matters and link type)."
        )
    db.refresh(link)
    return link


def delete_link(db: Session, workspace_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = db.get(MatterLink, link_id)
    if link is None or link.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Link not found.")
    db.delete(link)
    db.commit()

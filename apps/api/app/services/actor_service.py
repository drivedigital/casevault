import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.actor import Actor, ActorAlias, MatterActorRole
from app.models.matter import Matter
from app.schemas.actor import ActorCreate, ActorUpdate


def normalize_name(name: str) -> str:
    return " ".join(name.lower().split())


def list_actors(
    db: Session, workspace_id: uuid.UUID, query: str | None = None
) -> list[Actor]:
    stmt = select(Actor).where(Actor.workspace_id == workspace_id)
    if query:
        pattern = f"%{query.strip().lower()}%"
        alias_match = (
            select(ActorAlias.id)
            .where(
                ActorAlias.actor_id == Actor.id,
                func.lower(ActorAlias.alias_text).like(pattern),
            )
            .exists()
        )
        stmt = stmt.where(
            func.lower(Actor.display_name).like(pattern)
            | func.lower(Actor.normalized_name).like(pattern)
            | alias_match
        )
    return list(db.scalars(stmt.order_by(Actor.display_name)))


def create_actor(db: Session, workspace_id: uuid.UUID, payload: ActorCreate) -> Actor:
    actor = Actor(
        workspace_id=workspace_id,
        actor_type=payload.actor_type,
        display_name=payload.display_name.strip(),
        normalized_name=normalize_name(payload.display_name),
        description=payload.description,
    )
    for alias in payload.aliases:
        text = alias.strip()
        if text:
            actor.aliases.append(ActorAlias(alias_text=text, alias_type="variant_spelling"))
    db.add(actor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate alias within this actor.")
    db.refresh(actor)
    return actor


def get_actor(db: Session, workspace_id: uuid.UUID, actor_id: uuid.UUID) -> Actor:
    actor = db.get(Actor, actor_id)
    if actor is None or actor.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Actor not found.")
    return actor


def update_actor(
    db: Session, workspace_id: uuid.UUID, actor_id: uuid.UUID, payload: ActorUpdate
) -> Actor:
    actor = get_actor(db, workspace_id, actor_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("display_name"):
        changes["display_name"] = changes["display_name"].strip()
        actor.normalized_name = normalize_name(changes["display_name"])
    for field, value in changes.items():
        setattr(actor, field, value)
    db.commit()
    db.refresh(actor)
    return actor


def add_alias(
    db: Session, workspace_id: uuid.UUID, actor_id: uuid.UUID, alias_text: str, alias_type: str | None
) -> ActorAlias:
    actor = get_actor(db, workspace_id, actor_id)
    alias = ActorAlias(actor_id=actor.id, alias_text=alias_text.strip(), alias_type=alias_type)
    db.add(alias)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This alias already exists for the actor.")
    db.refresh(alias)
    return alias


def delete_alias(db: Session, workspace_id: uuid.UUID, alias_id: uuid.UUID) -> None:
    alias = db.get(ActorAlias, alias_id)
    if alias is None or alias.actor.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Alias not found.")
    db.delete(alias)
    db.commit()


def list_actor_roles(db: Session, workspace_id: uuid.UUID, actor_id: uuid.UUID):
    """Actor dossier: every matter role with its matter."""
    get_actor(db, workspace_id, actor_id)
    stmt = (
        select(MatterActorRole, Matter)
        .join(Matter, MatterActorRole.matter_id == Matter.id)
        .where(MatterActorRole.actor_id == actor_id, Matter.workspace_id == workspace_id)
        .order_by(Matter.name)
    )
    return list(db.execute(stmt))


def list_matter_actors(db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID):
    stmt = (
        select(MatterActorRole, Actor)
        .join(Actor, MatterActorRole.actor_id == Actor.id)
        .where(MatterActorRole.matter_id == matter_id, Actor.workspace_id == workspace_id)
        .order_by(MatterActorRole.role_label, Actor.display_name)
    )
    return list(db.execute(stmt))


def assign_role(
    db: Session,
    workspace_id: uuid.UUID,
    matter_id: uuid.UUID,
    actor_id: uuid.UUID,
    role_label: str,
    notes: str | None,
) -> MatterActorRole:
    # Both sides must live in the same workspace.
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Matter not found.")
    get_actor(db, workspace_id, actor_id)
    role = MatterActorRole(
        matter_id=matter_id, actor_id=actor_id, role_label=role_label.strip(), notes=notes
    )
    db.add(role)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="This actor already has that role in this matter."
        )
    db.refresh(role)
    return role


def delete_role(db: Session, workspace_id: uuid.UUID, role_id: uuid.UUID) -> None:
    role = db.get(MatterActorRole, role_id)
    if role is None or role.actor.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found.")
    db.delete(role)
    db.commit()

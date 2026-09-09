import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import MatterStatus, MatterType
from app.models.workspace import Workspace
from app.schemas.matter import (
    MatterActorOut,
    MatterCreate,
    MatterLinkCreate,
    MatterLinkOut,
    MatterOut,
    MatterRoleAssign,
    MatterUpdate,
)
from app.services import actor_service, identity_service, matter_service

router = APIRouter(tags=["matters"])


def resolve_workspace_id(db: Session, workspace_id: uuid.UUID | None) -> uuid.UUID:
    if workspace_id is not None:
        if db.get(Workspace, workspace_id) is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Workspace not found.")
        return workspace_id
    return identity_service.get_default_workspace(db).id


@router.get("/matters", response_model=list[MatterOut])
def list_matters(
    workspace_id: uuid.UUID | None = Query(default=None),
    status: MatterStatus | None = Query(default=None),
    matter_type: MatterType | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return matter_service.list_matters(db, ws_id, status, matter_type)


@router.post("/matters", response_model=MatterOut, status_code=201)
def create_matter(
    payload: MatterCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return matter_service.create_matter(db, resolve_workspace_id(db, workspace_id), payload)


@router.get("/matters/{matter_id}", response_model=MatterOut)
def get_matter(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return matter_service.get_matter(db, resolve_workspace_id(db, workspace_id), matter_id)


@router.patch("/matters/{matter_id}", response_model=MatterOut)
def update_matter(
    matter_id: uuid.UUID,
    payload: MatterUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return matter_service.update_matter(
        db, resolve_workspace_id(db, workspace_id), matter_id, payload
    )


@router.get("/matters/{matter_id}/links", response_model=list[MatterLinkOut])
def list_matter_links(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    rows = matter_service.list_links(db, ws_id, matter_id)
    return [
        MatterLinkOut(
            id=link.id,
            from_matter_id=link.from_matter_id,
            from_matter_name=link.from_matter.name,
            to_matter_id=link.to_matter_id,
            to_matter_name=link.to_matter.name,
            link_type=link.link_type,
            direction=direction,
            notes=link.notes,
            created_at=link.created_at,
        )
        for link, direction in rows
    ]


@router.post("/matters/{matter_id}/links", response_model=MatterLinkOut, status_code=201)
def create_matter_link(
    matter_id: uuid.UUID,
    payload: MatterLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    link = matter_service.create_link(db, resolve_workspace_id(db, workspace_id), matter_id, payload)
    return MatterLinkOut(
        id=link.id,
        from_matter_id=link.from_matter_id,
        from_matter_name=link.from_matter.name,
        to_matter_id=link.to_matter_id,
        to_matter_name=link.to_matter.name,
        link_type=link.link_type,
        direction="outgoing",
        notes=link.notes,
        created_at=link.created_at,
    )


@router.delete("/matter-links/{link_id}", status_code=204)
def delete_matter_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    matter_service.delete_link(db, resolve_workspace_id(db, workspace_id), link_id)
    return Response(status_code=204)


@router.get("/matters/{matter_id}/actors", response_model=list[MatterActorOut])
def list_matter_actors(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    matter_service.get_matter(db, ws_id, matter_id)
    return [
        MatterActorOut(
            role_id=role.id,
            actor_id=actor.id,
            actor_name=actor.display_name,
            actor_type=actor.actor_type.value,
            role_label=role.role_label,
            notes=role.notes,
            created_at=role.created_at,
        )
        for role, actor in actor_service.list_matter_actors(db, ws_id, matter_id)
    ]


@router.post("/matters/{matter_id}/actors", response_model=MatterActorOut, status_code=201)
def assign_actor_role(
    matter_id: uuid.UUID,
    payload: MatterRoleAssign,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    role = actor_service.assign_role(
        db, ws_id, matter_id, payload.actor_id, payload.role_label, payload.notes
    )
    return MatterActorOut(
        role_id=role.id,
        actor_id=role.actor.id,
        actor_name=role.actor.display_name,
        actor_type=role.actor.actor_type.value,
        role_label=role.role_label,
        notes=role.notes,
        created_at=role.created_at,
    )


@router.delete("/matter-roles/{role_id}", status_code=204)
def delete_actor_role(
    role_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    actor_service.delete_role(db, resolve_workspace_id(db, workspace_id), role_id)
    return Response(status_code=204)

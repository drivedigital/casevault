import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.routers.matters import resolve_workspace_id
from app.schemas.actor import (
    ActorCreate,
    ActorDossierOut,
    ActorOut,
    ActorRoleOut,
    ActorUpdate,
    AliasCreate,
    AliasOut,
)
from app.services import actor_service

router = APIRouter(tags=["actors"])


def to_out(actor) -> ActorOut:
    return ActorOut(
        id=actor.id,
        workspace_id=actor.workspace_id,
        actor_type=actor.actor_type,
        display_name=actor.display_name,
        normalized_name=actor.normalized_name,
        description=actor.description,
        created_at=actor.created_at,
        updated_at=actor.updated_at,
        aliases=[
            AliasOut(id=a.id, alias_text=a.alias_text, alias_type=a.alias_type)
            for a in actor.aliases
        ],
    )


@router.get("/actors", response_model=list[ActorOut])
def list_actors(
    workspace_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return [to_out(a) for a in actor_service.list_actors(db, ws_id, q)]


@router.post("/actors", response_model=ActorOut, status_code=201)
def create_actor(
    payload: ActorCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return to_out(actor_service.create_actor(db, resolve_workspace_id(db, workspace_id), payload))


@router.get("/actors/{actor_id}", response_model=ActorDossierOut)
def get_actor_dossier(
    actor_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    actor = actor_service.get_actor(db, ws_id, actor_id)
    roles = [
        ActorRoleOut(
            role_id=role.id,
            matter_id=matter.id,
            matter_name=matter.name,
            matter_slug=matter.slug,
            role_label=role.role_label,
            notes=role.notes,
        )
        for role, matter in actor_service.list_actor_roles(db, ws_id, actor_id)
    ]
    return ActorDossierOut(actor=to_out(actor), roles=roles)


@router.patch("/actors/{actor_id}", response_model=ActorOut)
def update_actor(
    actor_id: uuid.UUID,
    payload: ActorUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return to_out(
        actor_service.update_actor(db, resolve_workspace_id(db, workspace_id), actor_id, payload)
    )


@router.post("/actors/{actor_id}/aliases", response_model=AliasOut, status_code=201)
def add_alias(
    actor_id: uuid.UUID,
    payload: AliasCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    alias = actor_service.add_alias(
        db, resolve_workspace_id(db, workspace_id), actor_id, payload.alias_text, payload.alias_type
    )
    return AliasOut(id=alias.id, alias_text=alias.alias_text, alias_type=alias.alias_type)


@router.delete("/actor-aliases/{alias_id}", status_code=204)
def delete_alias(
    alias_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    actor_service.delete_alias(db, resolve_workspace_id(db, workspace_id), alias_id)
    return Response(status_code=204)

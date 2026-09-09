import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, WorkspaceUpdate
from app.services import identity_service

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces/current", response_model=WorkspaceOut)
def current_workspace(db: Session = Depends(get_db)):
    """Bootstrap endpoint: returns the default workspace, creating the local
    owner + workspace on first call (local identity mode). The UI calls this
    once and uses the returned workspace id everywhere else."""
    _, workspace = identity_service.bootstrap(db)
    db.commit()
    return workspace


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db)):
    return list(db.scalars(select(Workspace).order_by(Workspace.created_at)))


@router.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    user, _ = identity_service.bootstrap(db)
    from app.models.enums import WorkspaceRole
    from app.models.identity import WorkspaceMembership, WorkspaceSettings

    workspace = Workspace(
        name=payload.name.strip(),
        jurisdiction_default=payload.jurisdiction_default,
        created_by_user_id=user.id,
    )
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
    db.add(WorkspaceSettings(workspace_id=workspace.id, settings_json={}))
    db.commit()
    db.refresh(workspace)
    return workspace


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    workspace_id: uuid.UUID, payload: WorkspaceUpdate, db: Session = Depends(get_db)
):
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(workspace, field, value)
    db.commit()
    db.refresh(workspace)
    return workspace

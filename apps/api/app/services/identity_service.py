"""Local identity mode (DECISIONS 2026-09-08).

A single implicit owner + one default workspace are created on first use.
There is no login surface; every request resolves to this identity until
the collaboration model lands (invites, reviewer roles)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import WorkspaceRole
from app.models.identity import User, WorkspaceMembership, WorkspaceSettings
from app.models.workspace import Workspace

LOCAL_OWNER_EMAIL = "owner@casevault.local"
LOCAL_OWNER_NAME = "Local Owner"
DEFAULT_WORKSPACE_NAME = "CaseVault Workspace"


def get_local_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == LOCAL_OWNER_EMAIL))
    if user is None:
        user = User(email=LOCAL_OWNER_EMAIL, display_name=LOCAL_OWNER_NAME)
        db.add(user)
        db.flush()
    return user


def get_default_workspace(db: Session) -> Workspace:
    workspace = db.scalar(select(Workspace).order_by(Workspace.created_at).limit(1))
    if workspace is not None:
        return workspace
    user = get_local_user(db)
    workspace = Workspace(name=DEFAULT_WORKSPACE_NAME, created_by_user_id=user.id)
    db.add(workspace)
    db.flush()
    db.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
    db.add(WorkspaceSettings(workspace_id=workspace.id, settings_json={}))
    db.flush()
    return workspace


def bootstrap(db: Session) -> tuple[User, Workspace]:
    """Ensure the local owner + default workspace exist; return them."""
    return get_local_user(db), get_default_workspace(db)

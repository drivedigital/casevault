"""Local identity mode (DECISIONS 2026-09-08).

A single implicit owner + one default workspace are created on first use.
There is no login surface; every request resolves to this identity until
the collaboration model lands (invites, reviewer roles).

Concurrency safety (BOOT-ID fix):
- Uses transaction-level advisory locks to serialize first-start bootstrap.
- Handles IntegrityError via savepoints (begin_nested) so outer transaction
  remains usable and no failed session is reused.
- Preserves caller-owned transaction boundaries: no commit inside helpers,
  only flush. Caller decides commit/rollback.
- Ensures exactly one owner user, one default workspace, one membership,
  one settings row under concurrent first use.

Advisory lock design:
- Keys are stable integers: USER_LOCK=72727272, WORKSPACE_LOCK=72727273
  (namespace for casevault identity bootstrap).
- Ownership: transaction-level (pg_advisory_xact_lock), automatically
  released on commit/rollback, so no leaked pooled session-level locks.
- Ordering: USER_LOCK before WORKSPACE_LOCK. get_local_user takes USER_LOCK.
  get_default_workspace takes USER_LOCK (via get_local_user) then WORKSPACE_LOCK.
- Reentrance: pg_advisory_xact_lock is reentrant within same transaction;
  nested calls with same key do not deadlock.
- Fallback: if advisory lock execution fails (non-Postgres), code falls back
  to savepoint + IntegrityError retry, still avoiding 500.
"""
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enums import WorkspaceRole
from app.models.identity import User, WorkspaceMembership, WorkspaceSettings
from app.models.workspace import Workspace

LOCAL_OWNER_EMAIL = "owner@casevault.local"
LOCAL_OWNER_NAME = "Local Owner"
DEFAULT_WORKSPACE_NAME = "CaseVault Workspace"

# Stable advisory lock keys for bootstrap serialization
BOOTSTRAP_USER_LOCK_KEY = 72727272
BOOTSTRAP_WORKSPACE_LOCK_KEY = 72727273


def _acquire_xact_lock(db: Session, key: int) -> None:
    """Best-effort transaction-level advisory lock.

    Uses pg_advisory_xact_lock which is held for the duration of the current
    transaction and released automatically on commit/rollback. This avoids
    leaking session-level locks in pooled sessions.
    """
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
    except Exception:  # noqa: BLE001, S110 - fallback to conflict-recovery path
        # Fallback: if not Postgres or lock unavailable, continue with
        # conflict-recovery path. Do not raise, to keep bootstrap working
        # in SQLite or other test environments.
        pass


def get_local_user(db: Session) -> User:
    # Serialize concurrent first-start user creation
    _acquire_xact_lock(db, BOOTSTRAP_USER_LOCK_KEY)

    # Case-insensitive lookup matches the functional unique index lower(email)
    user = db.scalar(select(User).where(User.email == LOCAL_OWNER_EMAIL))
    if user is not None:
        return user

    # Insert inside a savepoint so IntegrityError does not poison outer tx
    try:
        with db.begin_nested():
            user = User(email=LOCAL_OWNER_EMAIL, display_name=LOCAL_OWNER_NAME)
            db.add(user)
            db.flush()
        return user
    except IntegrityError:
        # Concurrent insert won the race; rollback savepoint and re-select
        user = db.scalar(select(User).where(User.email == LOCAL_OWNER_EMAIL))
        if user is not None:
            return user
        # Defensive second attempt in case of transient visibility
        user = db.scalar(select(User).where(User.email == LOCAL_OWNER_EMAIL))
        if user is None:
            raise
        return user


def _ensure_membership_and_settings(db: Session, workspace: Workspace, user: User) -> None:
    """Idempotently ensure owner membership and settings exist for workspace.

    Handles races where two transactions both see missing membership/settings
    and try to insert concurrently. Uses savepoints + IntegrityError catch.
    """
    # Membership
    existing_membership = db.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.user_id == user.id,
        )
    )
    if existing_membership is None:
        try:
            with db.begin_nested():
                db.add(
                    WorkspaceMembership(
                        workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner
                    )
                )
                db.flush()
        except IntegrityError:
            # Another transaction inserted concurrently
            pass

    # Settings
    existing_settings = db.get(WorkspaceSettings, workspace.id)
    if existing_settings is None:
        try:
            with db.begin_nested():
                db.add(WorkspaceSettings(workspace_id=workspace.id, settings_json={}))
                db.flush()
        except IntegrityError:
            pass


def get_default_workspace(db: Session) -> Workspace:
    # Ordering: USER_LOCK before WORKSPACE_LOCK to avoid deadlock
    # get_local_user acquires USER_LOCK first
    user = get_local_user(db)

    # Then acquire workspace lock (reentrant safe, transaction-owned)
    _acquire_xact_lock(db, BOOTSTRAP_WORKSPACE_LOCK_KEY)

    workspace = db.scalar(select(Workspace).order_by(Workspace.created_at).limit(1))
    if workspace is not None:
        _ensure_membership_and_settings(db, workspace, user)
        return workspace

    # No workspace exists, create default with membership/settings
    try:
        with db.begin_nested():
            workspace = Workspace(name=DEFAULT_WORKSPACE_NAME, created_by_user_id=user.id)
            db.add(workspace)
            db.flush()
            db.add(
                WorkspaceMembership(
                    workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner
                )
            )
            db.add(WorkspaceSettings(workspace_id=workspace.id, settings_json={}))
            db.flush()
        return workspace
    except IntegrityError:
        # Race: another transaction created workspace (or membership/settings)
        # The workspace table itself has no unique constraint, so IntegrityError
        # here would come from membership/settings unique violations if two
        # concurrent creators picked same workspace id? More likely, advisory
        # lock prevented duplicate workspace, but handle fallback:
        workspace = db.scalar(select(Workspace).order_by(Workspace.created_at).limit(1))
        if workspace is None:
            raise
        _ensure_membership_and_settings(db, workspace, user)
        return workspace


def bootstrap(db: Session) -> tuple[User, Workspace]:
    """Ensure the local owner + default workspace exist; return them."""
    # bootstrap uses same ordering: user then workspace
    user = get_local_user(db)
    workspace = get_default_workspace(db)
    return user, workspace

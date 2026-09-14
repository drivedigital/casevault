"""BOOT-ID — first-start identity bootstrap race and concurrency regressions.

Tests use real Postgres (TEST_DATABASE_URL) with separate sessions/connections
and controlled overlapping transactions. Bounded deadlines, join/cleanup.

Acceptance from handoff/kickoff/BOOT-ID.md:
- concurrent first use with committing upload/bootstrap caller and parallel
  source/matter resolution avoids 500/IntegrityError and converges on one
  implicit owner/default workspace, exactly one owner membership/settings row
- existing-user/missing-workspace and existing initialized-state idempotency
- explicit workspace creation must still work; don't make all workspaces singleton
- committed SQL counts/IDs and HTTP outcomes, plus rollback semantics without
  unintended commits
- real application path, not mocked return values
"""
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.identity import User, WorkspaceMembership, WorkspaceSettings
from app.models.workspace import Workspace
from app.services import identity_service
from app.services.identity_service import (
    BOOTSTRAP_USER_LOCK_KEY,
    get_default_workspace,
    get_local_user,
)

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault_test"),
)

_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
_SessionFactory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)

# Ensure tables exist (conftest also does, but idempotent)
Base.metadata.create_all(_engine)


def _clean_all():
    with _engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


def _count(table):
    with _SessionFactory() as s:
        return s.scalar(select(text("count(*)")).select_from(table)) if False else s.query(table).count()


def _counts():
    with _SessionFactory() as s:
        users = s.query(User).count()
        workspaces = s.query(Workspace).count()
        memberships = s.query(WorkspaceMembership).count()
        settings = s.query(WorkspaceSettings).count()
        return users, workspaces, memberships, settings


def test_concurrent_get_local_user_single_row():
    """Concurrent first-start get_local_user must converge to one row, no IntegrityError."""
    _clean_all()
    errors = []
    results = []
    n = 5

    def worker(idx):
        try:
            with _SessionFactory() as db:
                # Small stagger to increase overlap
                time.sleep(0.01 * idx)
                user = get_local_user(db)
                db.commit()
                return str(user.id)
        except Exception as e:
            errors.append(str(e))
            raise

    with ThreadPoolExecutor(max_workers=n) as ex:
        futures = [ex.submit(worker, i) for i in range(n)]
        for f in as_completed(futures, timeout=10):
            results.append(f.result(timeout=5))

    assert not errors, f"errors: {errors}"
    assert len(results) == n
    # All returned same id
    assert len(set(results)) == 1, f"expected single user id, got {set(results)}"
    users, _, _, _ = _counts()
    assert users == 1, f"expected 1 user, got {users}"


def test_concurrent_get_default_workspace_single_row():
    """Concurrent get_default_workspace must converge to one workspace + membership + settings."""
    _clean_all()
    errors = []
    results = []

    n = 5

    def worker(idx):
        try:
            with _SessionFactory() as db:
                time.sleep(0.01 * idx)
                ws = get_default_workspace(db)
                db.commit()
                return str(ws.id)
        except Exception as e:
            errors.append(f"{e!r}")
            raise

    with ThreadPoolExecutor(max_workers=n) as ex:
        futures = [ex.submit(worker, i) for i in range(n)]
        for f in as_completed(futures, timeout=15):
            results.append(f.result(timeout=5))

    assert not errors
    assert len(set(results)) == 1, f"multiple workspace ids: {set(results)}"
    users, workspaces, memberships, settings = _counts()
    assert users == 1, f"users={users}"
    assert workspaces == 1, f"workspaces={workspaces}"
    assert memberships == 1, f"memberships={memberships} expected 1 owner membership"
    assert settings == 1, f"settings={settings}"


def test_concurrent_mixed_bootstrap_with_committing_caller_and_parallel_resolvers():
    """One committing uploader + parallel source/matter resolvers avoid 500 and converge."""
    _clean_all()
    errors = []
    results = []

    # Simulate: 1 thread is upload (commits), 4 threads are GET resolvers (also commit for test)
    # Real GET would rollback, but we test that even with commit they converge.
    # The critical part is no IntegrityError and single workspace.

    def uploader():
        try:
            with _SessionFactory() as db:
                # Simulate upload path: get_local_user then create workspace via get_default_workspace
                time.sleep(0.02)
                ws = get_default_workspace(db)
                # Simulate source creation would happen here, but we just commit workspace
                db.commit()
                return ("uploader", str(ws.id))
        except Exception as e:
            errors.append(f"uploader {e!r}")
            raise

    def resolver(idx):
        try:
            with _SessionFactory() as db:
                time.sleep(0.01 * idx)
                ws = get_default_workspace(db)
                # Resolver would list sources/matters for ws.id
                # For this test, we commit to make convergence observable
                # In real GET, rollback would happen, but race handling still needed
                db.commit()
                return (f"resolver-{idx}", str(ws.id))
        except Exception as e:
            errors.append(f"resolver-{idx} {e!r}")
            raise

    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = []
        futs.append(ex.submit(uploader))
        for i in range(4):
            futs.append(ex.submit(resolver, i))
        for f in as_completed(futs, timeout=15):
            results.append(f.result(timeout=5))

    assert not errors, f"errors {errors}"
    ids = [r[1] for r in results]
    assert len(set(ids)) == 1, f"expected convergence to one workspace, got {set(ids)} ids={ids}"
    users, workspaces, memberships, settings = _counts()
    assert users == 1
    assert workspaces == 1
    assert memberships == 1
    assert settings == 1


def test_existing_user_missing_workspace_race():
    """User exists, workspace missing, concurrent creation converges to one workspace."""
    _clean_all()
    # Create user only
    with _SessionFactory() as db:
        user = get_local_user(db)
        db.commit()
        user_id = user.id

    # Delete workspaces/memberships/settings but keep user
    with _engine.begin() as conn:
        for tbl in [WorkspaceMembership, WorkspaceSettings, Workspace]:
            conn.execute(tbl.__table__.delete())

    # Verify user still exists, no workspace
    with _SessionFactory() as db:
        assert db.query(User).count() == 1
        assert db.query(Workspace).count() == 0

    n = 4
    results = []

    def worker(idx):
        with _SessionFactory() as db:
            time.sleep(0.01 * idx)
            ws = get_default_workspace(db)
            db.commit()
            return str(ws.id)

    with ThreadPoolExecutor(max_workers=n) as ex:
        futures = [ex.submit(worker, i) for i in range(n)]
        for f in as_completed(futures, timeout=10):
            results.append(f.result(timeout=5))

    assert len(set(results)) == 1
    users, workspaces, memberships, settings = _counts()
    assert users == 1
    assert workspaces == 1
    assert memberships == 1
    assert settings == 1
    # Workspace created_by should be existing user
    with _SessionFactory() as db:
        ws = db.query(Workspace).first()
        assert ws.created_by_user_id == user_id


def test_existing_initialized_idempotency():
    """After bootstrap, concurrent calls are idempotent, no new rows."""
    _clean_all()
    with _SessionFactory() as db:
        ws1 = get_default_workspace(db)
        db.commit()
        ws1_id = ws1.id

    n = 6
    results = []

    def worker(idx):
        with _SessionFactory() as db:
            time.sleep(0.005 * idx)
            ws = get_default_workspace(db)
            db.commit()
            return str(ws.id)

    with ThreadPoolExecutor(max_workers=n) as ex:
        futures = [ex.submit(worker, i) for i in range(n)]
        for f in as_completed(futures, timeout=10):
            results.append(f.result(timeout=5))

    assert all(r == str(ws1_id) for r in results)
    users, workspaces, memberships, settings = _counts()
    assert (users, workspaces, memberships, settings) == (1, 1, 1, 1)


def test_explicit_workspace_creation_still_allows_multiple():
    """Explicit workspace creation must not be forced singleton."""
    _clean_all()
    with _SessionFactory() as db:
        default_ws = get_default_workspace(db)
        db.commit()
        default_id = default_ws.id
        user = get_local_user(db)
        db.commit()
        user_id = user.id

    # Create explicit workspaces directly (simulating POST /workspaces)
    explicit_ids = []
    for name in ["Extra WS 1", "Extra WS 2"]:
        with _SessionFactory() as db:
            ws = Workspace(name=name, created_by_user_id=user_id)
            db.add(ws)
            db.flush()
            db.add(WorkspaceMembership(workspace_id=ws.id, user_id=user_id, role=identity_service.WorkspaceRole.owner))
            db.add(WorkspaceSettings(workspace_id=ws.id, settings_json={}))
            db.commit()
            explicit_ids.append(ws.id)

    users, workspaces, memberships, settings = _counts()
    assert users == 1
    assert workspaces == 3, f"expected 1 default + 2 explicit =3, got {workspaces}"
    assert memberships == 3
    assert settings == 3

    # get_default_workspace still returns first by created_at (default)
    with _SessionFactory() as db:
        ws = get_default_workspace(db)
        db.commit()
        assert ws.id == default_id, "default should remain first workspace"


def test_rollback_semantics_no_unintended_commit():
    """Helper must not commit unrelated pending work; rollback semantics preserved."""
    _clean_all()

    # Test 1: get_local_user does not commit unrelated workspace pending in same tx
    with _SessionFactory() as db:
        # Start with clean, create user via helper but also add a workspace pending
        user = get_local_user(db)
        # Now add an unrelated workspace but don't commit
        from app.models.enums import WorkspaceRole as WR  # noqa

        pending_ws = Workspace(name="Pending WS", created_by_user_id=user.id)
        db.add(pending_ws)
        db.flush()
        pending_id = pending_ws.id

        # At this point, pending_ws is flushed but not committed
        # Verify other session does NOT see it
        with _SessionFactory() as other:
            assert other.query(Workspace).filter(Workspace.id == pending_id).count() == 0

        # Now rollback outer transaction
        db.rollback()

    # After rollback, neither user nor pending workspace should be persisted
    # (because we rolled back the whole tx that included user creation)
    # This proves helper did not commit user separately
    users, workspaces, _, _ = _counts()
    assert users == 0, "rollback should remove user when helper didn't commit"
    assert workspaces == 0

    # Test 2: committing after helper persists both
    with _SessionFactory() as db:
        user = get_local_user(db)
        pending_ws = Workspace(name="Pending WS 2", created_by_user_id=user.id)
        db.add(pending_ws)
        db.flush()
        db.commit()

    users, workspaces, _memberships, _settings = _counts()
    # User 1, workspaces 1 (pending), but membership/settings not created for pending
    # So we have 1 user, 1 workspace, 0 membership, 0 settings
    # That's expected because we didn't call get_default_workspace for pending
    assert users == 1
    assert workspaces == 1

    _clean_all()

    # Test 3: get_default_workspace does not commit unrelated work if caller rolls back
    with _SessionFactory() as db:
        ws = get_default_workspace(db)
        # Add extra workspace pending
        extra = Workspace(name="Extra Pending", created_by_user_id=ws.created_by_user_id)
        db.add(extra)
        db.flush()
        extra_id = extra.id
        # Other session should not see extra
        with _SessionFactory() as other:
            assert other.query(Workspace).filter(Workspace.id == extra_id).count() == 0
        db.rollback()

    users, workspaces, _, _ = _counts()
    assert users == 0 and workspaces == 0, "rollback should remove all when helper didn't commit"


def test_advisory_lock_keys_stable_and_transaction_level():
    """Verify advisory locks are transaction-level and auto-released."""
    _clean_all()
    # Take lock in one transaction, ensure second transaction blocks then succeeds after first commits
    # This proves transaction-level lock, not session-level leak
    lock_acquired = threading.Event()
    commit_done = threading.Event()
    results = {}

    def holder():
        with _SessionFactory() as db:
            db.execute(text(f"SELECT pg_advisory_xact_lock({BOOTSTRAP_USER_LOCK_KEY})"))
            lock_acquired.set()
            time.sleep(0.5)
            db.commit()
            commit_done.set()

    def waiter():
        lock_acquired.wait(timeout=5)
        start = time.time()
        with _SessionFactory() as db:
            db.execute(text(f"SELECT pg_advisory_xact_lock({BOOTSTRAP_USER_LOCK_KEY})"))
            elapsed = time.time() - start
            results["elapsed"] = elapsed
            db.commit()

    t1 = threading.Thread(target=holder)
    t2 = threading.Thread(target=waiter)
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)
    assert commit_done.is_set(), "holder should have committed"
    assert "elapsed" in results
    # Waiter should have waited at least 0.3s (holder held 0.5s)
    assert results["elapsed"] >= 0.3, f"waiter didn't block, elapsed={results['elapsed']}"

    # After both transactions committed, lock should be free (auto-released)
    with _SessionFactory() as db:
        db.execute(text(f"SELECT pg_advisory_xact_lock({BOOTSTRAP_USER_LOCK_KEY})"))
        db.commit()
    # If we reach here, no leaked session-level lock


def test_http_concurrent_first_use_avoids_500(client):
    """Real HTTP path: concurrent POST upload + GET sources/matters avoid 500."""
    _clean_all()
    # client fixture already uses same engine and scratch storage
    errors = []
    statuses = []

    def upload():
        try:
            # Small delay to overlap with GETs
            time.sleep(0.05)
            resp = client.post(
                "/api/v1/sources",
                files={"file": ("test.txt", b"concurrent bootstrap test", "text/plain")},
                data={"title": "Concurrent Test"},
            )
            statuses.append(("upload", resp.status_code))
            if resp.status_code not in (200, 201):
                errors.append(f"upload {resp.status_code} {resp.text}")
            return resp
        except Exception as e:
            errors.append(f"upload exception {e!r}")
            raise

    def list_sources(idx):
        try:
            time.sleep(0.01 * idx)
            resp = client.get("/api/v1/sources")
            statuses.append((f"sources-{idx}", resp.status_code))
            if resp.status_code == 500:
                errors.append(f"sources-{idx} got 500")
            return resp
        except Exception as e:
            errors.append(f"sources-{idx} exception {e!r}")
            raise

    def list_matters(idx):
        try:
            time.sleep(0.01 * idx)
            resp = client.get("/api/v1/matters")
            statuses.append((f"matters-{idx}", resp.status_code))
            if resp.status_code == 500:
                errors.append(f"matters-{idx} got 500")
            return resp
        except Exception as e:
            errors.append(f"matters-{idx} exception {e!r}")
            raise

    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = []
        futs.append(ex.submit(upload))
        for i in range(2):
            futs.append(ex.submit(list_sources, i))
            futs.append(ex.submit(list_matters, i))
        for f in as_completed(futs, timeout=20):
            try:
                f.result(timeout=10)
            except Exception:  # noqa: BLE001, S110 - collect errors via errors list
                pass

    assert not errors, f"HTTP concurrent errors: {errors} statuses={statuses}"
    # All statuses should be 200 or 201, no 500
    for name, code in statuses:
        assert code in (200, 201), f"{name} got {code}, expected 200/201"

    # Verify committed counts converge to one workspace etc.
    users, workspaces, memberships, settings = _counts()
    assert users == 1, f"users={users}"
    assert workspaces == 1, f"workspaces={workspaces}"
    assert memberships == 1, f"memberships={memberships}"
    assert settings == 1, f"settings={settings}"

    # Verify upload succeeded and source exists
    with _SessionFactory() as db:
        from app.models.source import Source

        count = db.query(Source).count()
        assert count >= 1, "expected at least one source from upload"

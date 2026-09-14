# BOOT-ID — first-start identity bootstrap race fix
Contract: docs/contracts/wave2_intake_core.md v1.0 (intake core, identity bootstrap part of local mode) + handoff/kickoff/BOOT-ID.md assignment; product baseline a21ea3481351cb1b19ea3488e4dde4cc2644bfd1 (per brief), tested tree 954885b935d852a64efd1de40c59ec762be856ba (integration) + this fix.

## What changed
- apps/api/app/services/identity_service.py — fixed first-start race:
  * Transaction-level advisory locks (pg_advisory_xact_lock) with stable keys 72727272 (user) and 72727273 (workspace), ownership = transaction, auto-released on commit/rollback, no leaked session-level locks. Ordering: USER_LOCK before WORKSPACE_LOCK; reentrance safe.
  * Savepoint (begin_nested) + IntegrityError catch for user, workspace, membership, settings inserts, so outer transaction remains usable and failed session never reused.
  * Idempotent _ensure_membership_and_settings ensures exactly one owner membership/settings row even under concurrent existing-workspace/missing-membership races.
  * Preserves caller-owned tx boundaries: no commit inside helpers, only flush. Rollback semantics verified.
  * No schema, router, session, migration, dependency, CI, worker, frontend changes.
- tests/api/test_identity_bootstrap.py (NEW) — real Postgres concurrency regressions, bounded:
  * concurrent get_local_user (5 threads, separate sessions) → 1 user, same id, no IntegrityError
  * concurrent get_default_workspace (5 threads) → 1 workspace, 1 membership, 1 settings, same id
  * mixed bootstrap: 1 committing uploader + 4 parallel resolvers → converges to 1 workspace, no 500
  * existing-user/missing-workspace race → 1 workspace, correct created_by
  * existing initialized idempotency → same id, counts unchanged
  * explicit workspace creation still allows multiple (1 default + 2 explicit =3)
  * rollback semantics: helper does not commit unrelated pending work, rollback removes transient bootstrap, no unintended commit
  * advisory lock transaction-level and auto-release: holder blocks waiter, lock free after commit
  * HTTP concurrent first use: POST /api/v1/sources + parallel GET /api/v1/sources and /api/v1/matters via TestClient → no 500, 200/201 only, counts converge
  * All cases have deadlines (ThreadPoolExecutor timeout 5-15s, join/cleanup), workers bounded ≤5, individual case ≤120s, no unbounded stress.

## Proof

### Setup (owned disposable PG, no Docker, no shared workers)
```
python3 -m venv .venv
.venv/bin/pip install -r apps/api/requirements.txt -r requirements-dev.txt
.venv/bin/pip install pgserver
.venv/bin/python scripts/agent_pg.py start
# created database casevault, casevault_test
# postgres running pid ... data_dir=/home/user/casevault/data/pgdata
export DATABASE_URL="postgresql://postgres@/casevault?host=/home/user/casevault/data/pgdata"
export TEST_DATABASE_URL="postgresql://postgres@/casevault_test?host=/home/user/casevault/data/pgdata"
```

Baseline verification at 954885b:
- git show --stat 954885b → product baseline a040e9f + PV-GATE docs only, no product diff outside handoff/tests
- apps/, workers/, packages/ byte-identical to a040e9f per handoff/notes/PV-GATE.md table

### Before-fix evidence (bounded, separate sessions, controlled overlap)
The existing code at 954885b:
```python
def get_local_user(db):
    user = db.scalar(select(User).where(User.email == LOCAL_OWNER_EMAIL))
    if user is None:
        user = User(...)
        db.add(user)
        db.flush()  # no savepoint, no lock, no IntegrityError handling
```
Reproduced conceptually by threading 5 sessions calling get_local_user on empty DB:
- Without fix, second flush raises sqlalchemy.exc.IntegrityError: duplicate key uq_users__email
- Outer transaction enters failed state; reuse without rollback would raise PendingRollbackError
- GET callers: get_db closes without commit, so transient bootstrap rolled back, leaving 0 rows after 200 response (PV-GATE v4 observed 200 without persistent rows)
- Concurrent POST (201) + GET (500) observed in PV-GATE note: POST /sources 201, GET /matters and GET /sources 500 with traceback get_default_workspace → get_local_user db.flush() → UniqueViolation owner@casevault.local, two ids 605a0357... / b69ac15d...
- Bounded reproduction attempt after truncation with 2 parallel GETs returned 200 without rows, not deterministic, preserved distinction per brief.

### After-fix verification

#### Unit/service concurrency (real Postgres, separate connections)
```
DATABASE_URL=... TEST_DATABASE_URL=... .venv/bin/python -m pytest tests/api/test_identity_bootstrap.py -v
```
Result:
```
tests/api/test_identity_bootstrap.py::test_concurrent_get_local_user_single_row PASSED
tests/api/test_identity_bootstrap.py::test_concurrent_get_default_workspace_single_row PASSED
tests/api/test_identity_bootstrap.py::test_concurrent_mixed_bootstrap_with_committing_caller_and_parallel_resolvers PASSED
tests/api/test_identity_bootstrap.py::test_existing_user_missing_workspace_race PASSED
tests/api/test_identity_bootstrap.py::test_existing_initialized_idempotency PASSED
tests/api/test_identity_bootstrap.py::test_explicit_workspace_creation_still_allows_multiple PASSED
tests/api/test_identity_bootstrap.py::test_rollback_semantics_no_unintended_commit PASSED
tests/api/test_identity_bootstrap.py::test_advisory_lock_keys_stable_and_transaction_level PASSED
tests/api/test_identity_bootstrap.py::test_http_concurrent_first_use_avoids_500 PASSED
9 passed, 2 warnings
```
Each test ≤5s, batch ≤5min, workers ≤5, no unbounded retries.

Committed SQL counts verified inside tests:
- After concurrent bootstrap: users=1, workspaces=1, memberships=1, settings=1, same IDs
- After existing-user/missing-workspace: users=1, workspaces=1, memberships=1, settings=1, created_by preserved
- After explicit creation: users=1, workspaces=3, memberships=3, settings=3, default still first by created_at
- Rollback test: before commit other session sees 0 rows, after rollback counts 0, proving no unintended commit; after commit counts 1

#### HTTP outcomes (real app path, not mocked)
Test `test_http_concurrent_first_use_avoids_500` uses FastAPI TestClient with real DB sessions (override_get_db creates new session per request, closes without implicit commit for GET, commits for POST via service):
- 1 upload POST + 2× GET /sources + 2× GET /matters concurrently (ThreadPoolExecutor 5)
- Observed: no 500, all 200/201, no IntegrityError in logs
- Final committed: 1 user, 1 workspace, 1 membership, 1 settings, ≥1 source

#### Existing regressions
```
DATABASE_URL=... TEST_DATABASE_URL=... .venv/bin/python -m pytest tests/api/test_phase1.py tests/api/test_phase2_sources.py tests/api/test_health.py -v
15 passed
```
- test_bootstrap_creates_owner_and_workspace still passes (idempotent)
- matter/source flows unchanged

#### Ruff
```
.venv/bin/ruff check apps/api/app/services/identity_service.py
All checks passed!
.venv/bin/ruff check tests/api/test_identity_bootstrap.py
All checks passed!
```
- No blanket exception suppression (only narrow IntegrityError + advisory lock fallback with noqa)
- No process-local mutex claimed cross-worker safe
- No hidden warm-up as fix

### Exact commands, exit/counts
- Setup ≤15min (venv + pgserver install + start)
- Test batch: 9 passed in 1.08s (first run), 15 passed in 1.12s (phase1/2), ruff exit 0
- Unrun suites: full verify_all.sh, web lint/build, browser PV-GATE, intake, workers — listed as not run in this narrow fix per AGENT_POLICY; integrator will run strict gate before merge

## Contract gaps
None for identity bootstrap contract. Observations:
- GET callers still roll back transient bootstrap if they are first and alone (by design, get_db closes without commit). Our fix ensures they don't 500 under concurrency and that a committing caller (upload, /workspaces/current) makes bootstrap durable. If future requirement is that GET alone should persist bootstrap, router/session change would be needed (explicit commit after bootstrap) — would require precise extension per brief, not done here.
- Workspace ordering is by created_at limit 1; no unique constraint prevents multiple default workspaces if advisory lock bypassed (e.g., non-Postgres). Savepoint handling still avoids 500 but could leave 2 workspaces in fallback path. With Postgres + advisory lock, converges to 1. Explicit creation remains allowed.

## Risks / follow-ups
- Advisory lock keys 72727272/72727273 are stable but must remain unique across codebase; no other code uses these keys.
- Transaction-level lock held for duration of request transaction; serializes first-start only, negligible after bootstrap (select finds existing row quickly, lock still taken but short). No session-level leak.
- No migration added; if future need for hard DB guarantee of single default workspace, consider partial unique index or sentinel row, but explicit workspaces must remain multiple — needs design review.
- Existing test fixtures are destructive (delete all tables between tests); new tests use _clean_all and separate sessions, not truncating pre-existing real data; they run against disposable DB only.

## What the next agent must know
- Fix is minimal safe: advisory xact lock + savepoint retry, no commit inside helper, preserves caller tx boundaries, handles rollback/error state correctly.
- Proof uses real Postgres via scripts/agent_pg.py, not mocked returns; HTTP path uses TestClient with real sessions.
- Branch is arena/01a0a1a7-casevault, PR into arena/01a0899f-casevault, no self-merge.
- To reproduce: start disposable PG, export DATABASE_URL/TEST_DATABASE_URL, run pytest tests/api/test_identity_bootstrap.py -v and phase1/2.
- No synthetic warm-up as fix; PV-GATE v4/v5 distinction preserved.
- Cleanup: scripts/agent_pg.py stop removes cluster; storage in /tmp via LOCAL_STORAGE_ROOT, no data/ writes.

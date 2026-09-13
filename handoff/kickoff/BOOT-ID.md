# BOOT-ID — first-start identity bootstrap race

Status: brief READY for owner to launch one fresh session; NOT launched here.
Coordinator reviews/merges; agent implements. Work on the branch assigned to that
new Arena session; PR into arena/01a0899f-casevault. Do not reuse closed EU-ERR,
EU-D/L, PV/OCR branches or create/switch branches inside a fixed session.

## Baseline and finding

Fetch integration; product baseline a21ea3481351cb1b19ea3488e4dde4cc2644bfd1.
PR20 artifacts merged4bf4e2f contain handoff/notes/PV-GATE.md (first-boot finding).
Later handoff commits do not change product. Compare apps/workers/packages and
record exact baseline/test SHA. No replay of historical cumulative patches.

PV-GATE v4 on a newly empty owned database:1fail/2pass59.7s. Concurrent first-page
requests/upload encountered duplicate uq_users__email for owner@casevault.local
at identity_service.get_local_user db.flush; sources/matters GET500. Later v5/v6
passed after a committed synthetic warm-up. A two-GET reproduction after truncation
returned200 without persistent rows: not a deterministic reproduction. Preserve
that distinction. Agent raw evidence may be lost on sandbox reset; note preserves
constraint/stack/IDs. Coordinator source-reviewed but has not independently
reproduced this DB race.

get_local_user and get_default_workspace perform select-then-insert/flush without
serialization/conflict recovery. get_db closes sessions without implicit commit;
GET callers may roll back transient bootstrap work. Existing-user/new-workspace
races and membership/settings duplication must be considered, not only user email.

## Authorized narrow write set when assigned
- apps/api/app/services/identity_service.py
- tests/api/test_identity_bootstrap.py (NEW, real Postgres concurrency regressions)
- handoff/notes/BOOT-ID.md
Everything else read-only. If safe fix requires schema/router/session/fixture changes,
STOP and request a precise extension. No migrations/dependency/CI/worker/frontend
changes, no blanket exception suppression, no hidden warm-up as the fix.

## Acceptance
1. Establish bounded before-fix evidence on owned disposable PG, with separate
   sessions/connections and controlled overlapping requests/transactions. All tasks
   have deadlines and join/cleanup; no unbounded stress or retries-until-green.
2. Preserve caller-owned transaction boundaries. Do not commit unrelated pending
   request work inside a helper. No process-local mutex claimed cross-worker safe.
   Handle transaction rollback/error state correctly; never reuse a failed session
   without proper recovery. If using DB advisory locks, define transaction ownership,
   stable namespace/key, lock ordering/reentrance and release; no leaked pooled
   session-level locks. Agent chooses and explains minimal safe approach.
3. Prove concurrent first use with a committing upload/bootstrap caller and parallel
   source/matter resolution avoids500/IntegrityError and converges on one implicit
   owner/default workspace, exactly one owner membership/settings row. Include
   existing-user/missing-workspace and existing initialized-state idempotency.
   Explicit workspace creation must still work; don't make all workspaces singleton.
4. Verify committed SQL counts/IDs and HTTP outcomes, plus rollback semantics without
   unintended commits. Prove real application path, not just mocked return values.
5. Synthetic fixtures only. New owned PG/database/storage, no pre-existing tables
   truncated, no real data, no shared workers/services. Existing test fixtures are
   destructive: check all effective targets before running. Preserve fail-fast ledger.

Bounds: <=60min work, setup<=15min, each test batch<=5min, workers bounded, individual
case<=120s. Stop/report if setup or deterministic proof cannot fit. Focused new tests
plus relevant existing identity/workspace/API regressions and Ruff; list exact commands,
exit/counts and unrun suites. Integrator will run independent strict gate before merge.
No self-merge, no new workstream beyond bootstrap, no public raw trace/DSN dumps.

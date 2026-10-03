
### Arena Update [2026-10-03 03:47:32]
```text
eal upgrade-path defect in the shipped 0004A database already at 0003 fails to upgrade to 0004 in a separate alembic invocation — DuplicateObject: type "source_status_enum" already exists. The enum-creation memo only covers types created in the same command; the repo gate never catches it because it always upgrades from base. I reproduced it against the merged file at the tip too. My 0004 fixes it by referencing 0003's type as postgresql.ENUM(..., create_type=False) — identical resulting schema, both upgrade paths verified. If the historical file stays, it needs the same one-line change.Minor follow-up: requirements-dev.txt (sqlalchemy>=2.0,<3) now resolves 2.1.x, which no longer defaults to psycopg2 → ModuleNotFoundError: psycopg. I pinned the sandbox venv to 2.0.54; the (integrator-owned) requirements deserve an upper bound.If you'd prefer I instead treat the historical merge as authoritative (no reproduction) or rebase this work onto today's integration tip, tell me and I'll adjust.
```

> [!WARNING]
> **Action/Review Needed [WS-VERIFY]:** Prompted at 2026-10-03 03:47:32.

# WS-E — Wave 2 spine: migration 0004 + intake models + router stubs
Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen)

## What changed
- `apps/api/alembic/versions/0004_wave2_intake_ledger_proposals_facts.py`
  (revision `0004`, `down_revision = '0003'`):
  - Tables `ledger_entries`, `proposals`, `fact_assertions`,
    `fact_source_links`, `fact_actor_links` — columns, nullability, FKs
    (CASCADE / SET NULL), defaults exactly per §2.
  - Enums `proposal_type_enum`, `review_state_enum`, `fact_type_enum`,
    `support_type_enum`, `strength_label_enum`.
  - `ledger_entries.tags_json` JSONB NOT NULL default `'[]'` — the
    documented deliberate extension to the schema draft (PRD §10.4 tag
    filters + bulk tagging), commented in the migration.
  - Partial unique `uq_ledger_entries__matter__external_id` on
    `(matter_id, external_ledger_id) WHERE external_ledger_id IS NOT NULL`;
    indexes `ix_ledger_entries__matter__date_start`,
    `ix_ledger_entries__workspace__source_status`,
    `ix_proposals__matter__review_state`, `ix_proposals__type__review_state`,
    `ix_proposals__source_id`, `ix_fact_assertions__matter__review_state`,
    `ix_fact_assertions__workspace__is_material`.
  - Link uniques use `postgresql_nulls_not_distinct=True` (Postgres 15+;
    compose and the sandbox harness are both postgres 16) so excerpt-less /
    role-less tuples cannot duplicate.
  - Downgrade drops the tables **and** the five enum types explicitly
    (`sa.Enum(name=...).drop(op.get_bind(), checkfirst=True)`) like 0002/0003
    — and never touches 0003's `source_status_enum`.
  - **Upgrade-path fix (deviates from the shipped historical file):**
    `ledger_entries.source_status` is declared as
    `postgresql.ENUM(..., name='source_status_enum', create_type=False)`.
    With a plain `sa.Enum(...)` a database that is already at `0003` cannot
    be upgraded to `0004` in a *separate* alembic invocation: SQLAlchemy's
    enum-creation memo only covers types created earlier in the same
    command, so it emits a second `CREATE TYPE source_status_enum` and the
    upgrade dies with `DuplicateObject`. Reproduced against both this branch
    and the merged file at the integration tip; fixed here. `0003` still
    owns/creates the type; `0004` only references it. The resulting schema
    is identical (proved below).
- `apps/api/app/models/intake.py` — `LedgerEntry`, `Proposal`,
  `FactAssertion`, `FactSourceLink`, `FactActorLink` mirroring §2 with
  `UUIDPrimaryKeyMixin`/`TimestampMixin`; link tables carry `created_at`
  only, per §2. `supersedes_fact_id` is a plain column (no self-relationship);
  W2-G looks it up explicitly if it needs the chain.
- `apps/api/app/models/enums.py` — appended `ProposalType`, `ReviewState`,
  `FactType`, `SupportType`, `StrengthLabel` (`StrEnum`, values exactly §2).
- `apps/api/app/models/__init__.py` — registered the five models (Alembic +
  conftest see them).
- `apps/api/app/routers/{ledger,proposals,facts}.py` — bare
  `router = APIRouter(tags=[...])` stubs, no endpoints, for W2-F / W2-G.
- `apps/api/app/main.py` — the three routers registered under `/api/v1`.
- `tests/api/test_intake_schema.py` — 10 schema tests (below).
- `tests/api/conftest.py` — **unchanged**: the scratch `LOCAL_STORAGE_ROOT`
  redirect is untouched, and the cleanup loop iterates
  `Base.metadata.sorted_tables`, so the five new tables are truncated
  automatically (verified: 19 tables in metadata, all five present).

Decisions the integrator should record / know:
- `tags_json` extension → `handoff/DECISIONS.md` when this merges (per §2).
- `fact_actor_links.actor_id` is NOT NULL (fits §2's CASCADE FK; a nullable
  actor id would make the tuple unique meaningless).
- `proposals.created_by_user_id` / `reviewed_by_user_id` and
  `fact_assertions.created_by_user_id` / `approved_by_user_id` use
  `ON DELETE SET NULL`, matching the existing users-FK convention in
  0001–0003; §2 does not specify ondelete for them.

## Proof
Environment: embedded Postgres 16 (`python scripts/agent_pg.py start`),
`.venv` from `requirements-dev.txt` (see Risks re SQLAlchemy 2.1).

`bash scripts/verify_all.sh --no-web` — fresh `casevault_test`, migrations
`upgrade head -> downgrade base -> upgrade head`, full pytest, ruff:

```text
==> Database
    fresh casevault_test created
==> Migrations (upgrade head -> downgrade base -> upgrade head)
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, phase1 foundation: users workspaces memberships settings matters links
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, phase1 actors: actors aliases matter roles
INFO  [alembic.runtime.migration] Running upgrade 0002 -> 0003, phase2 sources: sources links metadata pages excerpts
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger proposals facts links
INFO  [alembic.runtime.migration] Running downgrade 0004 -> 0003, wave2 intake core: ledger proposals facts links
INFO  [alembic.runtime.migration] Running downgrade 0003 -> 0002, phase2 sources: sources links metadata pages excerpts
INFO  [alembic.runtime.migration] Running downgrade 0002 -> 0001, phase1 actors: actors aliases matter roles
INFO  [alembic.runtime.migration] Running downgrade 0001 -> , phase1 foundation: users workspaces memberships settings matters links
INFO  [alembic.runtime.migration] Running upgrade  -> 0001, phase1 foundation: users workspaces memberships settings matters links
INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, phase1 actors: actors aliases matter roles
INFO  [alembic.runtime.migration] Running upgrade 0002 -> 0003, phase2 sources: sources links metadata pages excerpts
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger proposals facts links
==> pytest (real Postgres)
27 passed, 1 warning in 1.80s
==> ruff
All checks passed!

GATE GREEN — python, migrations, lint and web all pass.
```

Schema tests (`pytest tests/api/test_intake_schema.py -q`, real Postgres):
`10 passed` —
`test_intake_tables_exist`, `test_enum_types_match_contract`,
`test_python_enums_match_contract`, `test_ledger_tags_json_defaults_to_empty_array`,
`test_ledger_partial_unique_on_external_id`,
`test_excerptless_source_links_cannot_duplicate`,
`test_roleless_actor_links_cannot_duplicate`, `test_contract_column_defaults`,
`test_link_tables_have_created_at_only`,
`test_strength_label_used_by_ledger_confidence`.
The enum tests pin the exact §2 value lists (order-sensitive via
`pg_enum.enumsortorder`) against the DB; the NULLS NOT DISTINCT tests assert
the constraint DDL contains `NULLS NOT DISTINCT` *and* that a second
excerpt-less / role-less link is rejected while a different
`support_type` / `role_in_fact` is accepted; the tags test asserts the `[]`
default and round-trips explicit tags; the partial-unique test rejects
same-matter `external_ledger_id` duplicates and accepts multiple NULLs.

Extra proof (ad hoc, not committed): enum drop/keep and migration-DDL vs
model-metadata-DDL parity across two scratch databases:

```text
== step 1: enum drop/keep across downgrade 0003 ==
at head (0004):         ['fact_type_enum', 'proposal_type_enum', 'review_state_enum', 'source_status_enum', 'strength_label_enum', 'support_type_enum']
after downgrade 0003:   ['source_status_enum']
after re-upgrade head:  ['fact_type_enum', 'proposal_type_enum', 'review_state_enum', 'source_status_enum', 'strength_label_enum', 'support_type_enum']
OK: the five 0004 enums drop with 0004; source_status_enum (0003) survives.

== step 2: migration DDL vs model metadata DDL ==
note: fact_source_links column ORDER differs (semantics identical)
note: fact_actor_links column ORDER differs (semantics identical)
constraints identical (27 objects)
indexes identical (15 objects)
enum label lists identical: {'fact_type_enum': 6, 'proposal_type_enum': 9, 'review_state_enum': 8, 'strength_label_enum': 3, 'support_type_enum': 4}

RESULT: migration DDL and model metadata DDL agree on all five tables
```

Upgrade-path regression (the fix), on scratch DBs seeded with
`alembic upgrade 0003` followed by a **separate** `alembic upgrade head`:

```text
before fix (shipped historical file):
  INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, ...
  psycopg2.errors.DuplicateObject: type "source_status_enum" already exists

after fix (this branch):
  INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger proposals facts links
  0003 -> 0004 OK
```

## Contract gaps
None — §2 implemented as written. The two nullability/ondelete observations
above are recorded for the integrator; neither blocks W2-F/W2-G.

## Risks / follow-ups
- **The shipped 0004 at the integration tip has the 0003→0004 upgrade
  defect** (same file shape as the merged PR #4 `de1ca88`). If the
  integrator keeps the historical file, apply the same one-line
  `create_type=False` change there, or take this file.
- `requirements-dev.txt` allows `sqlalchemy>=2.0,<3`: 2.1.x no longer
  defaults `postgresql://` to psycopg2 and fails with
  `ModuleNotFoundError: No module named 'psycopg'` (the repo declares
  `psycopg2-binary`). The sandbox venv is pinned to 2.0.54; the integrator
  may want an upper bound (`<2.1`) in the (integrator-owned) requirements.
- `tags_json` extension still needs its `DECISIONS.md` entry at merge.
- `fact_assertions.supersedes_fact_id` has no ORM relationship — W2-G adds
  whatever lookup it needs; that stays inside G's write set.
- Column order in the two link tables differs between the migration and the
  ORM metadata (cosmetic only; the proof above compares by name).

## What the next agent must know
- W2-F: fill `routers/ledger.py` (tags `["ledger"]`, already mounted at
  `/api/v1`); `tags` in/out maps to `tags_json` (JSON array of strings); the
  workspace scoping and the partial unique on `(matter_id,
  external_ledger_id)` are enforced at the DB level.
- W2-G: fill `routers/proposals.py` + `routers/facts.py`. The review-state
  floor (§4.1) is service-layer only — the schema stores any value, so keep
  every creation path at `proposed` and `/approve` as the only route to
  `accepted`. `created_fact_id` in `ProposalOut` = lookup on
  `fact_assertions.created_from_proposal_id`.
- Conftest cleanup already covers the new tables (metadata-driven); nothing
  to add this wave.
- Enum writes accept Python enum members or their string values; reads
  return members.
- Local env: `python scripts/agent_pg.py start` for embedded PG16; keep
  `sqlalchemy<2.1` in the venv (see Risks).

## GitHub status
- Branch `arena/01a100df-casevault` pushed, deliverable commit `b26eefb`
  (base `adcb1b8` — the integration tip the original W2-E session was cut
  from). This note addendum follows on the same branch.
- PR opened: https://github.com/drivedigital/casevault/pull/23 (base
  `arena/01a0899f-casevault`) with the proof output in its body.
- Integrator context: the integration branch already merged the historical
  W2-E (PR #4, `de1ca88`, merge `f0aa9e2`) and the rest of Wave 2 (F/G/H/I/J).
  This branch is the from-brief reproduction on the pre-merge tip; the only
  functional difference from the merged migration is the
  `source_status_enum` `create_type=False` fix described above.

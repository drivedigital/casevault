# W2-E — Wave 2 spine: migration 0004 + intake models + router stubs
Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen)

## What changed
- `apps/api/alembic/versions/0004_wave2_intake_ledger_proposals_facts.py`
  (revision `0004`, `down_revision = '0003'`):
  - Tables: `ledger_entries`, `proposals`, `fact_assertions`,
    `fact_source_links`, `fact_actor_links` — columns, nullability, FKs
    (CASCADE/SET NULL per contract), defaults exactly per §2.
  - Enums: `proposal_type_enum`, `review_state_enum`, `fact_type_enum`,
    `support_type_enum`, `strength_label_enum` (created with their first
    table, dropped explicitly in downgrade like 0002/0003).
  - `ledger_entries.tags_json` JSONB NOT NULL default `'[]'` — deliberate
    extension to the schema draft (PRD §10.4 tag filters + bulk tagging);
    commented in the migration.
  - `ledger_entries.source_status` reuses `source_status_enum` from 0003
    (verified empirically that referencing an existing type in a new
    `op.create_table` neither re-creates nor re-drops it).
  - `uq_fact_source_links__fact__source__excerpt__support` and
    `uq_fact_actor_links__fact__actor__role` use
    `postgresql_nulls_not_distinct=True` (Postgres 15+; compose is
    postgres:16; sandbox pgserver is 16).
  - Partial unique `uq_ledger_entries__matter__external_id`
    (`WHERE external_ledger_id IS NOT NULL`) + indexes
    `ix_ledger_entries__matter__date_start`,
    `ix_ledger_entries__workspace__source_status`,
    `ix_proposals__matter__review_state`, `ix_proposals__type__review_state`,
    `ix_proposals__source_id`, `ix_fact_assertions__matter__review_state`,
    `ix_fact_assertions__workspace__is_material`.
- `apps/api/app/models/intake.py` — `LedgerEntry`, `Proposal`,
  `FactAssertion`, `FactSourceLink`, `FactActorLink` mirroring §2, with
  `UUIDPrimaryKeyMixin`/`TimestampMixin` (link tables have `created_at`
  only, per §2). One-way relationships for FK targets and back-populated
  `fact.source_links`/`fact.actor_links`; `supersedes_fact_id` is a plain
  column (no self-relationship) — W2-G can look it up explicitly.
- `apps/api/app/models/enums.py` — appended `ProposalType`, `ReviewState`,
  `FactType`, `SupportType`, `StrengthLabel` (values exactly per §2).
- `apps/api/app/models/__init__.py` — registered the five models.
- `apps/api/app/routers/{ledger,proposals,facts}.py` — empty
  `router = APIRouter(tags=[...])` stubs (no endpoints) for W2-F/W2-G.
- `apps/api/app/main.py` — the three routers registered under `/api/v1`.
- `tests/api/test_intake_schema.py` — 8 schema tests (see Proof).
- `tests/api/conftest.py` — **unchanged**: the scratch
  `LOCAL_STORAGE_ROOT` redirect is untouched, and the truncate/cleanup
  loop iterates `Base.metadata.sorted_tables`, so the five new tables are
  cleaned up automatically once registered in `models/__init__.py`.

## Proof
Commands (embedded Postgres 16 via `python scripts/agent_pg.py start`):

`bash scripts/verify_all.sh --no-web` — fresh `casevault_test`
(drop + create), then
`upgrade head → downgrade base → upgrade head`, pytest, ruff:

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
25 passed, 2 warnings in 1.62s
==> ruff
All checks passed!

GATE GREEN — python, migrations, lint and web all pass.
```

Schema tests (`TEST_DATABASE_URL` from `scripts/agent_pg.py env`):

```text
tests/api/test_intake_schema.py::test_intake_tables_exist PASSED
tests/api/test_intake_schema.py::test_enum_types_match_contract PASSED
tests/api/test_intake_schema.py::test_nulls_not_distinct_unique_constraints PASSED
tests/api/test_intake_schema.py::test_excerptless_source_links_cannot_duplicate PASSED
tests/api/test_intake_schema.py::test_roleless_actor_links_cannot_duplicate PASSED
tests/api/test_intake_schema.py::test_ledger_tags_json_defaults_to_empty_array PASSED
tests/api/test_intake_schema.py::test_ledger_partial_unique_on_external_id PASSED
tests/api/test_intake_schema.py::test_contract_column_defaults PASSED
======================== 8 passed, 2 warnings in 0.19s =========================
```

The enum test pins the exact §2 value lists (order-sensitive via
`pg_enum.enumsortorder`) against both the DB and the Python enums; the
NULLS NOT DISTINCT tests assert the constraint DDL contains
`NULLS NOT DISTINCT` AND that two excerpt-less/role-less links with the
same tuple are rejected (a plain UNIQUE would allow them) while a
different `support_type`/`excerpt_id`/`role_in_fact` is accepted; the
tags test asserts the `[]` default and round-trips explicit tags; the
partial-unique test rejects same-matter `external_ledger_id` duplicates
and accepts multiple NULL-external-id rows.

## Contract gaps
None — contract §2 implemented as written. Two observations for the
integrator (no action needed to unblock F/G):
- §2 says `fact_actor_links.actor_id` is `FK actors CASCADE` (not null);
  implemented NOT NULL. If that was meant to be nullable, that is a 1.x
  change.
- §2 does not specify `ondelete` for `proposals.created_by_user_id` /
  `reviewed_by_user_id` and `fact_assertions.created_by_user_id` /
  `approved_by_user_id`; I used `SET NULL`, matching the existing
  `users` FK convention in 0001–0003.

## Risks / follow-ups
- Integration should record the `tags_json` extension in
  `handoff/DECISIONS.md` when this merges (noted in the contract).
- `fact_assertions.supersedes_fact_id` has no ORM relationship yet; W2-G
  adds whatever lookup it needs (file is E's — if G needs a relationship,
  it goes in via a 1.x contract note or E's follow-up, not a drive-by).
- The test suite's schema tests run against `create_all` of model
  metadata (conftest), while the migration path is verified by the gate's
  upgrade/downgrade/re-upgrade on a fresh DB. Both paths are pinned by
  the same tests' expected values, but they are two independent DDL
  sources — a future drift would only be caught by the gate if the
  integration runs it (it does, per merge protocol).

## What the next agent must know
- W2-F: fill `routers/ledger.py` (tags `["ledger"]`, mounted at
  `/api/v1`), read/write via the `LedgerEntry` model; `tags` in/out
  maps to `tags_json` (JSON array of strings); workspace scoping and the
  partial unique on `(matter_id, external_ledger_id)` are at the DB level.
- W2-G: fill `routers/proposals.py` + `routers/facts.py`; the
  review-state floor (§4.1) is service-layer — the schema does not
  enforce it (any `review_state` value is storable; keep all creation
  paths at `proposed` and `/approve` as the only route to `accepted`).
  `created_fact_id` in `ProposalOut` = lookup on
  `fact_assertions.created_from_proposal_id`.
- Conftest cleanup already covers the new tables (metadata-driven);
  nothing to add there this wave.
- All enum writes accept Python enum members or their string values
  (verified); `sa.Enum(PythonEnum)` round-trips to members on read.

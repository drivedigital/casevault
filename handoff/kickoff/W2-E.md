<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-E — Wave 2 spine — migration 0004 + intake models + router registration

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** **1st — critical path, everyone else waits on this merge** · **Depends on:** nothing (start immediately)

---

## Paste this into the agent session

```
Workstream **W2-E** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. Implement
contract §2 as written.

## Deliverable
The whole wave's schema, in ONE migration, plus the router stubs everyone else fills.

- `apps/api/alembic/versions/0004_*.py`, revision `0004`, `down_revision = '0003'`:
  tables `ledger_entries`, `proposals`, `fact_assertions`, `fact_source_links`,
  `fact_actor_links`; enums `proposal_type_enum`, `review_state_enum`,
  `fact_type_enum`, `support_type_enum`, `strength_label_enum`.
  - `ledger_entries.tags_json` JSONB NOT NULL default `'[]'` (deliberate
    extension — comment it in the migration).
  - `fact_source_links`/`fact_actor_links` uniques use **`NULLS NOT DISTINCT`**
    (Postgres 15+; compose is postgres:16).
  - Downgrade must drop the tables AND the five enum types explicitly
    (`sa.Enum(name=...).drop(op.get_bind(), checkfirst=True)`), like 0002/0003.
    The wave gate runs `upgrade → downgrade base → upgrade` — this is checked.
- `apps/api/app/models/intake.py` — SQLAlchemy models mirroring §2 exactly,
  with the existing `UUIDPrimaryKeyMixin`/`TimestampMixin` conventions.
- `apps/api/app/models/enums.py` (append the five enums), `models/__init__.py`
  (register), `app/main.py` (include the three routers below).
- `apps/api/app/routers/{ledger,proposals,facts}.py` — create each as
  `router = APIRouter(tags=[...])` with NO endpoints yet (W2-F/W2-G fill them).
  Register all three in `main.py` under `/api/v1`.
- `tests/api/conftest.py` — extend only if needed (keep the scratch
  `LOCAL_STORAGE_ROOT` redirect and the truncate/cleanup list in sync with the
  new tables; add the new tables to the cleanup order).
- `tests/api/test_intake_schema.py` — assert the tables exist, the enum values
  match §2, the `NULLS NOT DISTINCT` uniques reject duplicate excerpt-less link
  tuples, and `tags_json` defaults to `[]`.

## Write set (nothing else)
`apps/api/alembic/versions/0004_*.py`, `apps/api/app/models/intake.py`,
`app/models/enums.py` (append), `app/models/__init__.py`, `app/main.py`,
`app/routers/{ledger,proposals,facts}.py` (stubs only), `tests/api/conftest.py`,
`tests/api/test_intake_schema.py`.

## Proof required
`bash scripts/verify_all.sh --no-web` (fresh DB: upgrade → downgrade base →
upgrade) plus your schema test output. Paste both in the note.

## Notes
- You are on the critical path: F, G, H, I and J are blocked on this merge.
  Keep it small — schema, models, stub routers, tests. No endpoints, no services,
  no UI.
- Do not touch `models/source.py`, `services/*`, or any router that already has
  endpoints.
- Write `handoff/notes/W2-E.md` (format: AGENT_POLICY §4.4) and report the
  branch + commit sha to the owner when done; merge happens in order.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

<!-- CaseVault PR template — parallel-agent workflow (handoff/PARALLEL_PLAN.md §5) -->

## Workstream / contract

- Workstream: `WS-?` (issue #)
- Contract: `docs/contracts/<file>.md` version:
- Integration branch: `arena/01a0899f-casevault`

## What changed

<!-- Files/modules touched. Confirm every path is inside your workstream's write set. -->

## Proof (paste command output)

```
# scripts/verify_all.sh --no-web   (or the narrower workstream proof)
```

- [ ] `alembic upgrade head` → `downgrade base` → `upgrade head` on a fresh DB
- [ ] `pytest` green on a real Postgres (not mocks)
- [ ] `ruff check apps workers scripts tests` clean
- [ ] web: `lint` / `typecheck` / `build` (UI workstreams)
- [ ] workstream-specific proof from contract §7

## Contract conformance

- [ ] No edits outside the write set in `handoff/PARALLEL_PLAN.md` §3
- [ ] No new Alembic migration unless this workstream owns the wave's migration
- [ ] No files under `data/`, no secrets, no real evidence in the diff
- [ ] `handoff/notes/<WS>.md` written

## Risks / follow-ups / contract gaps

<!-- Anything the integrator must sequence, and any place the contract was
     insufficient (cite the section number instead of diverging). -->

<!-- CaseVault PR template — parallel-agent workflow (handoff/PARALLEL_PLAN.md §5) -->

## Workstream / contract

- Workstream / scoped assignment:
- Contract: `docs/contracts/<file>.md` version:
- Integration branch: `arena/01a0899f-casevault`

## What changed

<!-- Files/modules touched. Confirm every path is inside your workstream's write set. -->

## Proof (paste command output)

- Product checkpoint SHA:
- Verifier/spec SHA and any local diff:
- Evidence mode: real browser / real API / real worker / injected / source review / docs-only
- Run IDs, exact commands, exit codes, full vs partial counts and skips:
- Preserved redacted summary / raw synthetic artifact locations (raw data stays out of Git):
- If blocked or logs lost: what is unavailable, and what is NOT established:

<!-- For docs/review-only PRs mark runtime checks N/A with reason. For product
merges the integrator runs the full strict gate; --no-web is partial proof only.
Never run destructive checks on a working application database. -->

```
# scripts/verify_all.sh --no-web   (or the narrower workstream proof)
```

- [ ] `alembic upgrade head` → `downgrade base` → `upgrade head` on a fresh DB
- [ ] `pytest` green on a real Postgres (not mocks)
- [ ] `ruff check apps workers scripts tests` clean
- [ ] web: `lint` / `typecheck` / `build` (UI workstreams)
- [ ] workstream-specific proof from contract §7

## Contract conformance

- [ ] No edits outside the write set in the current scoped brief/contract (see `handoff/STATUS.md`)
- [ ] No new Alembic migration unless this workstream owns the wave's migration
- [ ] No files under `data/`, no secrets, no real evidence in the diff
- [ ] `handoff/notes/<WS>.md` written

## Risks / follow-ups / contract gaps

<!-- Anything the integrator must sequence, and any place the contract was
     insufficient (cite the section number instead of diverging). -->

## Delivery / safety

- [ ] Existing active PR updated on this session's assigned branch; no self-merge
- [ ] Closed-session notes/cumulative patches treated as evidence, not wholesale code replay
- [ ] No approval bypass or automatic diagnostic-branch push
- [ ] Test resources isolated; cleanup status/remaining owned processes recorded
- [ ] Local tester hold respected unless integrator explicitly released an exact checkpoint/checklist

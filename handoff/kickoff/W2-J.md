<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-J — Wave 2 — end-to-end verification + CI job

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** 3rd (after E, F, G merge) · **Depends on:** W2-E, W2-F, W2-G merged

---

## Paste this into the agent session

```
Workstream **W2-J** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. You are the
independent verifier: your job is to falsify, not to agree.

## Deliverable
- `scripts/intake_smoke.py` — headless end-to-end against a real API + database:
  bootstrap workspace → upload a synthetic text source → `POST
  /proposals/generate` → list proposals → accept one → assert the fact is
  `proposed` (floor rule) → `POST /facts/{id}/approve` → assert `accepted` with
  `approved_at` → link a source and an actor to the fact → assert 409 on the
  duplicate link → ledger: create two rows, export CSV, import it into a second
  matter/workspace, assert round-trip equality and that `dry_run` wrote nothing
  → supersede a fact and assert old→`superseded`.
- `tests/integration/test_intake_e2e.py` — pytest wrapper for the same flow
  (skips only with an explicit reason on a genuinely absent dependency).
- `.github/workflows/ci.yml` — append an `intake` job (postgres:16 service,
  migrations, then the integration test). Do not restructure existing jobs.
- A **deviation report** in the note: any place the API, error codes, or states
  differ from the contract — endpoint, expected vs observed, contract section.

## Write set (nothing else)
`scripts/intake_smoke.py`, `tests/integration/test_intake_e2e.py`,
`.github/workflows/ci.yml` (append job only).

## Proof required
`python scripts/intake_smoke.py` output on the merged tip plus
`bash scripts/verify_all.sh` (full gate). Paste both.

## Notes
- Report product bugs; do not fix them (the owning workstream patches, you
  re-run).
- Synthetic data only; never commit evidence; keep uploads under the git-ignored
  `data/` tree and clean up after the run.
- Write `handoff/notes/W2-J.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

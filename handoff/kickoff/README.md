# Wave 1 kickoff — Sprint 3 (evidence repository / upload / OCR)

Four agent sessions run in parallel against this branch. Each has one file here
containing a **paste-ready prompt** plus reference detail. Contract:
`docs/contracts/sprint3_evidence.md` **v1.0 (frozen)**. Plan:
`handoff/PARALLEL_PLAN.md`.

| WS | Brief | Deliverable | Starts when | Merge order |
|---|---|---|---|---|
| A | `WS-A.md` | migration `0003` + sources API | immediately | **1st** |
| B | `WS-B.md` | storage service + ingest/OCR jobs | immediately (contract-driven) | **2nd** |
| C | `WS-C.md` | `/evidence` + `/evidence/[id]` UI | immediately (contract-driven) | **3rd** |
| D | `WS-D.md` | e2e smoke + CI evidence job | A + B merged | **4th** |

## Step 0 — base every session on the integration branch (required)

`origin/main` and `arena/01a0899f-casevault` have **unrelated histories**
(main is a squashed Phase-0 snapshot), so a session branched from `main` does
not contain Phase 1 and will not merge. First action in every session:

```bash
git fetch origin arena/01a0899f-casevault
git reset --hard FETCH_HEAD        # your own session branch = integration tip
```

If your session already pushed its branch and `reset` is rejected:

```bash
git push --force-with-lease origin HEAD
```

Then confirm you are on the right base: `git log --oneline -1` must show
`Wave 0: parallel-build plan, Sprint 3 interface freeze, agent PG harness`
or a later integration commit, and `ls apps/api/app/models/` must list
`source.py`-ready Phase 1 modules (`actor.py`, `matter.py`, `identity.py`).

## Environment (sandbox, no Docker needed)

```bash
bash scripts/setup_local.sh                 # venv + deps + data dirs + .env.local
.venv/bin/pip install pgserver              # once — embedded Postgres 16
python scripts/agent_pg.py start
bash scripts/verify_all.sh                  # the wave gate: migrations up/down/up, pytest, ruff, web
```

`scripts/verify_all.sh --no-web` is the fast python-only gate.

## Rules that keep the wave mergeable

1. Write only files in your brief's write set; hub files have exactly one owner.
2. Only WS-A creates an Alembic migration this wave (`0003`); only WS-A edits
   `models/enums.py`, `models/__init__.py`, `app/main.py`; only WS-C edits
   `lib/api.ts` / `lib/types.ts`.
3. Contract deviations are **reported**, not invented: cite the contract section
   in your PR, keep the code inside the contract, and let the integrator
   sequence a contract bump.
4. PR base is `arena/01a0899f-casevault` (**not** `main`), body filled from
   `.github/pull_request_template.md`.
5. Write `handoff/notes/<WS>.md`; never append to `WORKLOG.md` (integrator
   consolidates per wave).
6. No files under `data/`, no secrets, no real evidence in a diff.

## What the integrator (this session) does

- Reviews each PR against the contract and write set.
- Merges in order A → B → C → D, re-running `scripts/verify_all.sh` after each.
- Resolves shared-surface conflicts, sequences contract changes, maintains
  `handoff/WORKLOG.md`, `BACKLOG.md`, `KNOWN_ISSUES.md`, `TESTING.md`.
- Owns `/api/v1` consistency, migrations already applied, and the wave's
  end-of-wave handoff to the local tester.

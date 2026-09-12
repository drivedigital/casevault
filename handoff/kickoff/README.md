# Current assignments — evidence UI closure (2026-09-10)

**Active briefs:** [EU-D](EU-D.md), [EU-L](EU-L.md), [EU-V](EU-V.md),
[EU-M](EU-M.md). Binding acceptance/write sets:
`docs/contracts/evidence_ui_closure.md` **v1.0 FROZEN**.

| Brief | Assignment | Suggested agent | Start/status |
|---|---|---|---|
| EU-D | Detail: Status, downloads/PDF, errors, OCR refresh | `01a08cdf` / PR #18 `b041694` | Merged c8c7d27; strict 119 + browser 25 workerless/2 worker tests passed |
| EU-L | List/upload/row/matter error handling | `01a08ce1` / PR #17 `6bd3cdf` | Re-review: initial drop guard fixed; Retry still bypasses lock; changes requested |
| EU-V | Independent browser acceptance | `01a08ce3` / PR #19 `a434ae1` | Preparation delivered; tooling fixes requested; final acceptance not done |
| EU-M | Native Mac Reprocess + local browser proof | Existing local tester | Exact worker reproduction now; new UI proof after D+L |

Owner reports all three deliverables complete; integration review found blockers.
See `handoff/EVIDENCE_UI_REVIEW.md` (2026-09-11). Three Arena assignments
plus the existing local tester; integrator remains coordinator. Other agents
stand by. No Wave 3 or OCR-engine work is authorized.

**Branch safety:** use your CURRENT session's assigned branch; preserve work
before rebasing. Do not use the historical blanket hard-reset recipe below for
an existing session. No other-session branch pushes; no stale WS-C patch replay.
Shared hubs, dependencies, CI and backend/worker are read-only in this wave unless
integrator explicitly approves a change. See closure contract for exact paths.

---

## Historical Wave 2 kickoff/reference

# Agent kickoff — Wave 2 (intake core: ledger + review inbox + facts)

**Wave 1 (Sprint 3 evidence module) is delivered and integrated** — see
`handoff/notes/` for its record and `docs/contracts/sprint3_evidence.md` for the
as-shipped contract. This folder now assigns **Wave 2**.

**Read first:** `handoff/AGENT_POLICY.md` (binding rules) ·
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** (the interfaces) ·
`handoff/PARALLEL_PLAN.md` §4a (the plan).

## Live status (updated 2026-09-10, evidence UI recovery merged)

| Brief | Workstream | Session / PR | Status |
|---|---|---|---|
| `W2-E.md` | spine: migration `0004` + models + stubs | `01a089c9` / PR #4 | ✅ **merged** (`f0aa9e2`, gate green, 29 tests) |
| `W2-F.md` | ledger API + CSV | `01a089cb` / PR #7 | ✅ **merged** (`4ce4555`, gate green, 34 tests) |
| `W2-H.md` | `/ledger` UI | `01a089cc` / PR #2 | ✅ **merged** (`e62daae`) |
| `W2-I.md` | `/ai-review` UI | `01a089cd` / PR #3 | ✅ **merged** (`0ba7a0c`, cherry-picked; shared-file union resolution) |
| `W2-EV.md` | evidence follow-ups | `01a089cb` / PR #1 | ✅ **merged** (`c7842bb`) |
| `WS-D` (archived brief) | independent evidence E2E | `01a08a04` / PR #14 | ✅ **merged** (`57e5ae6`); strict full gate 119 tests with Redis/offline evidence checks; current GitHub CI results pending. |
| `WS-B` → WS-C recovery | evidence UI recovery | `01a089ce` / PR #11 | ✅ **merged** (`5da141c`, full gate 34 tests); old storage PR #8 closed, refactor deferred. UI follow-ups assigned separately. |
| `WS-A` (archived brief) | sources core | `01a089cd`, note `afef55b` | Retired scope; sources core already integrated. No second migration `0003`. |
| `W2-G.md` | intake API (proposals, facts, links, generation) | `01a089cc` / PR #9 | ✅ **merged** (`4d13527`, head `93656db`); all four findings and RQ follow-up resolved, full gate 72 tests. |
| `W2-J.md` | intake E2E verification + CI | `01a089cd`, head `b6e7b44` | ✅ **reconciled** via `15174cd`; strict gate 96 tests, real queued caps/results/idempotency independently green. |

Wave 1's briefs (`WS-A..WS-D.md`) are archived under `handoff/notes/archive/wave1/`;
three of them were picked up after the fact — see the stop/rework rows above.

## Wave 2 roster (reference)

| Brief | Workstream | Deliverable | Starts | Merge order |
|---|---|---|---|---|
| `W2-E.md` | **spine** | migration `0004` + models + router stubs | now | **1st (critical path)** |
| `W2-F.md` | ledger API | CRUD, filters, CSV import/export, bulk | after E | 2nd |
| `W2-G.md` | intake API (proposals, facts, links, generation) | `01a089cc` / PR #9 | ✅ **merged** (`4d13527`, head `93656db`); all four findings and RQ follow-up resolved, full gate 72 tests. |
| `W2-H.md` | ledger UI | `/ledger` table, filters, CSV dialogs, bulk | now (contract-only) | 2nd |
| `W2-I.md` | inbox UI | `/ai-review` queue + accepted-facts tab | now (contract-only) | 2nd |
| `W2-J.md` | verification | e2e smoke script + integration test + CI job | after E, F, G | 3rd |
| `W2-EV.md` | evidence follow-ups | excerpts API + per-source reprocess | ✅ done | merged |

F and G share no files. H and I share only the append-only sections of
`lib/api.ts` / `lib/types.ts`. E is short and lands first — everyone else is
waiting on that merge, so keep it to schema + models + stubs + tests.

## Step 0 — base every session on the integration branch (required)

`origin/main` and `arena/01a0899f-casevault` have **unrelated histories** (main
is a squashed Phase-0 snapshot), so a session branched from `main` lacks Phase 1
and Sprint 3 and cannot merge. First action in every session:

```bash
git fetch origin arena/01a0899f-casevault
git reset --hard FETCH_HEAD        # your own session branch = integration tip
git push --force-with-lease origin HEAD   # only if the branch was already pushed
```

Confirm: `git log --oneline -3` shows `Integrator: align Sprint 3 docs…` (or a
later commit), and `ls apps/api/app/routers/` lists `sources.py`.

## Environment (sandbox, no Docker needed)

```bash
bash scripts/setup_local.sh        # venv + deps + data dirs + .env.local
.venv/bin/pip install pgserver     # once — embedded Postgres 16
python scripts/agent_pg.py start
bash scripts/verify_all.sh         # the wave gate (add --no-web for API-only)
python scripts/agent_pg.py stop    # when finished
```

## The rules that keep the wave mergeable

Summarised from `handoff/AGENT_POLICY.md` — the full document is binding:

1. **One workstream = one session = one branch = one PR.** Write only your write
   set; report overlap instead of sharing files.
2. **Contracts are frozen before sessions start.** Implement as written; a
   deviation is a `## Contract gaps` note to the integrator (§4.1), never a
   silent divergence.
3. **Hub files have one owner per wave** (AGENT_POLICY §2) — `main.py`,
   `models/enums.py`, `nav.tsx`, `conftest.py`, CI, Makefile.
4. **Append-only** for `apps/web/lib/api.ts` and `lib/types.ts`: your own
   commented section at the end, no reordering or reformatting of existing lines.
5. **No breaking response-shape changes mid-wave** — that is a contract version
   bump scheduled by the integrator.
6. **Real Postgres, no mocks merge.** Gate output goes in your note; tests never
   write to `data/` and never contain real evidence.
7. **Handoff notes, not worklog edits:** `handoff/notes/<WS>.md` in the §4.4
   format; the integrator consolidates `WORKLOG.md` / `BACKLOG.md` /
   `KNOWN_ISSUES.md` / `TESTING.md` / `DECISIONS.md` per wave.
8. **PR base is `arena/01a0899f-casevault`, never `main`.** If `gh` is blocked by
   permissions, push the branch and report branch + sha + proof to the owner.
9. **Stop rules:** anything touching evidence, secrets, or real case data — stop
   and escalate. Conflict outside your write set — abort the rebase, report,
   wait.

## What the integrator does

Reviews each PR against contract + write set, merges in the fixed order,
re-runs `scripts/verify_all.sh` after every merge, sequences contract changes,
resolves shared-surface conflicts, maintains the handoff docs, and hands the
integrated wave to the local tester.

2026-09-12 owner update: **EU-M / local environment on hold** until integrator
supplies a substantive corrected D+L integrated SHA and focused checklist.

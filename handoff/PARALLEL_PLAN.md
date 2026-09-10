# Parallel Build Plan — coordinating multiple agents

**Status:** proposed (integrator: `arena/01a0899f-casevault`) · **Date:** 2026-09-10
**Companion:** `docs/contracts/sprint3_evidence.md` (Wave 1 interface freeze)

Purpose: allow several coding agents to build this repo **in parallel without
merge chaos**, while one agent (the integrator) keeps the shared surfaces
consistent. Read this before starting any workstream.

---

## 1. Where the project stands

| Layer | State |
|---|---|
| Safety / handoff / CI / local run | Phase 0 complete, macOS-verified |
| Workspace, matters (overlay links), actor registry, roles | Phase 1 complete (migrations 0001–0002, API + real UI) |
| Next per roadmap | **Sprint 3 Evidence repository / upload / OCR** (Roadmap §Sprint 3) |
| Then | Sprint 4 source ledger (+ CSV), Sprint 5 proposal review inbox / facts |

Known gaps that shape the plan:
- `/evidence` is linked in the nav but **has no page yet** (404) — Sprint 3 fixes it.
- No audit rows until Migration 010 (Sprint 5 must not assume audit exists).
- pgvector is not enabled; embeddings/search are Sprint 10 — do not add vector columns.
- Worker jobs must stay importable without redis (repo posture: `make ping-job`).

Baseline proof on this branch (2026-09-10, embedded Postgres via
`scripts/agent_pg.py`): migrations upgrade to `0002`, `pytest` 8 passed,
`ruff` clean, `npm ci` + web lint/typecheck/build green.

---

## 2. Parallelization model

```
            Wave 0 (serial)  ──►  Wave 1 (4 agents in parallel)  ──►  Wave 2 (parallel)
   contract freeze + harness     Sprint 3: evidence/upload/OCR      Sprint 4/5: ledger, proposals
   (this plan + contract doc)    WS-A  sources core (schema+API)    WS-E  ledger + CSV
                                 WS-B  storage + worker pipeline    WS-F  proposals + review inbox
                                 WS-C  web evidence UI              WS-G  facts + chronology seed
                                 WS-D  verification + CI            WS-H  verification
```

Rules that make it work:

1. **Contract before code.** A workstream may not start until its contract doc is
   frozen (`docs/contracts/<topic>.md`, version line at the top).
2. **Disjoint write sets.** Every file has exactly one owner per wave (§3 and
   contract §1). Shared hubs are edited by one named workstream only.
3. **One migration per wave, one owner.** WS-A owns `0003`; WS-B/WS-C add none.
   Wave 2 reserves `0004` (ledger) and `0005` (proposals/facts) up front.
4. **Append-only coordination files.** Agents write `handoff/notes/<WS>.md`
   (new file each) instead of fighting over `WORKLOG.md`; the integrator
   consolidates into `handoff/WORKLOG.md` at wave end.
5. **Green gates.** A workstream is done only when its §7 proof passes on the
   agent's branch (real Postgres, not mocks).

---

## 3. Wave 1 workstreams (Sprint 3)

| WS | Deliverable | Depends on | Contract |
|---|---|---|---|
| **A** | Migration `0003` + `sources` models/services/routers/schemas; upload, list/filter, detail, patch, matter links, pages, excerpts, `reprocess`; `tests/api/test_sources.py` | frozen contract §2–§3 | `docs/contracts/sprint3_evidence.md` |
| **B** | `StorageService` + `LocalFileStorage` (streaming, sha256, traversal guard), classification, `MAX_UPLOAD_MB`; `workers/pipeline/source_jobs.py` + `enqueue.py` (redis-optional); `workers/requirements-ocr.txt`; storage + job tests | contract §4–§5 (interface only, can start immediately) | same doc |
| **C** | `/evidence` index (filters, table, upload) + `/evidence/[id]` viewer (page nav, viewer, inspector tabs); `lib/api.ts` + `lib/types.ts` additions | contract §3 + §6 (types can be written from the contract before the API exists) | same doc |
| **D** | `tests/integration/test_evidence_e2e.py` + CI evidence job + `scripts/pipeline_smoke.py`; verifies A+B+C together on merge | A and B merged (starts last) | same doc |

Suggested agent budget: 3 implementers + 1 verifier; WS-D can also be run by the
integrator. WS-C can build against the contract with a temporary mock only if it
deletes the mock before PR review — no mock code merges.

### File ownership summary (Wave 1)

- **WS-A:** `apps/api/app/models/source.py`, `models/enums.py`, `models/__init__.py`,
  `schemas/source.py`, `services/source_service.py`, `routers/sources.py`,
  `app/main.py`, `apps/api/alembic/versions/0003_*.py`, `tests/api/test_sources.py`
- **WS-B:** `apps/api/app/integrations/storage/**`, `app/config.py`
  (`MAX_UPLOAD_MB` only), `workers/pipeline/{source_jobs,enqueue}.py`,
  `workers/requirements-ocr.txt`, `tests/workers/test_source_jobs.py`
- **WS-C:** `apps/web/app/evidence/**`, `apps/web/components/source-*.tsx`,
  `apps/web/lib/{api,types}.ts`
- **WS-D:** `tests/integration/**`, `.github/workflows/ci.yml`, `scripts/pipeline_smoke.py`

Overlap alert: WS-A and WS-B both need `sources.storage_path` semantics — that is
fixed in contract §4.2, not negotiated in code. WS-A imports
`from app.integrations.storage import get_storage`; WS-B must land that import
path first or WS-A may code against it with a `TODO` import that resolves on
WS-B merge (the contract API is frozen, so this is safe).

---

## 4. Wave 2 preview (do not start before Wave 1 merges)

| WS | Sprint | Migration | Notes |
|---|---|---|---|
| E | 4 — source ledger + CSV import/export, filters, bulk tag | `0004` `ledger_entries` | depends on sources for `linked_source_id` |
| F | 5 — proposals + review inbox + `fact_assertions` + `fact_source_links` | `0005` | audit rows are **not** available (Migration 010); record review metadata on the rows themselves |
| G | 6 — events/chronology (`events`, `event_fact_links`, `event_actor_links`, `event_tags`) | `0006` | after F (facts are the input) |
| H | verification + handoff consolidation for E/F/G | — | same role as WS-D |

Wave 2 contracts get their own frozen docs before any code starts.

---

## 5. Branch, PR, and merge protocol

- **Integration branch:** `arena/01a0899f-casevault` (this session). PRs from
  workstream branches go **into this branch**, not `main`.
- **Agent branches:** Arena sessions use their own session branch; local agents
  (Claude Code / Codex / worktrees) use `feature/<ws-id>-<topic>`, e.g.
  `feature/ws-a-sources-core`.
- **Before opening a PR:** rebase onto the current integration tip; run the
  workstream proof (§7); keep the diff inside your write set.
- **Merge order within a wave:** A → B → C → D. The integrator merges, re-runs
  the full gate after each merge, and fixes contract-level conflicts.
- **Conflict policy:** if a rebase conflicts outside your write set, stop and
  ping the integrator instead of resolving by guesswork. Contract-breaking
  changes are never resolved in a merge commit — they get a new contract version.
- **PR body template:** contract version · files touched · proof commands +
  results · handoff note path · open risks.

## 6. Verification (every workstream)

Sandbox without Docker (agent environments):

```bash
bash scripts/setup_local.sh                  # venv, deps, data dirs, .env.local (idempotent)
.venv/bin/pip install pgserver               # once — embedded Postgres 16
python scripts/agent_pg.py start             # init + start + create casevault{,_test}
eval "$(python scripts/agent_pg.py env)"     # DATABASE_URL / TEST_DATABASE_URL
.venv/bin/python -m alembic -c apps/api/alembic.ini upgrade head
.venv/bin/python -m pytest -q                # real Postgres, no mocks
.venv/bin/python -m ruff check apps workers scripts tests
npm run lint --workspace=web && npm run typecheck --workspace=web && npm run build --workspace=web
python scripts/agent_pg.py stop              # when finished
```

Local tester path stays authoritative: `make infra-up`, `make migrate`, `make api`,
`make web`, `make test`, `make lint` (see `handoff/TESTING.md`).

## 7. Definition of done (per workstream)

1. Contract version implemented without edits to files outside the write set.
2. Proof commands above run green on a real database; results pasted in the PR.
3. New behavior covered by at least one test in the workstream's own test file.
4. `handoff/notes/<WS>.md` written: what changed, proof, risks, what the next
   agent must know.
5. Backlog/known-issue lines updated **only** by the integrator at wave end
   (avoids five-way conflicts on `handoff/BACKLOG.md`).

## 8. Kickoff prompt template (paste into each agent session)

```
Repo: drivedigital/casevault. Read handoff/PARALLEL_PLAN.md and
docs/contracts/sprint3_evidence.md first. You are workstream <WS-id>
(<name>). Integration branch: arena/01a0899f-casevault.

Write only these paths: <write set>.
Do not touch: <other workstreams' paths>; never create an Alembic migration
unless you own the wave's single migration.

Implement the contract as written. If it is wrong or insufficient, do not
diverge: report the gap to the integrator with the contract section number.

Verify with (sandbox): scripts/agent_pg.py + alembic upgrade head + pytest +
ruff (+ web lint/typecheck/build for UI work). Then write handoff/notes/<WS>.md
and open a PR into arena/01a0899f-casevault with the proof output in the body.
```

## 9. Open questions for the human owner

1. Agent topology: separate Arena sessions per workstream (PR into this branch),
   local agents in worktrees, or a single agent working the wave sequentially?
2. Whether this session should (a) coordinate only, (b) also implement WS-A, or
   (c) implement the whole wave itself.
3. Whether the first parallel wave is Sprint 3 (roadmap order) or something the
   tester needs sooner (e.g. Sprint 4 CSV ledger import, Sprint 5 review inbox).

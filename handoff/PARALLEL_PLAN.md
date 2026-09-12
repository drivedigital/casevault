> **Current plan:** see [STATUS.md](STATUS.md) and [kickoff/README.md](kickoff/README.md).
> This document preserves the historical wave design, not current assignments.
> Evidence and intake core (migration0004) are integrated; D/L merged; EU-V pending;
> EU-M on hold. Old migration reservations/merge-order forecasts below are historical.

# Parallel Build Plan — coordinating multiple agents

**Status:** approved 2026-09-10 · **Wave 1 outcome:** Sprint 3 was delivered
by a single session (`arena/01a08429-casevault`, `e2dc8544`) that had already
started before the contract was frozen; the integrator reviewed, merged
(`2e440d6`), aligned the contract to the shipped code, and the A/B/C fan-out is
therefore **superseded**. Wave 2 will fan out with contracts frozen first.
This session is the **integrator only**; other
workstreams run in separate agent sessions on their own branches and open PRs
into `arena/01a0899f-casevault`.
**Binding rules:** `handoff/AGENT_POLICY.md` (division of labor + coordination
protocols — read this first) ·
**Wave 2 contract:** `docs/contracts/wave2_intake_core.md` v1.0 (frozen) ·
**Kickoff briefs:** `handoff/kickoff/W2-*.md` ·
**Wave gate:** `scripts/verify_all.sh`

Purpose: allow several coding agents to build this repo **in parallel without
merge chaos**, while one agent (the integrator) keeps the shared surfaces
consistent. Read this before starting any workstream.

---

## 1. Historical starting point (not present-day product state)

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

**Wave 2 roster (historical):** W2-E spine → W2-F ledger API ∥ W2-G intake API ∥
W2-H ledger UI ∥ W2-I inbox UI → W2-J verification, with W2-EV (evidence
follow-ups) in parallel. Merge order E → F → G → J. Details: §4a.

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

## 4a. Wave 2 workstreams (intake core — Sprints 4 + 5)

Sprints 4 (source ledger) and 5 (proposal review / facts) share **one**
migration in the schema draft (004), so the wave is cut as:

| WS | Deliverable | Owns (write) | Depends on | Merge |
|---|---|---|---|---|
| **E** | migration `0004` (ledger_entries, proposals, fact_assertions, fact_source_links, fact_actor_links + 5 enums), models, router stubs, `main.py` registration, conftest cleanup | `alembic/versions/0004_*.py`, `models/intake.py`, `models/enums.py` (append), `models/__init__.py`, `app/main.py`, `routers/{ledger,proposals,facts}.py` (stubs), `tests/api/conftest.py`, `tests/api/test_intake_schema.py` | — | **1st** |
| **F** | ledger CRUD/filters/CSV/bulk API | `schemas/ledger.py`, `services/ledger_service.py`, `services/ledger_csv.py`, `routers/ledger.py`, `tests/api/test_ledger.py` | E | 2nd |
| **G** | proposal review + facts + links + generation job | `schemas/intake.py`, `services/{proposal_service,fact_service}.py`, `routers/{proposals,facts}.py`, `workers/pipeline/intake_jobs.py`, two test files | E | 2nd |
| **H** | `/ledger` UI + nav entry | `app/ledger/**`, `components/ledger-*.tsx`, `components/nav.tsx`, `lib/{api,types}.ts` (append) | contract | 2nd |
| **I** | `/ai-review` inbox + facts tab | `app/ai-review/**`, `components/review-*.tsx`, `lib/{api,types}.ts` (append) | contract | 2nd |
| **J** | e2e smoke + integration test + CI job | `scripts/intake_smoke.py`, `tests/integration/test_intake_e2e.py`, `.github/workflows/ci.yml` (append) | E, F, G | 3rd |
| **EV** | excerpts API + per-source reprocess (Sprint 3 follow-ups) | evidence module files (append only) + `tests/api/test_source_excerpts.py` | — | parallel |

Critical path: **E** (schema + stubs) — F, G and J cannot start until it merges.
H and I start immediately against the contract. Full briefs:
`handoff/kickoff/W2-*.md`. Contract: `docs/contracts/wave2_intake_core.md` §1–§7.

The review-state floor (contract §4.1) is the wave's non-negotiable invariant:
every creation path leaves a fact `proposed`; only `POST /facts/{id}/approve`
produces `accepted`. W2-G tests it and W2-J tries to falsify it.

---

## 4b. Wave 3 preview (chronology, Sprint 6) — not started

| WS | Sprint | Migration | Notes |
|---|---|---|---|
| K | 6 — events/chronology (`events`, `event_fact_links`, `event_actor_links`, `event_tags`) | `0005` | consumes the **accepted** fact set (`GET /facts?review_state=accepted`); audit rows are still unavailable (Migration 010) |
| L | 7 — proof-graph link tables + object side panels | `0006` | after K |
| M | verification for K/L | — | same role as W2-J |

Wave 3 contracts get their own frozen doc(s) before any session starts.
Reserved revision numbers: `0005` = chronology (WS-K), `0006` = proof graph
(WS-L). Nobody else creates a migration in those ranges.

---

## 5. Branch, PR, and merge protocol

- **Integration branch:** `arena/01a0899f-casevault` (this session). PRs from
  workstream branches go **into this branch**, not `main`.
- **Agent branches:** Arena sessions use their own session branch; local agents
  (Claude Code / Codex / worktrees) use `feature/<ws-id>-<topic>`, e.g.
  `feature/ws-a-sources-core`.
- **Step 0 in every agent session — base the branch on the integration tip.**
  `origin/main` and the integration branch have *unrelated histories* (main is a
  squashed Phase-0 snapshot), so a session started from `main` lacks Phase 1 and
  cannot merge:
  ```bash
  git fetch origin arena/01a0899f-casevault
  git reset --hard FETCH_HEAD        # own session branch = integration tip
  # if the branch was already pushed:
  git push --force-with-lease origin HEAD
  ```
- **Integrator role (this session):** review PRs against the contract + write
  set, merge A → B → C → D, re-run `scripts/verify_all.sh` after each merge,
  fix/sequence shared-surface conflicts, consolidate handoff docs per wave.
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

Sandbox without Docker (agent environments) — one command runs the whole gate
on a **fresh** database (migrations up → down → up, pytest, ruff, web):

```bash
bash scripts/setup_local.sh      # venv, deps, data dirs, .env.local (idempotent)
.venv/bin/pip install pgserver   # once — embedded Postgres 16, on-demand install
python scripts/agent_pg.py start
bash scripts/verify_all.sh       # full gate        (add --no-web for python only)
python scripts/agent_pg.py stop  # when finished
```

Narrower loops: `bash scripts/verify_all.sh --no-web` for API-only work,
`pytest tests/api/test_sources.py -q` while iterating, and the compose path
(`make infra-up && make migrate && make test && make lint`) for the local tester.

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

## 9. Locked decisions (owner, 2026-09-10)

1. **This session coordinates only** — contracts, review, merges, integration
   testing, handoff docs. Feature code is written by the other sessions.
2. **Topology: separate Arena sessions.** Each workstream runs in its own
   session on its own branch and opens a PR into `arena/01a0899f-casevault`
   (see §5; step 0 base-branch reset is mandatory). Local agents may mirror the
   same workstreams on `feature/<ws>-*` branches if needed.
3. **First parallel wave: Sprint 3** (evidence repository / upload / OCR) in the
   A/B/C/D split above, contract frozen at v1.0.

## 10. Readiness checklist (integrator)

- [x] Sprint 3 contract written and frozen (`docs/contracts/sprint3_evidence.md`)
- [x] Four kickoff briefs with paste-ready prompts (`handoff/kickoff/`)
- [x] Wave gate script (`scripts/verify_all.sh`) — green on the current tip
- [x] PR template enforcing contract/write-set/proof reporting
- [x] Baseline defects fixed: migrations 0001/0002 `downgrade()` were broken
      (stray autogenerated statements + missing enum type drops) — found by the
      new gate, fixed, and re-verified `upgrade → downgrade base → upgrade`
- [x] Wave 1 integrated: Sprint 3 merged, gate green, contract aligned to the
      shipped code (`2e440d6`)
- [x] Lesson recorded: a contract only coordinates sessions that start *after*
      it is frozen — freeze first, then spawn (see DECISIONS 2026-09-10)
- [x] `handoff/AGENT_POLICY.md` in force — division of labor, protocols, hard
      rules, escalation ladder (the binding document for every agent session)
- [x] Wave 2 contract frozen (`docs/contracts/wave2_intake_core.md` v1.0) and
      seven paste-ready briefs written (`handoff/kickoff/W2-*.md`)
- [ ] Wave 2 fan-out: spawn W2-E first (critical path), then F/G/H/I, then J
- [ ] WS-D equivalent for Sprint 3: independent end-to-end verification of the
      merged evidence flow (`scripts/pipeline_smoke.py`) — still valuable, the
      shipped test suite is the author's own
- [ ] CI evidence job wired into PR checks for this branch

## Evidence UI closure wave (2026-09-10) — active assignments

Three Arena workstreams + existing local tester, no new feature wave:
- EU-D: detail-page owner, includes all Status/download/PDF/OCR/error work.
- EU-L: list/upload/row-error owner, parallel and disjoint from detail.
- EU-V: independent browser verifier, tooling/checklist now, final run after D+L.
- EU-M: report-only native Mac tester, exact Reprocess reproduction now and new
  UI acceptance after merged D+L tip is supplied.

Frozen contract: docs/contracts/evidence_ui_closure.md v1.0. Paste-ready briefs
in handoff/kickoff/EU-*.md. Read those instead of reusing old WS-C assignments.
All shared hubs/CI/dependencies/backend/worker remain integrator-controlled.
Merge order D/L by readiness -> V; full strict gate after every merge. Owner
must confirm session allocation; suggested assignees are not confirmed active.

# Worklog

Per-turn implementation summary. Newest entries at the top.
Fields: Date / Branch / What changed / Why / Files affected / What needs local testing / Blockers & feedback needed.

---

## 2026-09-10 — Integrator: Wave 2 spine integrated (E, F, H, I) + two parked PRs

**Branch:** `arena/01a0899f-casevault`

### Merged this turn (gate re-run after each)
| PR | Workstream | Merge | Tests after |
|---|---|---|---|
| #4 | W2-E — migration 0004 + models + router stubs | `f0aa9e2` | 29 |
| #7 | W2-F — ledger API, CSV import/export, bulk | `4ce4555` | 34 |
| #2 | W2-H — `/ledger` UI + nav entry | `e62daae` | 34 |
| #3 | W2-I — `/ai-review` inbox + facts tab | `0ba7a0c` | 34 |

- **Conflicts resolved:** `routers/ledger.py` add/add (took W2-F's implementation
  over W2-E's stub); `lib/api.ts` + `lib/types.ts` append-only collisions between
  W2-H and W2-I — rebuilt from each commit's own contents (W2-I's object methods
  + W2-H's top-level section in api.ts; H section + I section in types.ts) after
  a mechanical line-union produced dangling members; the duplicated
  `StrengthLabel` / `STRENGTH_LABELS` declarations were collapsed to one shared
  pair. `tsc`, lint and `next build` clean (`/ledger` and `/ai-review` route).
- W2-I was cherry-picked alone: its branch also carried the W2-J verification
  commit, which cannot land before W2-G (one workstream per PR, AGENT_POLICY §1).

### Parked, with reasons
- **WS-D (PR #6) — stale assertion, not a bug.** Its smoke asserts
  `POST /sources/{id}/reprocess` returns 404 ("shipped path = worker"); W2-EV
  has since shipped that endpoint per contract §6 (202 `{queued, job_id,
  reason}`), so the check now fails 35/36 on the merged tree. Reproduced the
  36/36 pass on the WS-D branch itself to confirm the cause. Rebase + assert the
  shipped shape, then merge — its `GITHUB_TOKEN` fix for the gitleaks step is
  genuinely wanted (that env block was documented in 631b85a but never landed).
- **WS-B (PR #8/#5) — duplicate work.** Builds a second storage implementation
  (`app/integrations/storage/…`) beside the shipped `app/services/storage.py`,
  plus `source_jobs.py` re-declaring `ingest_source`/`ocr_source` that W2-EV put
  in `workers/pipeline/jobs.py`. Rework into the storage-interface refactor on
  the backlog, or close; do not merge as-is.
- **WS-A — stopped.** It targets migration `0003` + the sources API, both
  shipped and merged today; a second `0003` would break the revision chain.

### Still open
- **W2-G (intake API)** is the last functional workstream and now unblocked —
  it also gates the parked W2-J verification commit.
- `GET /sources` filter parity remains a documented deviation.

---

## 2026-09-10 — Integrator: W2-EV merged (evidence follow-ups)

**Branch:** `arena/01a0899f-casevault` (fast-forward merge of `d235998`)

### What changed
- **W2-EV integrated.** New session `arena/01a089cb-casevault` delivered the
  Sprint 3 delta-table gaps: `POST/GET /sources/{id}/excerpts`,
  `DELETE /source-excerpts/{id}`, and `POST /sources/{id}/reprocess`
  (202 `{queued, job_id, reason}`, redis-optional), plus RQ entry points
  `ingest_source` / `ocr_source` and 4 new tests.
- Review notes: stayed exactly inside its write set; workspace-scoped excerpt
  CRUD (source resolved before every operation); no existing response shape
  changed; `GET /sources` untouched (pagination still backlog); graceful
  degradation verified — without redis the API returns 202 with
  `queued: false` and the connection reason, and the statuses remain `queued`.
- Archived the superseded Wave 1 briefs (`WS-A..WS-D.md`) to
  `handoff/notes/archive/wave1/` so nobody spawns them; the kickoff README now
  carries a live workstream-status table.

### Verified on the merged tip
- `bash scripts/verify_all.sh` → **GATE GREEN**: migrations up/down/up,
  `pytest` **21 passed**, ruff clean, web lint/typecheck/build clean.

### What the next agents must know
- **W2-E (migration 0004 + models + router stubs) is still unstarted and is the
  critical path** — F, G and J are blocked until it merges.
- Excerpts exist now, so W2-G can attach `fact_source_links.excerpt_id` to real
  rows; nothing about the intake contract changes.

### Blockers / risks
- Only one of the newly started sessions has pushed work so far (W2-EV). If a
  second session is free, W2-E is the highest-value assignment.

---

## 2026-09-10 — Integrator: agent policy + Wave 2 contract and briefs

**Branch:** `arena/01a0899f-casevault`

### What changed
- `handoff/AGENT_POLICY.md` (new, in force): the binding rulebook for agent
  sessions — roles (owner / integrator / implementer / verifier / local tester),
  how work is divided (write sets, one migration per wave per owner, hub-file
  ownership table, append-only shared files, no mid-wave response-shape
  changes), the workstream lifecycle (base branch → implement → gate → note →
  PR → ordered merge), and the coordination protocols: contract change control,
  branch/merge/conflict policy, verification, handoff notes, communication
  (repo is the channel, integrator is the hub), escalation ladder, ten hard
  rules, and the definition of done.
- `docs/contracts/wave2_intake_core.md` v1.0 (frozen): migration `0004`
  (ledger_entries incl. the `tags_json` extension, proposals, fact_assertions,
  fact_source_links / fact_actor_links with `NULLS NOT DISTINCT` uniques, five
  enums), the ledger REST contract (filters, CSV import/export, bulk ops),
  the intake REST contract (proposal review actions, facts, links, generation
  job) with the **review-state floor** spelled out, the Web/UI contracts for
  `/ledger` and `/ai-review`, the evidence follow-up endpoints (WS-EV), and the
  per-workstream verification requirements.
- `handoff/kickoff/W2-E.md` … `W2-J.md` + `W2-EV.md`: paste-ready prompts with
  write sets, proof requirements and constraints; `handoff/kickoff/README.md`
  rewritten for Wave 2 (roster, step-0 base-branch reset, environment, rules).
- `handoff/PARALLEL_PLAN.md`: §4a Wave 2 roster + critical path, Wave 3 preview
  (chronology `0005`, proof graph `0006`), readiness checklist updated.

### Why
Wave 1 proved the failure mode: a session that started before the contract
existed needed a full integration pass. Wave 2 sessions get frozen interfaces,
explicit write sets, and a binding policy before anyone writes code.

### Verified
- Docs-only change; `bash scripts/verify_all.sh` was green on the previous tip
  (migrations up/down/up, 17 tests, ruff, web build) and no code changed here.

### What needs local testing
- Nothing new for the tester this turn; the Sprint 3 Phase 2 checklist in
  `handoff/TESTING.md` remains the current local test plan.

### Blockers / risks
- Wave 2 needs 5–7 agent sessions; W2-E is on the critical path and must land
  first. If session budget is tight, merge W2-H + W2-I into one UI workstream.

---

## 2026-09-10 — Integrator: Sprint 3 merged into the integration branch

**Branch:** `arena/01a0899f-casevault` (merge commit `2e440d6`)

### What changed
- Reviewed the other session's commit `e2dc8544` against the frozen contract
  and this repo's safety posture: workspace-scoped file downloads,
  containment-checked storage resolution, 100 MB guard, scratch
  `LOCAL_STORAGE_ROOT` in tests (never writes to the real `data/` tree),
  sha256 dedupe that keeps provenance instead of deleting evidence.
- Independently reproduced the claims: fresh database →
  `upgrade head → downgrade base → upgrade head` clean and the healed
  `uq_users__email` index present; `pytest` 17 passed on their commit.
- Merged with three conflict resolutions (all in migrations + one doc):
  0002's downgrade no longer recreates `uq_users__email` (0002's upgrade no
  longer drops it, so the create collides); 0003's downgrade no longer drops
  the index (it is part of the 0001 baseline and 0003 only heals it);
  `TESTING.md` keeps both new sections.
- Aligned `docs/contracts/sprint3_evidence.md` to the shipped implementation
  with an as-shipped delta table (§ top), updated `PARALLEL_PLAN.md` wave
  status, added Wave 1 DECISIONS entries (adapter shape, duplicate policy,
  upload guard, the email-index repair, contract discipline), and logged
  Sprint 3 follow-ups in BACKLOG/KNOWN_ISSUES.

### Verified on the merged tree
- `scripts/verify_all.sh` → **GATE GREEN**: migrations up/down/up on a fresh
  DB, `pytest` 17 passed, `ruff` clean, web lint/typecheck/build (15 routes).

### What the local tester should do
- `git fetch origin arena/01a0899f-casevault && git checkout arena/01a0899f-casevault`
  (or merge it into the branch under test) and re-run `make migrate` — the
  0003 heal repairs `uq_users__email` on databases migrated by the buggy 0002.
- Then walk the Phase 2 checklist in `handoff/TESTING.md` (upload text/PDF,
  duplicate warning, include/exclude conflict, matter linking, filters).

### Blockers / risks
- The other session's branch still carries its own version of 0002/0003; it
  should reset onto this branch before further work (PARALLEL_PLAN §5 step 0).
- Python is now at 17 tests; `python-multipart` is a new API dependency
  (installed by `scripts/setup_local.sh` via requirements-dev.txt).

---

## 2026-09-10 — Phase 2 / Sprint 3: evidence ingestion (upload, storage, dedupe, viewer, pipeline stubs)

**Branch:** `arena/01a08429-casevault`

### What changed
- **Migration 0003** (schema draft §6.4): `sources`, `source_matter_links`,
  `source_metadata`, `source_pages`, `source_excerpts` + 3 native PG enums
  (source_type / source_status / evidence_review_status). VECTOR(1536)
  columns deferred per the embedding decision. Verified
  upgrade→downgrade→re-upgrade on a scratch DB.
- **Migration repair (pre-existing bugs found while testing 0003):**
  0002's upgrade had silently DROPPED the `uq_users__email` functional
  index (autogenerate artifact — the index wasn't in model metadata);
  0001's downgrade tried to CREATE an index after dropping its table.
  Fixed both, declared the index on the `User` model, and 0003's upgrade
  heals existing databases (`CREATE UNIQUE INDEX IF NOT EXISTS`). All
  downgrades now drop their enum types explicitly.
- **Storage adapter** (`services/storage.py`): local filesystem under
  `data/uploads/<workspace>/<yyyy>/<mm>/<uuid>__<sanitized-name>`; DB stores
  only the relative path; path-traversal-safe resolution; sha256 computed
  on save.
- **Source service + API** (`/api/v1`): `POST /sources` (multipart upload,
  100 MB guard), `GET /sources` (filter by matter/type/review-status +
  title search), `GET/PATCH /sources/{id}` (manual status transitions,
  include/exclude with check-constraint conflict → 409),
  `GET /sources/{id}/file` (viewer download), `/sources/{id}/pages`
  (extracted text), `/sources/{id}/matters` + `/matters/{id}/sources` +
  `/matters/{id}/source-links` + `POST /matters/{id}/sources` +
  `DELETE /source-matter-links/{id}` (link management both directions).
- **Duplicate detection**: same sha256 within a workspace → record kept
  (provenance) but `evidence_review_status=duplicate` + `duplicate_of`
  pointer in metadata; surfaced in list + detail UI.
- **Pipeline**: text/markdown/email/note sources ingest INLINE at upload
  (page written, statuses complete — no redis needed). Binary types
  enqueue best-effort onto the `ingest` rq queue (upload never fails if
  redis is down — stays `queued`). `process_source` worker job: real for
  text, explicit STUB for pdf/image (ocr_status=skipped + reason in
  metadata); `describe_image` VLM stub registered. New `make process-jobs`
  runs queued sources directly without redis.
- **Web**: `/evidence` repository page (upload form with matter link +
  proof classification, filterable/searchable list, duplicate badges) and
  `/evidence/[id]` viewer (metadata, status editing, matter links,
  extracted text per page, file open, pipeline-status hints). Matter
  detail page gained an Evidence sources card. (The /evidence nav link
  previously pointed at a non-existent route.)

### Verification
pytest 17/17 (9 new: upload/inline-ingest, duplicate flag, classification
+ worker stub, filename traversal safety, lifecycle + check-constraint
409, matter link round trip, filters/search, size guards, workspace
scoping). Ruff/eslint/tsc/next build clean (16 routes). Live in sandbox:
upload → dup → pdf → `make process-jobs` → link/unlink → pages/file →
both web pages render through the :3000 proxy.

### Local testing needed
`git pull && make migrate` (0003 applies), then exercise the Phase 2
checklist in handoff/TESTING.md — especially a real PDF upload (only fake
bytes were tested here) and `make worker` with redis up.

---

## 2026-09-09 — Local verification round: fixes from the macOS run + CI flake repair

**Branch:** `arena/01a08429-casevault`

### What changed
- **Actor search now matches aliases** (`actor_service.list_actors`):
  matches display_name, normalized_name, OR any `ActorAlias.alias_text`
  (EXISTS subquery). Regression test added — search `q=dg` for the alias
  "DG" of actor "Dana Grove", which does not substring-match any name.
  Previously the "alias search" test only exercised the display name
  (found by the local agent's code read, 2026-09-09).
- **`make test-db` no longer hardcodes `-U casevault`.** It now uses the
  container's own `$POSTGRES_USER`/`$POSTGRES_DB`, so it works against a
  fresh compose container (default superuser `postgres`) without manually
  creating a role — the exact failure the local agent hit on a fresh clone.
- **Added the missing `make migrate` target** (documented last turn but
  never implemented — the local agent had to run alembic manually). To
  make it runnable from the repo root, `apps/api/alembic.ini` now uses
  `%(here)s`-relative `script_location`/`prepend_sys_path`; the CI-style
  invocation (`cd apps/api && alembic upgrade head`) still works.
- **CI secrets-job flake fixed** (run 34319692071 failed with no leak
  present): `gitleaks/gitleaks-action@v2` now receives `GITHUB_TOKEN`.
  Root cause: without a token its owner-type lookup runs unauthenticated;
  on rate-limited shared runner IPs it fails, flipping the action into
  license enforcement (`exit 1`) even though this owner is a personal
  account. Due diligence before concluding "no leak": ported gitleaks
  8.24.3 (the action's pinned default version) rule engine to Python and
  scanned every commit diff on the branch — zero findings. Also added
  `workflow_dispatch` so CI can be re-run manually.
- **Local-agent run reports are now archived** on orphan branch
  `arena/01a08429-casevault-logs` (redacted machine/user details), starting
  with today's Phase 0/1 verification report. See DECISIONS.md.

### Why
The user's local agent executed the full Phase 0/1 runbook on macOS
(ARM, Python 3.14, Node 26, Docker Desktop): everything green — 8/8 tests,
lint, `next build` (15 routes), all Phase 1 flows — and reported the two
defects above plus the CI failure that needed diagnosis.

### Verification
pytest 8/8 (incl. the new alias-search regression), ruff/eslint/tsc/
`next build` clean, `make migrate` verified from repo root AND from
`apps/api` against the sandbox Postgres, CI green after push.

### Local testing needed
`git pull`, then on a fresh clone: `make infra-up && make migrate &&
make test-db` should now work with zero manual SQL. macOS with Homebrew
PostgreSQL: stop it first (`brew services stop postgresql@18`) — port 5432
accepts only one listener.

---

## 2026-09-08 — Local-run helper: `make test-db` + runbook refresh

**Branch:** `arena/01a08429-casevault`

Added `make test-db` (idempotent creation of `casevault_test` in the
compose Postgres) so `make test` works first try on a fresh local clone,
and refreshed `handoff/TESTING.md` start-the-stack steps and README
quickstart accordingly (includes `make env-create` + `make migrate`).

---

## 2026-09-08 — Port conflict fix: API default 8000 → 8100

**Branch:** `arena/01a08429-casevault`

### What changed
Default API port moved from 8000 to **8100** everywhere: `.env.example`,
`apps/api/app/config.py`, `apps/web/next.config.mjs` (proxy fallback),
`Makefile`, `scripts/setup_local.sh` / `.ps1`, `docs/specs` Phase 0 plan
.env block, `README.md`, `handoff/TESTING.md`, this worklog. Overrides
remain env-driven (`APP_PORT_API` / `API_BASE_URL`).

### Why
The local test machine already uses 8000 for oMLX and 4000/8080 for
LiteLLM; starting `make api` there would have collided or, worse, silently
talked to the wrong service. Decision recorded in `handoff/DECISIONS.md`.
Note: the earlier local-agent instruction block referenced :8000 — use
:8100 wherever that block said :8000.

### Verification
Live in sandbox: API on :8100, web on :3000 proxying `/api/v1` to :8100 —
health checks and matter/actor flows confirmed.

### Local note
Existing `.env.local` files should update `APP_PORT_API` / `API_BASE_URL`
to 8100 (or just delete `.env.local` and re-copy from `.env.example`).

---

## 2026-09-08 — Phase 1: workspace, matters, overlay links, actor registry

**Branch:** `arena/01a08429-casevault` · Roadmap Sprints 1–2

### What changed
- **Decision applied:** local identity mode (DECISIONS.md) — one implicit
  `Local Owner` user + default `CaseVault Workspace`, bootstrapped by
  `GET /api/v1/workspaces/current`. No login surface.
- **Backend (apps/api):** SQLAlchemy models for Groups A–C of the schema
  draft (users, workspaces, memberships, settings, matters, matter_links,
  actors, actor_aliases, matter_actor_roles); Alembic migrations
  **0001** (foundation) and **0002** (actors), verified upgrade/downgrade on
  real Postgres. Routers + services + Pydantic schemas for workspaces,
  matters (CRUD, filter, archive w/ timestamp), matter links (both
  directions, 409 on duplicates, 422 on self-link), actors (registry,
  search, aliases, dossier), matter role assignment (unique per
  matter/actor/role).
- **Frontend (apps/web):** real pages replace placeholders for Workspace
  Home (dashboard + counts), Matters (index w/ filters, new, detail w/
  linked-matters and actor-roles panels, edit), Actors (registry + create,
  dossier w/ aliases + matter roles). TanStack Query + typed API client;
  relative `/api/v1` paths proxied by Next dev server.
- **Nav:** added global "Actors" entry (dossier needs an entry point; noted
  in DECISIONS).
- **CI:** python job now runs on a postgres:16 service and applies
  `alembic upgrade head` against a fresh DB before pytest.

### Schema decisions recorded (see DECISIONS.md)
- `users.email` uses `String(320)` + functional unique index `lower(email)`
  instead of CITEXT, and pgcrypto was dropped (client-side UUIDs) — both
  CITEXT and pgcrypto require contrib modules missing from some Postgres
  distributions. pgvector extension deliberately deferred (stock
  postgres:16 lacks it; embedding decision pending).

### Builder verification (sandbox, real Postgres via pgserver)
- [x] `alembic upgrade 0001` → autogen 0002 → `upgrade head` →
      `downgrade base` → re-upgrade: all clean
- [x] `pytest` — 8 passed (identity/bootstrap, matter CRUD, two-direction
      links, actor registry + roles)
- [x] `ruff` clean; web ESLint + tsc clean; `next build` 15 routes
- [x] Live E2E on real DB: bootstrap → 2 matters → overlay link → actor →
      role → dossier (curl); web proxies `/api/v1` and renders all new pages

### What needs local testing
1. `git pull origin arena/01a08429-casevault && bash scripts/setup_local.sh`
2. `make infra-up`, then `cd apps/api && ../../.venv/bin/alembic upgrade head`
3. `make api` + `make web` — walk: create matter, mark one as `proceeding`,
   link it as `overlays`, register actor, assign role on matter page, check
   dossier at /actors
4. `make test` (needs infra up) and `make lint`

### Blockers / risks
- None known. Docker-based `alembic upgrade head` is the one step the
  sandbox could not run with the production compose path specifically.

---

## 2026-09-08 — Phase 0 repo scaffold

**Branch:** `arena/01a08429-casevault`

### What changed
- Blueprint fix-up pass applied to all six `docs/specs/` documents
  (AI-sharing defaults aligned to `no_ai` opt-in; `proposed` review-state
  floor for facts/events; `casevault` naming; roadmap sprint-math fix;
  `evidence_review_status` field alignment; UX typo).
- Phase 0 scaffold created per `Legal_Matter_Intelligence_Repo_Scaffold_Phase0_Plan.md`:
  - Safety: `.gitignore` (evidence/env/log protection), `.env.example`,
    `data/README.md` warning (only committed file under `data/`).
  - Infra: `docker-compose.yml` (postgres 16 + redis 7, localhost-bound ports).
  - API: `apps/api` FastAPI scaffold — `/health`, `/api/v1/health`, config
    loader, lazy DB engine, Alembic initialized (no domain models yet).
  - Web: `apps/web` Next.js 14 + TS + Tailwind scaffold — nav shell, React
    Query provider, `/api/v1` rewrite to the API, placeholder routes for all
    11 nav modules.
  - Workers: `workers/` RQ scaffold — queue names per Technical Spec §10.1,
    `ping`/`health_check` jobs, redis-free direct run (`make ping-job`).
  - Ops scripts: `check_env.py`, `collect_logs.py` (redaction + `-logs`
    branch flow), `backup_workspace.py`, `handoff_finish.py`,
    `seed_dev_data.py` (stub), `setup_local.sh` / `setup_local.ps1`.
  - Workflow: `Makefile`, root `package.json` (npm workspaces),
    `.github/workflows/ci.yml` (python tests, web build, gitleaks).
  - Handoff files seeded: this file, `BACKLOG.md`, `TESTING.md`,
    `KNOWN_ISSUES.md`, `DECISIONS.md`.

### Why
Phase 0 exists to make local testing with real evidence safe before any
feature code lands (safety + workflow before app code).

### What needs local testing
1. `bash scripts/setup_local.sh`
2. `make infra-up` (requires docker)
3. `make api` → `curl http://localhost:8100/health` and `:8100/api/v1/health`
4. `make web` → open http://localhost:3000, click through all nav routes
5. `make worker` (with redis up) and/or `make ping-job` (no redis)
6. `scripts/collect_logs.py --note "phase0 smoke test"` (bundle creation; no --push yet)
7. `make check-env`, `make lint`, `make test`

### Builder verification (sandbox, 2026-09-08)
- [x] `pytest` — 4 passed (API + worker smoke tests)
- [x] `ruff check apps workers scripts tests` — clean
- [x] `uvicorn` boot — `/health` and `/api/v1/health` both return `status: ok`
- [x] `python -m workers.run_ping` — ok without redis
- [x] `check_env.py` — FAIL without `.env.local` (correct), OK after
      `cp .env.example .env.local` (correct)
- [x] `collect_logs.py` bundle — secrets show `<REDACTED>` in config summary
- [x] `git check-ignore data/uploads .env.local data/diagnostics` — all ignored
- [x] `npm install` (workspaces; produced `package-lock.json` for CI `npm ci`)
- [x] web `lint` — clean; `typecheck` — clean; `next build` — 14 routes static
- [x] live boot: web :3000 serves the shell; `/api/v1/health` proxied through
      :3000 → api :8100 returns ok
- [ ] docker / `make infra-up` / real postgres+redis connectivity (not
      available in sandbox — first local test)

### Blockers / risks
- Docker not available in the build sandbox, so `infra-up` and
  DB-connectivity were NOT verified here — first thing to test locally.
- See `handoff/KNOWN_ISSUES.md` and open decisions in `handoff/DECISIONS.md`.

---

## 2026-09-10 — Parallel-build coordination (Wave 0: plan + contract freeze)

**Branch:** `arena/01a0899f-casevault` · Roadmap Sprints 3–5 planning

### What changed
- `handoff/PARALLEL_PLAN.md` (new): workstream decomposition for multi-agent
  parallel work — ownership map, merge protocol, definition of done, kickoff
  prompt template, Wave 2 preview.
- `docs/contracts/sprint3_evidence.md` (new, v1.0-proposed): frozen interface
  contract for Sprint 3 (migration 0003 schema, REST endpoints, storage keys,
  worker job payloads, web routes/types) — the coordination artifact that lets
  WS-A/B/C/D build without blocking on each other.
- `scripts/agent_pg.py` (new): embedded-Postgres harness for agent sandboxes
  with no Docker (`start | env | status | psql | stop`), using the git-ignored
  `data/pgdata/` cluster; `pgserver` stays an on-demand install, not a
  requirements entry.
- `handoff/notes/README.md` (new): per-workstream note convention so parallel
  branches don't conflict on `WORKLOG.md`.

### Builder verification (sandbox, embedded Postgres 16)
- [x] `python scripts/agent_pg.py start` → `casevault` + `casevault_test` created
- [x] `alembic upgrade head` on a fresh DB → 0001 + 0002 applied
- [x] `pytest` — 8 passed; `ruff check apps workers scripts tests` — clean
- [x] `npm ci` (workspaces) — clean install
- [x] Baseline confirmed against the contract's assumptions: `/evidence` has no
      page yet (nav links to it — logged in KNOWN_ISSUES); pgvector deferred;
      workers importable without redis.

### Decisions locked (owner, 2026-09-10)
1. This session = **integrator only** (contracts, review, merges, integration
   testing, handoff docs); feature code comes from the other sessions.
2. Topology = **separate Arena sessions**, each on its own branch, PRs based on
   `arena/01a0899f-casevault` (required: those sessions must reset onto this
   branch first — `origin/main` has unrelated history).
3. First parallel wave = **Sprint 3** (evidence/upload/OCR), contract v1.0 frozen.

### Wave-1 enablement landed after that
- `handoff/kickoff/README.md` + `WS-A..WS-D.md`: paste-ready prompts per
  workstream with write sets, proof requirements, and constraints.
- `scripts/verify_all.sh`: wave gate — fresh DB → `upgrade head` →
  `downgrade base` → `upgrade head`, pytest, ruff, web lint/typecheck/build.
- `.github/pull_request_template.md`: contract/write-set/proof checklist.
- `handoff/PARALLEL_PLAN.md` §9–§10: locked decisions + readiness checklist.

### Wave-gate findings — two real migration defects fixed
The new gate exercised `downgrade` for the first time in the project's history
and found both downgrades broken (CI only ever ran `upgrade head`):
1. **0001** — a stray autogenerated `CREATE UNIQUE INDEX uq_users__email ON
   users` at the end of `downgrade()` referenced the table dropped two lines
   above → every downgrade aborted; removed.
2. **0001/0002** — `sa.Enum` never dropped its Postgres type, so
   `downgrade base` followed by `upgrade head` failed with
   `type "sharing_policy_enum" already exists`; both downgrades now drop their
   enum types explicitly. 0002 also carried a stray `create_index` of 0001's
   unique index.

No upgrade-path or revision-id change: already-migrated local databases are
unaffected and do **not** need to be rebuilt.

### Gate result (sandbox, embedded Postgres 16, commit before this entry)
`bash scripts/verify_all.sh` → migrations up/down/up clean, `pytest` 8 passed,
`ruff` clean, web lint/typecheck/build clean (15 routes) — GATE GREEN.


## 2026-09-10 — W2-G independent review: changes requested

Reviewed PR #9, `c82e5e6`, in an uncommitted candidate merge onto `b0be226`.
Full `bash scripts/verify_all.sh` independently passed: migration round-trip,
66 pytest tests, ruff, web lint/typecheck/production build. Nevertheless the
candidate is **not approved**. The candidate merge was aborted; no G feature
code is on the integration branch. Focused synthetic/mocked probes exposed
cases absent from the suite:

1. `proposal_service._validate_refs`: when `excerpt_id` is provided without
   `source_id`, only the excerpt is loaded; its owning source/workspace is
   never checked. A foreign-workspace excerpt can be attached and exposed by
   `proposal_out`. Always validate excerpt ownership via its source, including
   the excerpt-only case; add cross-workspace API regression coverage.
2. `proposal_service.generate`: `str(db.get_bind().url)` masks a SQLAlchemy
   URL password as `***`. Synthetic URL round-trip confirmed password loss.
   Embedded socket authentication hides this defect; password-authenticated
   inline generation will receive an invalid connection URL. Preserve the
   actual connection credentials internally without logging/exposing them;
   add password-bearing synthetic URL coverage.
3. Queued generation ignores `payload.max_proposals`: the enqueue helper gets
   only source/workspace IDs and the worker defaults to 50. A mock enqueue
   probe for `max_proposals=1` confirmed only two arguments. Pass the limit
   through helper and RQ kwargs; cover queued and inline parity without Redis.
4. `FactUpdate(statement_text=None)` is schema-valid but `update_fact` calls
   `.strip()` and raises AttributeError (confirmed with a mock session).
   Reject explicit null for non-nullable PATCH fields with 422, while keeping
   omission/no-change and nullable-field clearing; audit proposal PATCH too.

W2-G owns the fixes and regression tests. Re-run the complete gate, push on
its existing session branch, and report the new PR #9 SHA. W2-J stays blocked
until the corrected G implementation is integrated. No new wave authorized.

### Remote roster checked at review time

- W2-E / EV / F / H / I: integrated; F tip `7c53b92` unchanged.
- W2-G: PR #9 `c82e5e6`, changes requested above.
- W2-I/J + WS-A: branch `arena/01a089cd-casevault` at `afef55b`; PR #3
  still mixes J verification, already-integrated I, and A's verification note.
  Needs J-only rebase/diff and merged-tip proof after G; A scope retired.
- WS-B/WS-C recovery: PR #11 `865c624`, UI delivered, awaiting integrator
  review/gate. Superseded storage PR #8 and old PR #5 are closed. Original
  WS-C and WS-B commits have remote archive refs; recovery no longer blocked.
- WS-D: PR #10 `de18118`, verification code complete but evidence sign-off
  blocked until recovered UI is integrated and tests rerun. PR #6 is closed.
  Separate older D session at `cd40299` is not another active merge candidate.
- Existing PR secret-scan configuration lacks automatic `GITHUB_TOKEN` env;
  coordinate the CI fix with verification owner, never supply a personal token.

## 2026-09-10 — evidence UI recovered (PR #11)

Merged `865c624` as `5da141c`. Full gate independently green on merge:
34 tests, migration round-trip, ruff, web lint/typecheck/build. One nonfatal
Next `<img>` performance warning. Production HTTP probes returned 200 for
`/evidence` and `/evidence/00000000-0000-4000-8000-000000000001` (route shells,
not proof of loaded source data or browser interactions); temporary server
stopped. Both pages are tracked, while `data/`, root `evidence/`, and
`uploads/` remain ignored. No backend/storage/worker changes.

WS-D PR #10 is now unblocked for merged-tip verification; no E2E sign-off
claimed yet. Recovery UI follow-ups for its owner: initialize edit values
when Status tab is entered directly (currently only Edit initializes them),
provide explicit original-file download for all types, and expose list/link/
unlink errors rather than silent failures. OCR query refresh after reprocess
is also pending. These are not claims covered by the route-shell proof.
W2-G remains blocked on review fixes; W2-J advanced to `4b21d62` and is active.

## 2026-09-10 — G fix re-review and J verification preflight

- G advanced to `c174051`. Excerpt ownership, internal password-preserving
  URL rendering, and PATCH-null validation fixes reviewed. Queue correction
  is still blocking: installed real `rq.Queue.parse_args` rejects positional
  source/workspace arguments combined with explicit `kwargs` with
  `AssertionError: Extra positional arguments cannot be used when using
  explicit args and kwargs`. The fake queue test accepts this invalid call.
  Explicit `args=(source, workspace), kwargs={max_proposals: 1}` was confirmed
  accepted by real RQ parsing (synthetic IDs, no Redis). Requested corrected
  invocation and real-parser regression test on PR #9. No merge attempted.
- J at `4b21d62` preflight found wrong repo-root calculation in standalone
  wrapper (`parents[2]` resolves to tests/), fail-open configured-DB/missing
  surface skips, metadata.create_all masking migration defects, and full DSN
  printing. Also requested an explicitly disposable DB target and fixture
  cleanup rather than automatic application-DATABASE_URL migration fallback.
  Findings posted to PR #3; final merged-tip proof still waits for G.
- Evidence recovery is still integrated at `5da141c`; WS-D and UI owner have
  their follow-up instructions. No new commits from those branches observed
  in this fetch. No verification sign-off or new feature wave authorized.

## 2026-09-10 — W2-G approved and integrated

Reviewed `93656db` (PR #9): uses RQ's supported explicit args/kwargs form.
Replacement regression test drives real Queue.enqueue/parse_args, stubbing
only the connection-touching boundary, and covers supplied/omitted caps.
This closes the remaining RQ follow-up; the original four review findings
are addressed by this commit plus `c174051`.

Merged as `4d13527` with no conflicts, including the previously recovered
Evidence UI. Full gate passed independently on candidate AND committed
merge: 72 tests, migration upgrade/downgrade/re-upgrade through 0004, ruff,
web lint/typecheck/build. Existing nonfatal image-performance warning and
two upstream Python deprecations remain. No real Redis execution was proved
by the new parser regression; end-to-end verifier remains responsible for
that distinction. W2-J is now unblocked for final merged-tip proof, subject
to its own outstanding preflight corrections on PR #3.

Remaining G limitations are in its handoff: fact review-state notes are
accepted but not persisted pending audit storage; generation queued results
report created/skipped as zero (not completed counts). These are not claims
of complete audit support or completed asynchronous execution.

## 2026-09-10 — W2-J corrected verifier independently checked

SHA correction: `c174051` belongs to W2-G; current W2-J PR #3 head is
`da2a5cf`. Reviewed J-only diff (five files) and temporarily merged onto
`908e96f` to test against integrated G plus evidence recovery. Results:
- `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1 bash scripts/verify_all.sh`: 87
  passed, migration round-trip, ruff, web lint/typecheck/build green.
- Standalone guard + E2E pytest with explicit scratch test DB: 15 passed.
- `python scripts/intake_smoke.py --require-intake`: SMOKE GREEN; reported
  cleanup of 23 synthetic rows. No external PYTHONPATH overrides needed.
Candidate merge aborted after review; J is NOT integrated yet. Agent may
proceed with rebase/final proof against current integration and handoff update.
Earlier import, configured-DB failure, schema-healing, credential display and
DB fallback concerns addressed. Caveat: cleanup remains best-effort, logging
failures without changing green status; final proof must distinguish cleanup
failure from success (prefer failure status in required/CI mode). CI automatic
gitleaks-token fix remains WS-D-owned and absent from this J-only change.

## 2026-09-10 — W2-J integrated; real-worker regression escalated

Merged PR #3 head `5755cc3` as `a4e20f0`. Full strict gate independently green
on candidate and committed merge: `INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1 bash
scripts/verify_all.sh` -> 93 tests, migrations round-trip, ruff, web lint,
typecheck/build. Existing image performance warning remains. J-only five-file
diff preserves evidence recovery and G implementation. New verifier checks
queued job results/committed proposals, not RQ FINISHED alone; cleanup failure
handling and negative tests are included. Local green uses deterministic
inline generation; it is NOT a claim the normal worker path is green.

**New product blocker (found by J, independently reproduced):** in a fresh
Python process with PYTHONPATH unset, importing the intake job and invoking it
returns `status=failed`, `ModuleNotFoundError: No module named 'app'`. The normal
worker bootstrap does not add apps/api to its import path. Existing pytest
pythonpath hides the defect; RQ labels a non-raising failed-result job FINISHED.
G was assigned a focused bootstrap fix plus fresh-subprocess and real-worker
proof on a new PR (posted to merged PR #9). Never-raise contract is unchanged.
W2-J is integrated as verification, not Wave 2 sign-off; queued verification
must rerun without PYTHONPATH workaround after G fixes the product.

WS-D `f9f1838` exists on new session branch `arena/01a08a04-casevault`, while
PR #10 still points at old `de18118`. The new deliverable includes the narrow
automatic-token CI change. Its reported remaining PR-event gitleaks failure
has no available detailed log; cause remains UNKNOWN, not established as a
permissions issue or established as absence of a secret. No broad permission
change approved on speculation. WS-D merge/review remains pending.
Evidence UI follow-up is still not visible in fetched remote refs.

## 2026-09-10 — normal intake worker bootstrap fixed (PR #13)

Reviewed `fac1568` and merged as `e3332bd`. The job now calls existing
`_ensure_app_importable()` before any app-model imports, within the existing
never-raise boundary. No hub/migration/contract changes. New fresh-subprocess
regression unsets PYTHONPATH and asserts app is initially unavailable, then
verifies committed counts for limits 1, 2 and an idempotent repeat. Separate
bootstrap-failure test preserves failed-result behavior.

Independent strict full gate passed on candidate and committed merge:
95 tests, migrations upgrade/downgrade/re-upgrade, ruff, web lint/typecheck/build.
Existing image-performance warning and Python deprecations remain. Agent's
handoff includes real Redis/normal-worker proof with result=complete and
scoped cleanup; integrator independently ran subprocess/DB coverage but has
not repeated that live Redis proof. J instructed to rerun normal-worker queued
verification on this merge without any PYTHONPATH workaround. Original import
blocker fixed; final queued-flow sign-off remains pending independent J proof.

## 2026-09-10 — all-branch reconciliation audit

See BRANCH_RECONCILIATION.md for every fetched origin branch and disposition.
Not fully reconciled: WS-D PR 14 open with failing secrets check; J has five
post-merge commits at 55e6d10 including real smoke-script changes; UI follow-up
patch remains incomplete/unmerged. Closed superseded PR 10 (preserved branch)
and requested J follow-up PR plus current-tip proof. Main/dev-logs unrelated
histories and archive branches are intentionally not merged. No feature code
changed; no branch deleted/switched.

## 2026-09-10 — queued proof completed; J follow-up reconciled

Reviewed and integrated J successor head `b6e7b44` as `15174cd` (four-file
verification/note diff). Follow-up adds explicit cap/bulk/link assertions,
queued result checks, and required-mode cleanup failure propagation. Full
strict gate passed on candidate and committed merge: **96 tests**, migrations,
ruff, web lint/typecheck/build. No product code or CI edits in this merge.

Independent integrator real-worker proof used Redis 6.2.14 from sandbox-only
redislite (no dependency manifest changes), private nonpersistent Unix socket
`.cache/integrator-redis/redis.sock`, and normal `python -m workers.run_worker`
with PYTHONPATH unset and DATABASE_URL pinned to disposable casevault_test.
- Existing integrated smoke: initial result complete, created=3; repeat complete,
  created=0/skipped=3; queried actual RQ results, not FINISHED alone.
- J follow-up smoke: jobs `4fab1f06-3491-4976-8018-c415d57fec5c` and
  `70237263-c4ea-47b6-9658-bc503038b848` passed generation/repeat checks.
- Cap job `16628e0d-7560-417d-99f4-180f91d3490f`: cap=2, result complete,
  created=2/skipped=1, committed count=2. No import-path workaround.
- Smoke reported cleanup of 24 synthetic rows; worker stopped, private Redis
  stopped with persistence disabled, socket removed; subsequent gates recreated
  disposable casevault_test. No shared queues used and no real evidence.
This closes the normal-worker queued verification blocker independently.

## 2026-09-10 — WS-D candidate verified but secrets check unresolved

PR #14 head `0b3ce1c` candidate against `7dd8e91`: clean merge, strict gate
**98 tests** green including real Redis and offline evidence scenarios. Separate
standalone evidence suite: **3 passed**, 25 checks, 8 explicit original-v1 gaps,
0 scenarios skipped. Synthetic artifacts and schema isolation verified by suite;
reprocess 202 and original-byte equality in both modes. Candidate merge aborted;
WS-D still not integrated. Current J follow-up would add one more guard test.

Retried CI diagnostics: secrets annotations contain only Node deprecation;
detailed Actions log fetch still EOF. Cause unknown. No scanner bypass or
speculative token permission expansion. Request WS-D/owner obtain the actual
failing gitleaks step output before approving PR #14. Evidence UI follow-up
also remains incomplete. Wave 2 final sign-off not claimed.

## 2026-09-10 — secrets-check diagnosis continued (no bypass)

No new feature branches pushed since last fetch. Integration push CI at
`a454461` is successful (run 34450422380); this does not clear PR #14's
separate failing pull_request secrets check. Run 34449294532 secrets action
fails in ~2 seconds; only artifact is evidence-verification, no gitleaks SARIF.
Upstream v2 action source reads PR commits before scanning; writing review
comments is only attempted after findings. This narrows investigation but
establishes neither a permission fault nor absence of findings.

Attempted `gh run rerun 34449294532 --failed`; GitHub/CLI refused with generic
"cannot be rerun; its workflow file may be broken". No successful retry was
launched, no workflow corruption concluded. Detailed log download remains
unavailable; annotations contain only Node deprecation.

WS-D authorized via PR #14 comment to add token-presence boolean and PR-commit
API HTTP-status preflight diagnostics to step summary, without response bodies,
credential output, permissions changes, or weakening scanner failure behavior.
Owner may instead supply redacted failing action output from GitHub UI. No
product changes or additional merges in this diagnostic pass.

## 2026-09-10 — secrets CI root cause confirmed; least-privilege fix

Owner supplied redacted failing PR #14 action output. Gitleaks installed from
cache, then GET /repos/drivedigital/casevault/pulls/14/commits returned 403,
with `x-accepted-github-permissions: pull_requests=read`. This establishes a
PR-metadata permission failure before scanning, not a Node deprecation issue.
It does not establish that the unexecuted scan would find no secrets.

Integrator added only secrets-job-scoped `contents: read` and
`pull-requests: read`, plus automatic GITHUB_TOKEN env to the existing action.
No write permissions, personal credentials, scanner bypass, or insecure Node
fallback. Token env overlaps WS-D's pending change; preserve one block on
rebase. YAML parsed; assertions confirm python/web/intake jobs unchanged,
read-only job scope, scanner intact; git diff --check passes. Product gate
not rerun for this workflow-only repair. PR-event verification must run on
WS-D's rebased head before claiming the secrets check is green.

## 2026-09-10 — local crash logs reviewed

Fetched dev-logs `79ca457`; both error reports share Objective-C fork-child
abort during libpq Kerberos/GSS credential discovery on ARM macOS/Python 3.14.
Recorded platform-specific issue and scoped local diagnostic in KNOWN_ISSUES.
No raw machine identifiers/logs copied into integration. Commands/tested SHA
still needed. Worker-owner follow-up: spawn-safe Darwin worker selection,
version-compatible dependency plan, normal Linux worker behavior preserved,
no blanket fork-safety or transport-security disable. User local reproduction
required; this Linux sandbox cannot validate native macOS fix.

### macOS crash trigger clarified by local tester

Clicking **Reprocess OCR** displays `Reprocess request accepted: queued as job
77779216-6a80-444b-b7cc-c105a3dba1cb`, followed by the native crash reported in
dev-logs 79ca457. This ties the failure to the queued OCR workflow: API enqueue
succeeds, then worker-side native DB/GSS initialization aborts. HTTP 202/queued
is not OCR success. Worker launcher command and current SHA still unreported;
macOS-safe worker fix must test this exact UI -> queue -> worker flow, not only
proposal generation. Do not weaken original-file preservation or mark OCR
complete on enqueue. Local tester should avoid repeated enqueue until worker
strategy/diagnostic is in place; failed/queued statuses need explicit inspection.

## 2026-09-10 — W2-W integrated with dependency floor and qualified proof

Recovered stale local Git metadata without discarding restored integration
content: compared with remote 433db40 using a temporary index, backed up the
restored diff/untracked files outside the repo, reconciled the session branch
and restored two missing remote additions (CI permissions and OCR crash report).
Then merged PR #16 head 6575372 as f9e6a1c, including integrator-requested
rq>=2.2,<3 floor and corrected Linux-vs-Mac environment-proof wording.

Fresh dependencies installed; RQ 2.12.0 exposes SpawnWorker. Independent full
strict gate passed on candidate AND committed merge: 116 tests, migration
upgrade/downgrade/re-upgrade through 0004, ruff, web lint/typecheck/build.
Existing image-performance warning and two upstream Python deprecations remain.
No native macOS execution performed: local tester must still verify normal
Darwin launcher selects SpawnWorker and runs two sequential OCR jobs without
SIGABRT. No blanket fork-safety, GSS, or TLS override introduced.

## 2026-09-10 — WS-D integrated; Mac report reconciled

Reconciled restored worktree against remote 04e84cf (only missing new Mac report),
backing up restored content before metadata alignment. Merged WS-D PR #14 head
0b3ce1c as 57e5ae6. CI conflict was comments around the already-integrated token
block; kept one token block, both intake/evidence jobs and scoped PR read access.
Also corrected invalid newer root permission `contents: write-all` (from 433db40)
to `contents: read`. No write grant or scanner bypass. YAML validation asserts all
five jobs and read-only permissions. Full strict gate passed candidate AND merge:
119 tests, migration round-trip, ruff, web lint/typecheck/build; real private
Redis and offline evidence scenarios required (no dependency skips). Existing
image-performance warning and two Python deprecations remain. GitHub execution
of the repaired workflow still pending; old PR check predates this repair.

Reviewed local Mac report 04e84cf: two PDF uploads stable on Python 3.12.14 +
SpawnWorker, OCR skipped, byte preservation reported. Resolved malformed full
SHA from its unambiguous 4672182 prefix; removed case-identifying filename and
checksum from current report (historical Git versions still retain them).
Scoped conclusion: mitigated in tested configuration, not proof of Python 3.14
or original Reprocess OCR click sequence. Request exact sequence on synthetic
fixtures before native reproduction closure. No Mac execution by integrator.

## 2026-09-10 — new evidence UI closure assignments frozen

Created evidence_ui_closure.md v1.0 before new sessions start, plus EU-D/EU-L/
EU-V/EU-M paste-ready briefs. Explicitly split by files: one owner for the entire
detail page, one for list, independent browser verifier, local report-only tester.
Specified dirty-draft behavior, downloads and attachment-safe PDF preview, errors,
bounded OCR polling, native Mac exact reproduction, synthetic-only proof, tooling
approval and strict hub ownership. No dependency/CI/product edits in this planning
change. Suggested agent reuse recorded; owner confirmation of actual sessions
still needed. Wave 3/OCR engine remains unauthorized.

## 2026-09-11 — EU-D/L/V integration review, revisions required

Fetched all three PR heads; reconciled stale restored Git metadata safely.
EU-L and EU-D candidate full strict gates independently passed 119 tests plus
migrations/ruff/web. Targeted actual-browser fault-injection probes nevertheless
found pending-drop duplicate upload (L), unbounded file-body wait and late preview
object-URL leak after unmount (D). D OCR timeout also lacks real fetch abort.
EU-V preparation has reproduced managed-browser ESM resolver failure and startup
DB-leak path, plus unsafe node_modules removal and DSN output/platform issues.
All candidate merges aborted, no product code integrated. Fix requests posted to
PRs 17/18/19. Detailed proof and scope approvals: EVIDENCE_UI_REVIEW.md. EU-V final
acceptance tests remain future work after corrected D+L merge; local native PDF
proof remains separate. Preview servers stopped; scratch dependencies only.

## 2026-09-12 — EU-L revision still blocked; local testing deferred

Reviewed PR 17 revision 6bd3cdf against 7ed39b1. Independent strict gate 119 passed
(no skips), migrations/Ruff/web green. Browser confirms original rapid double-drop
fixed but reproduces TWO pending uploads after failed upload -> same-tick Retry +
drop. Retry bypasses new synchronous guard. Requested centralized submission path
and regression on existing PR (comment 5644130294); candidate aborted, no merge.
See EVIDENCE_UI_REVIEW.md for exact proof/limits. Owner explicitly holds EU-M and
local environment startup until substantive integrated testing point; no Phase A
request now. Integrator to supply exact corrected D+L SHA/checklist then.


## 2026-09-12 — EU-D #18 accepted / merged c8c7d27

Reviewed b041694 against 0f9e498; strict candidate and post-merge gates both
119 passed/no skips, migrations/Ruff/web green. Independent full detail browser
suite: workerless 25 passed/2 worker-only skipped, then both worker-only tests
passed with real isolated Redis/RQ Worker. Verified TXT complete/PDF skipped
result payloads against persisted state, not just RQ FINISHED. Lifecycle
regressions pass (labelled injection); native PDF capability remains unverified.
Details, exact commands/config/log references and synthetic job IDs in
EVIDENCE_UI_REVIEW.md. Temporary review services stopped, browser DB/storage
cleaned. EU-L retry-lock correction pending; EU-V still working and may base on
merged D; EU-M remains explicitly held until substantive integrated checkpoint.


## 2026-09-12 — EU-L merged; D+L checkpoint a040e9f released

Accepted PR17 revision14f4491, merged a040e9f. Exact independent Retry+drop probe
now single-flight. Pre/post strict gates119 pass/no skips, migrations/Ruff/web
pass. Combined browser suites43 pass/2 worker-only skips (18L+25D); no combined
worker or native PDF claim. Review artifacts and scope in EVIDENCE_UI_REVIEW.md.
Owned temporary API/web/DB/storage cleaned. EU-V final acceptance unblocked on
pinned D+L SHA; EU-D inactive, EU-L complete. Owner started a new local EU-M:
substantive integrated checkpoint and report-only checklist EU_M_CHECKPOINT.md
now supersede timing hold. No feature/worker/dependency edits assigned to tester.

## 2026-09-12 — EU-V interruption handling; local-ops proposal isolated

Owner reports AI-service-busy interruptions; endorsed EU-M continuation guidance
on PR19 (comment 5647767837). Verifier checkpoint3499164 is based on e3e0b76;
final acceptance still pending, measured results only, preserve existing runs.
Fetched local-ops proposal0159466 on codex/local-ops-safety, no merge/branch switch.
Independent external-tree unit run13 passed (synthetic/mocked only). Confirmed
new guard rejects embedded PG socket URL, breaking supported strict-gate path.
Separate review/PR required for shared fixture/gate and operational tools; see
LOCAL_OPS_REVIEW.md. No real backup, recovery, webhook or Mac-state proof claimed.
EU-M evidence checkpoint remains a040e9f with e3e0b76 checklist; local-ops proposal
must not be folded into verifier scope or treated as evidence acceptance.

## 2026-09-12 — final review patches recovered from dev-logs54001f0

Reviewed cumulative EU-D/EU-L patches; reconstructed only in isolated temp indexes.
Product targets already integrated; older shared docs excluded. Imported only
EU-D-LIST-REVIEW and EU-L-OCR-REVIEW archival notes with caveats. Neither is a
completed checkpoint review. Corrected OCR plan: TXT upload is inline, explicit
ocr_source job required; status=failed payload can accompany RQ FINISHED. Details
in REVIEW_PATCH_INTAKE.md. EU-V2c360a1 has further reported full/partial counts,
not independently validated; diagnostic-first requirement stands. EU-M remains
ON HOLD under latest owner instruction; prior release text is superseded.
No product changes, full patch replay, dev-logs merge, or acceptance claim.

## 2026-09-12 — documentation / task / workflow / recovery audit

Audited integration0788ccc against actual files, PR19 head2c360a1 and hosted CI.
Added STATUS.md single current-state entry point, RECOVERY.md interruption/stale
metadata/closed-session/patch/data-safety runbook, VERIFICATION_WORKFLOWS.md exact
coverage and destructive-target caveats. Updated README, policy, kickoff roster,
backlog, testing, issues/decisions and PR template; historical records labelled.
Removed active hard-reset/force-push and automatic diagnostic-push recipes. Corrected
stale evidence404, excerpts/reprocess, ledger/inbox and0004/0005 planning claims.
EU-M hold and diagnostic-first EU-V task preserved; no reactivation of closed D/L.
Confirmed GitHub run34720445577 at0788ccc: all five jobs success (push event; no
browser/native or future-commit assurance). Documented actual integrated backup
DSN/missing-dump hazards and test DB fallback; no runtime safety code changed and
local-ops proposal remains unmerged. Documentation completeness does not mean
acceptance/recovery drill complete. Content/link/diff checks only; no test stack,
real backup, destructive gate or local integration run requested/performed.

Audit validation: all25 relative Markdown links checked in the initial changed-doc
set resolved; final added STATUS.md link also verified. `git diff --check` clean.
Scope check confirms documentation/PR template only; CI YAML, scripts, Makefile,
product code and manifests untouched. Runtime risks remain open backlog items.

## 2026-09-12 — EU-V short diagnostic complete, not final acceptance

Reviewed PR19 head3c405cf; only list spec/note changed since2c360a1. Corrected
L1.5 observes mutation-triggered background GET failure and requires exact retained
row/stale chip. Agent reports T1 1 pass + L1.5 1 pass; earlier zero-test selectors
and failed focus draft remain separate. No independent runtime rerun this turn.
Original list14/6 is not retrospectively15/5; five other failure groups and detail/
OCR proof remain open. Next bounded L2.5 + row-badge L3.2–3.4 assigned on PR19
comment5648897894 (30min work/5min tests/no retries). No product or verifier merge;
EU-M hold remains. Status/backlog/roster updated; documentation diff-check only.

## 2026-09-12 — verify OCR boundary; release limited owner preview, new briefs

Rechecked actual a040e9f process_source and ocr_source: PDF/image branch explicitly
sets skipped with no OCR engine wired; preview/queue success is not extraction.
User-supplied3c405cf is same previously reviewed EU-V short-batch head, PR19 open.
Clarified implementation scope: evidence lifecycle complete, actual PDF/image OCR
not implemented. Renewed limited synthetic owner-preview release/checklist added
OWNER_PREVIEW.md, exact producta040e9f, mandatory disposable-target preflight; no
real evidence, destructive gate, backup/restore, unmerged scripts or acceptance
claim. Full acceptance held; EU-V continues bounded list work in parallel.
Prepared two disjoint fresh-session briefs PV-GATE (focused preview proof) and
OCR-PLAN (design only), <=45min each, own assigned branches/new PRs/no self-merge.
No agent-launch tool available here: sessions not spawned, owner relay required.
No product, dependency, CI or runtime safety changes; no local tests executed.

## 2026-09-12 — EU-V e7fe31e reviewed; disclosure fix separated from verification

PR19 e7fe31e reports exact bounded batch exit1: L2.5 pass, L3.2–3.4 fail (24.5s).
Filter/query preservation after actual failed PATCH/retry verified by author;
accessible badge error/recovery also worked but injected traceback/SQL rendered.
Source review confirms list describeError returns arbitrary Error.message. No
independent browser rerun here or real-data leak claim. seedSource now anchors
actual POST response ID; other dependent suites not rerun. PR19 stays unmerged.
Prepared EU-ERR third fresh-agent brief for narrow error mapping + regression,
not launched here. EU-V next bounded task is RQ reader/async wait + two real OCR
fixture cases, not product fixes or full suite. OCR-PLAN PR20 head61da3b4 exists,
design review pending; PV-GATE report not yet observed. Limited synthetic owner
preview remains allowed with warning; real-data/full acceptance remain held.
Restored metadata reconciled to2b7381e after backup and temp-index exact comparison.

## 2026-09-12 — OCR-PLAN reviewed; PV-GATE artifact requested

Reviewed full design-only PR20/61da3b4. Direction native-text-first accepted in
principle, but concurrency guard can be defeated by API requeue, parser limits
not enforceable as described, retained-page/count and mixed-coverage semantics
inconsistent, public exception reasons unsafe, and CI/test migration underspecified.
Changes requested comment5649440419; note-only<=45min, no merge/engine approval.
Details OCR_PLAN_REVIEW.md. Fetched all heads/open+recent PRs and dev-logs; PV-GATE
submission not visible. Requested PR URL/commit SHA rather than inventing results.
No runtime tests or product changes; limited synthetic preview remains unchanged.


## 2026-09-12 — EU-ERR/OCR-PLAN/PV-GATE/EU-V batch review

Reviewed EU-ERRb78fa82, original OCR-PLAN2b6688a, PV319120e+61da3b4 and EU-V5e925be.
PV found in combined PR20 chain (corrects prior missing-artifact report); OCR note
unchanged from prior review. Comments posted21/5649550926,19/5649551022,20/5649551113.
EU-ERR narrow old-test alignment authorized; preserve no-raw-detail policy. PV
bridge unbounded sync/diagnostic output needs fixes. V supported result decode is
improved with author-reportedTXT/PDF passes; restore image coverage and child safety.
No product merge/runtime rerun; details BATCH_REVIEW_2026_09_12.md. Limited synthetic
preview unchanged; final acceptance/engine approvals pending. Single PR20 writer
required; no retired/session branch takeover or concurrent push/rebase.


## 2026-09-12 — revised reviews, independent gate and EU-ERR merge

Reviewed EU-ERR7ac87d7, EU-V575d771, combined OCR/PVd1a504f. Independently ran
strict119/no skips22.69s + migration/Ruff/web gate and25 browser/no skips28.2s
on exact PR21 candidate archive. Initial browser missing-library launch failed;
private tooling corrected, no product/test edits. PR21 merged a21ea34; exact
runtime/test tree matches candidate. Owned API/web/PG stopped, data removed.
PR21comment5649648819, EU-V bounded run authorization5649648897, PR20review5649650869.
OCR proposal accepted only as exploration and parked; PV sole remaining writer,
needs fixed-code errors (synthetic JSON password/trace sentinel survived sanitizer),
output caps and small negative checks +3-case rerun. PR20 title/body corrected.
OWNER_PREVIEW pin advanced to a21ea34 under unchanged synthetic isolation limits;
old PV proof retains old SHA, detail error disclosure remains a known separate gap.
Full acceptance/engine/local-ops gates unchanged. See REVIEW_REVISIONS.md.

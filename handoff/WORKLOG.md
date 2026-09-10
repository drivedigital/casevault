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

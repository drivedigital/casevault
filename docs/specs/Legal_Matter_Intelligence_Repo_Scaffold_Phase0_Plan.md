# Legal Matter Intelligence Workspace — Repo Scaffold / Phase 0 Implementation Plan

**Status:** Pre-build implementation plan  
**Purpose:** Define the repository scaffold, local-development foundation, safety controls, and handoff workflow before feature development begins.  
**Build status:** Planning only — this document does **not** assume code generation has started.

**Companion documents:**
- `Legal_Matter_Intelligence_PRD.md`
- `Legal_Matter_Intelligence_Roadmap.md`
- `Legal_Matter_Intelligence_Technical_Spec.md`
- `Legal_Matter_Intelligence_UX_Spec.md`
- `Legal_Matter_Intelligence_Database_Schema_Draft.md`

---

## 1. Phase 0 Goal

Phase 0 exists to make the project:
- safe for local testing with real evidence
- easy to run locally
- structured for incremental full-stack development
- ready for remote-agent/local-user handoff
- protected against accidental Git publication of evidence, logs, secrets, and derived artifacts

Phase 0 should end with a clean, working repository skeleton and developer workflow, but **without building product features yet**.

---

## 2. Phase 0 Deliverables

By the end of Phase 0, the repository should contain:

1. monorepo scaffold
2. `.gitignore` with strong legal-data protections
3. `.env.example` and env strategy
4. Docker Compose setup for core services
5. frontend app shell scaffold
6. backend API scaffold
7. worker scaffold
8. shared package folders
9. `handoff/` workflow files
10. tracked `handoff/diagnostic_bundles/` share path
11. local setup scripts
12. log collection script skeleton
13. README with local startup instructions
14. branch and handoff protocol docs
15. initial dependency manifests
16. basic health-check routes/process wiring

---

## 3. Recommended Repo Structure

```text
legal-matter-intelligence/
├── apps/
│   ├── web/                        # Next.js frontend
│   └── api/                        # FastAPI backend
├── workers/
│   ├── pipeline/                   # OCR, extraction, embeddings, proposals
│   ├── ai/                         # agent-run workers
│   └── connectors/                 # MCP / external connector jobs
├── packages/
│   ├── ui/                         # shared UI components
│   ├── types/                      # shared TS types / API client types
│   ├── prompts/                    # prompt templates + versions
│   ├── schemas/                    # JSON schemas / validation contracts
│   └── config/                     # shared defaults/config helpers
├── scripts/
│   ├── setup_local.sh
│   ├── setup_local.ps1
│   ├── collect_logs.py
│   ├── handoff_finish.py
│   ├── check_env.py
│   └── seed_dev_data.py
├── handoff/
│   ├── WORKLOG.md
│   ├── BACKLOG.md
│   ├── TESTING.md
│   ├── KNOWN_ISSUES.md
│   ├── DECISIONS.md
│   └── diagnostic_bundles/        # tracked sanitized log bundles
├── docs/
│   ├── architecture/
│   ├── prompts/
│   ├── connectors/
│   └── specs/
├── infra/
│   ├── compose/
│   ├── docker/
│   └── env/
├── data/                           # ignored by git
│   ├── uploads/
│   ├── processed/
│   ├── ocr/
│   ├── exports/
│   ├── diagnostics/
│   ├── logs/
│   └── vector/
├── tests/
│   ├── api/
│   ├── web/
│   ├── workers/
│   └── integration/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
├── README.md
├── package.json                    # workspace root if using pnpm/turbo
└── pyproject.toml or requirements files
```

---

## 4. Recommended Stack for the Scaffold

### Frontend scaffold
- Next.js
- TypeScript
- Tailwind CSS
- TanStack Query
- TanStack Table
- React Hook Form
- Zod

### Backend scaffold
- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic

### Infra scaffold
- PostgreSQL
- Redis
- Docker Compose

### Worker scaffold
- Python worker process using RQ or Arq

### Testing scaffold
- pytest
- Playwright
- optional Vitest later

---

## 5. `.gitignore` Requirements

Phase 0 must include a strong `.gitignore` before any real local testing begins.

### Minimum ignore set

```gitignore
# env / secrets
.env
.env.*
!.env.example

# node / frontend
node_modules/
.next/
out/
coverage/

# python
.venv/
__pycache__/
.pytest_cache/
.mypy_cache/

# local data / evidence / derived artifacts
data/
uploads/
evidence/
exports/
logs/
tmp/
cache/

# db files if local sqlite ever used
*.sqlite
*.sqlite3
*.db

# misc
.DS_Store
.vscode/
.idea/
```

### Required note
The README should explicitly tell the user that `data/` holds sensitive local evidence and must never be committed.

---

## 6. Environment Strategy

## 6.1 Required files
- `.env.example` committed
- `.env.local` ignored
- `.env.test` optional and ignored unless intentionally shared without secrets

## 6.2 `.env.example` should include placeholders for
- app ports
- database URL
- Redis URL
- storage root
- app secret keys
- AI provider keys placeholders
- optional local model base URL
- MCP timeout and connector defaults

### Example sections
```env
APP_ENV=development
APP_PORT_WEB=3000
APP_PORT_API=8000
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:8000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/legal_matter_intelligence
REDIS_URL=redis://localhost:6379/0
LOCAL_STORAGE_ROOT=./data

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

MCP_DEFAULT_TIMEOUT=30
```

---

## 7. Docker Compose Plan

Phase 0 should include a `docker-compose.yml` with at least:
- postgres
- redis

Optional in Phase 0:
- api
- web
- worker

### Recommendation
Start by containerizing infrastructure first, while allowing app processes to run locally during early development.

### Minimum Compose services
#### `postgres`
- image: `postgres:16`
- exposed port: `5432`
- volume for persistent local dev data

#### `redis`
- image: `redis:7`
- exposed port: `6379`

### Acceptance criteria
- one command starts Postgres and Redis locally
- API and worker can connect via `.env.local`

---

## 8. Root Tooling Plan

## 8.1 Makefile targets
Recommended initial targets:
- `make infra-up`
- `make infra-down`
- `make web`
- `make api`
- `make worker`
- `make test`
- `make lint`
- `make logs`
- `make check-env`

## 8.2 Setup scripts
Create:
- `scripts/setup_local.sh`
- `scripts/setup_local.ps1`

These should eventually:
- validate required tools
- create `data/` directories
- guide `.env.local` creation from `.env.example`
- install frontend/backend dependencies
- start or instruct how to start infra

At Phase 0, script stubs with clear TODOs are acceptable.

---

## 9. Initial App Scaffolds

## 9.1 Frontend scaffold expectations
`apps/web` should contain:
- Next.js app scaffold
- global layout
- placeholder navigation shell
- placeholder pages for:
  - Workspace Home
  - Matters
  - Evidence
  - Chronology
  - Claims
  - Relief
  - Research
  - Drafting
  - AI Review
  - Tasks
  - Settings

### Phase 0 rule
These can be placeholders only; the goal is route structure, not full UI.

---

## 9.2 Backend scaffold expectations
`apps/api` should contain:
- FastAPI app scaffold
- `/health` endpoint
- config loader
- base app module layout:
  - routers
  - services
  - models
  - schemas
  - db
  - integrations

### Minimum route set
- `GET /health`
- `GET /api/v1/health`

No domain endpoints need to be implemented in Phase 0.

---

## 9.3 Worker scaffold expectations
`workers/` should contain:
- queue bootstrap
- config loading
- placeholder job registration
- one test job such as `ping` or `health`

### Goal
Prove the app can support background jobs later.

---

## 10. Database Scaffold Plan

Phase 0 should prepare the database layer, but not yet implement the full schema.

### Include in Phase 0
- DB connection setup
- Alembic configuration
- migration directory initialized
- base model metadata
- optional first trivial migration (e.g., migration test table or extension setup)

### Do not require yet
- full production schema
- all domain models

### Preferred first migration scope
- enable extensions if feasible
- optional `users` and `workspaces` base tables, but only if implementation is about to begin immediately

If remaining purely in planning mode, it is acceptable to stop before real migrations.

---

## 11. Shared Packages Plan

## 11.1 `packages/ui`
Purpose:
- shared UI primitives later
- status badges
- link chips
- inspector panels

Phase 0:
- create folder and README or placeholder package only

## 11.2 `packages/types`
Purpose:
- shared TS types
- generated API types later

Phase 0:
- create folder and placeholder index

## 11.3 `packages/prompts`
Purpose:
- versioned prompt storage
- prompt manifest structure

Phase 0:
- create directory taxonomy only

## 11.4 `packages/schemas`
Purpose:
- JSON schemas and shared validation contracts

Phase 0:
- create folder and naming convention doc

---

## 12. Handoff / Collaboration Files

These should be created in Phase 0 and committed.

## 12.1 `handoff/WORKLOG.md`
Should include sections:
- Date / turn
- Branch
- What changed
- Why
- What needs local testing
- What feedback/logs are needed next

## 12.2 `handoff/BACKLOG.md`
Should include:
- P0 foundations
- P1 core features
- P2 intelligence features
- P3 polish
- Bugs by severity
- Open product decisions

## 12.3 `handoff/TESTING.md`
Should include:
- local prerequisites
- startup steps
- test checklist
- log collection instructions

## 12.4 `handoff/KNOWN_ISSUES.md`
Should include:
- current limitations
- known failures
- temporary workarounds

## 12.5 `handoff/DECISIONS.md`
Should include:
- stack decisions
- local-first evidence policy
- AI sharing defaults
- MCP connector posture

---

## 13. Log Collection Script Plan

Phase 0 should define and scaffold, but not necessarily fully finish, `scripts/collect_logs.py`.

### Responsibilities
- gather web/api/worker logs when available
- gather system/env summary
- redact secrets
- warn about possible sensitive evidence content
- package raw logs into `data/diagnostics/<timestamp>/`
- generate a sanitized share bundle under tracked `handoff/diagnostic_bundles/<timestamp>/`
- prepare the `-logs` branch workflow around the sanitized bundle only

### Minimum Phase 0 requirement
- script file exists
- CLI usage documented
- TODO markers for later implementation

### Sample intended usage
```bash
python scripts/collect_logs.py --feature feature/phase0 --note "API failed to start"
```

---

## 14. Branching and Handoff Protocol

## 14.1 Branch conventions
- `main` = stable branch
- `feature/<topic>` = active build branch
- `feature/<topic>-logs` = user-generated diagnostic branch

## 14.2 Required end-of-turn protocol for the remote coding agent
At the end of each development turn:
1. update `handoff/WORKLOG.md`
2. update `handoff/BACKLOG.md`
3. commit changes
4. push branch
5. provide local testing instructions
6. specify what logs/feedback are needed
7. wait for further direction

## 14.3 Phase 0 objective
Document this workflow in `README.md` and/or `handoff/TESTING.md`.

---

## 15. README Structure

The initial README should include:

1. project purpose
2. local-first evidence warning
3. stack summary
4. setup prerequisites
5. env setup instructions
6. infra startup instructions
7. web/api/worker startup commands
8. handoff/testing workflow
9. log collection workflow
10. note that product modules are planned but not yet fully implemented

---

## 16. Suggested Phase 0 Task Breakdown

## Task 0.1 — Create repo structure
- create top-level folders
- add placeholder README files where helpful

## Task 0.2 — Add `.gitignore`
- include strong legal-data exclusions
- verify `data/` and env files are ignored

## Task 0.3 — Add `.env.example`
- include all core app, DB, Redis, AI, MCP placeholders

## Task 0.4 — Add Docker Compose infra
- postgres
- redis
- volumes and ports

## Task 0.5 — Scaffold frontend app
- Next.js app
- placeholder routes
- root layout shell

## Task 0.6 — Scaffold backend app
- FastAPI app
- config
- health endpoint
- base structure

## Task 0.7 — Scaffold worker app
- queue bootstrap
- health/ping job

## Task 0.8 — Initialize Alembic
- config files
- empty or test migration

## Task 0.9 — Create `handoff/` docs
- seed with initial content and templates
- add tracked `handoff/diagnostic_bundles/` directory

## Task 0.10 — Add local setup scripts
- bash + PowerShell placeholders or working versions

## Task 0.11 — Add log collection script skeleton
- CLI args
- output manifest placeholder

## Task 0.12 — Write README
- include startup, safety, and handoff instructions

---

## 17. Suggested Order of Execution

Recommended exact order:

1. `.gitignore`
2. repo folder scaffold
3. `.env.example`
4. `handoff/` files
5. README draft
6. Docker Compose infra
7. backend scaffold
8. frontend scaffold
9. worker scaffold
10. Alembic init
11. setup scripts
12. log collection script stub
13. verify sanitized share-bundle path for `-logs` branches
14. verify local startup path

Reason: safety and workflow should come before any app code.

---

## 18. Phase 0 Acceptance Criteria

Phase 0 is complete when all of the following are true:

- [ ] repository has the agreed top-level structure
- [ ] `.gitignore` protects evidence, logs, env files, and derived data
- [ ] `.env.example` exists and is usable
- [ ] Postgres and Redis can be started locally
- [ ] frontend scaffold runs locally
- [ ] backend scaffold runs locally
- [ ] backend exposes a health route
- [ ] worker scaffold can start and register a basic job
- [ ] `handoff/` files exist and are populated with templates
- [ ] README explains setup and safety rules
- [ ] log collection script exists as at least a scaffold
- [ ] sanitized tracked diagnostic bundle path exists for `-logs` branches
- [ ] branch/handoff workflow is documented

---

## 19. Phase 0 Definition of Done

Phase 0 is done when a local tester can:
1. clone the repo
2. create `.env.local` from `.env.example`
3. start infra
4. run web, API, and worker processes
5. hit a health endpoint successfully
6. understand where evidence will live locally
7. understand how logs will be collected and shared
8. understand what the next implementation phase will build

---

## 20. What Phase 0 Should Not Try to Solve

To avoid scope creep, Phase 0 should **not** fully implement:
- evidence upload
- OCR
- chronology
- claim charts
- AI review
- MCP connectors
- collaboration features
- full DB schema

Those belong to later phases.

Phase 0 is strictly about establishing a safe, coherent foundation.

---

## 21. Transition to Phase 1

After Phase 0, the next recommended implementation phase is:

### Phase 1
- workspace model
- matter CRUD
- proceeding/overlay matter support
- actor registry
- initial DB migrations for core identity/workspace/matter tables

This follows the roadmap and begins real product implementation without redoing the repo foundation.

---

## 22. Recommended Next Artifact After This Plan

If you want one more planning artifact before starting implementation, the best one would be:

### `Phase_0_Checklist.md`
A concise execution checklist the coding agent can follow step by step while updating handoff files.

If you prefer to begin building immediately after planning, this document is sufficient to kick off Phase 0.

---

## 23. Final Recommendation

Use this exact sequence:
- adopt the stack already specified
- create the scaffold only
- verify local run loop
- commit the safety and handoff foundation
- then begin Phase 1 feature work

That is the cleanest and safest path for a local-first legal evidence app.

---

**End of Repo Scaffold / Phase 0 Implementation Plan**

# Current coordination status

Updated 2026-10-03; Integrator session on `arena/01a0899f-casevault`.
This is the entry point for current assignments, verified proof, and environment status.
Update this page when assignments, tools, edge gateways, or merge statuses change.

## Product and Infrastructure Status

- **Integration Branch:** `arena/01a0899f-casevault`
- **Database & Ledger Status:** Schema migration and live fix applied for `source_status_enum` and `ix_ledger_entries__workspace__source_status`. `/ledger` loads 200 OK cleanly with filter controls, drawer inspections, and CSV export intact.
- **Hybrid OCR Engine:**
  - `workers/pipeline/ocr_engine.py` implements automatic extraction with local `pypdf` for digital text PDFs and fallback to cloud **OCR.space Engine** (`https://api.ocr.space/parse/image`, engine 2) for scanned PDFs and raster images (`png`, `jpg`, etc.).
  - Background RQ worker configured on Darwin using `rq.SpawnWorker` to ensure clean multiprocessing without macOS CoreFoundation fork traps.
- **Cloudflare Worker Edge Gateway:**
  - Live deployment: `https://casevault-worker.dan-2eb.workers.dev` (source: `infra/cloudflare-worker/`).
  - Endpoints: `GET /` (edge health), `POST /webhooks/github` (HMAC verification & event forwarding), `GET /supabase/health` (Supabase connectivity).
- **GitHub Repository Cleanup:**
  - Cleaned and pruned 10 merged remote arena branches (`arena/01a089c9` through `01a089ce`, `01a08a04`, `01a08c4a`, `01a08cdf`, `01a08ce1`, `01a097ea`, `01a097fd`).
  - Preserved unmerged diagnostic and safety branches: `codex/local-ops-safety`, `dev-logs`, `arena/01a08ce3-casevault`, `arena/01a08ce4-casevault`.
  - Local worktrees pruned and synchronized.

## Development Acceleration Tools & Shared Spaces

| Resource / Space | Endpoint / Identifier | Acceleration Capability |
|---|---|---|
| **OCR.space API** | `https://api.ocr.space/parse/image` (`K88494079788957`) | High-speed cloud OCR for scanned exhibits and multi-page discovery bundles. |
| **Cloudflare Worker** | `https://casevault-worker.dan-2eb.workers.dev` | Edge proxy, HMAC webhook verification, rate-limiting, and async intake gateway. |
| **Supabase Project** | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Remote PostgreSQL, storage buckets, and future vector embedding/pgvector acceleration. |
| **AI LLM/VLM APIs** | NVIDIA API (`nvapi-iCso...`), Ollama Cloud (`111a5d...`), OpenAI, Anthropic | Automated fact extraction, chronology synthesis, and VLM evidence analysis. |
| **Isolated Git Worktrees** | `../casevault-<workstream>` | Concurrent subagents develop in parallel without file locks or workspace pollution. |
| **Arena Dispatcher** | `scripts/arena_dispatcher/dispatcher.py` | Playwright CDP automation (`:9222`) to monitor subagents, inject briefs, and relay approvals. |

## Tasks & Wave 3 Roadmap Fan-Out

| Workstream | Subagent / Worktree | Scope / Write Set | Exit Criteria |
|---|---|---|---|
| **WS-CHRONO** | `../casevault-chrono` (`feat/chronology-ui`) | `/chronology` interactive timeline, event clustering, evidence backlinks | Clean timeline rendering, zoom/filter controls, e2e tests |
| **WS-CLAIMS** | `../casevault-claims` (`feat/claims-matrix`) | `/claims` matrix, claim-to-evidence mapping, burden-of-proof tracking | Claims grid, proof link modals, API integration |
| **WS-AI-INTEL** | `../casevault-ai` (`feat/ai-intelligence`) | AI proposal inbox, background entity extraction, VLM doc summaries | Proposal approval flow, streaming extraction hooks |
| **WS-VERIFY** | `../casevault-verifier` (`feat/verifier-wave3`) | End-to-end integration tests, OCR worker validation, edge webhook tests | Full test suite green (`verify_all.sh`), no regressions |

## Measured Proof & Verification

- **API Test Suite:** 118 passed, 1 skipped (`tests/api/` on isolated test DB with redis-optional fallback).
- **Web Frontend:** Clean build, Next.js route compilation passing, zero ESLint errors.
- **RQ Worker:** Background queue operational, successfully executes `process_source` and `ocr_source` with both local extraction and OCR.space cloud fallback.
- **Edge Gateway:** Verified via `curl -s https://casevault-worker.dan-2eb.workers.dev/` returning `{"service":"casevault-worker","status":"healthy"}` and HMAC webhook test passing.

## Documentation Map

- [Agent policy](AGENT_POLICY.md): permissions, write sets, PR/merge rules, accelerators & tools.
- [Recovery](RECOVERY.md): interruptions, stale metadata, closed sessions, evidence preservation.
- [Testing](TESTING.md): safe gate prerequisites; archived phase checklists.
- [Verification workflows](VERIFICATION_WORKFLOWS.md): CI coverage, edge gateway proof, OCR engine verification, and backups.
- [Backlog](BACKLOG.md), [known issues](KNOWN_ISSUES.md), [decisions](DECISIONS.md).
- [Kickoffs](kickoff/README.md): current roster; historical assignment scopes are not reactivation.
- [Arena Dispatcher](file:///Users/dangeorge/Documents/GitHub/casevault/scripts/arena_dispatcher/README.md): CDP automation guide for live Arena agent mode.

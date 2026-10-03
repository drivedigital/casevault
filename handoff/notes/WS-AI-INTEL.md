# WS-AI-INTEL — AI Proposal Pipeline & Streaming Intake (Wave 3)

**Status:** Delivered & tested (57/57 tests green)
**Branch:** `arena/01a100f2-casevault` (based on `main` @ `bfdaf22`)
**Date:** 2026-10-03

---

## 1. Deliverables (as specified in the brief)

| Path | What it is |
|---|---|
| `workers/ai/` | AI workstream package: env/provider config, provider adapters, versioned prompts, proposal pipeline, streaming intake, multi-agent runs |
| `workers/pipeline/ai_jobs.py` | Queue-facing job entrypoints (Technical Spec §10.2): `fact_proposal_job`, `event_proposal_job`, `agent_run_step_job`, `agent_synthesis_job`, `convert_agent_step_job` |
| `apps/api/app/services/ai_service.py` | API service layer + Pydantic request/response models |
| `apps/api/app/routers/ai.py` | FastAPI router mounted at `/api/ai` |
| `tests/workers/test_ai_pipeline.py` | 57 offline tests (fake providers/transports — no network, no credentials) |

### Module map (`workers/ai/`)

- `config.py` — dotenv-lite loader (`.env.local`, overridable via `AI_ENV_FILE`), provider specs for **OpenAI, Anthropic, NVIDIA NIM, Ollama (local or Ollama Cloud)** plus spec §6.1 extras (Gemini/xAI/OpenRouter), sharing-policy enum.
- `providers.py` — `LLMProvider` contract (Spec §12.2) with adapters: `OpenAICompatibleProvider`, `AnthropicProvider`, `OllamaProvider`; injectable `HttpJsonTransport` (stdlib urllib, zero deps); `ProviderRegistry` + `select_provider()` policy resolution.
- `prompts.py` — versioned prompt registry (Spec §12.4): fact/event/generic extraction prompts, 6 agent personas (Spec §13.1), synthesis prompt; all carry JSON output schemas.
- `schemas.py` — `ProposalType`/`ReviewState` enums (Schema Draft §5.8/§5.9), proposal validation, confidence clamping to NUMERIC(5,4), robust JSON extraction from model output, sha256 near-duplicate fingerprints (Spec §16.2).
- `proposal_pipeline.py` — `ProposalPipeline`, `SourceChunk`, `ProposalStore` protocol + `InMemoryProposalStore`; per-chunk share manifests (Spec §12.5).
- `streaming.py` — `chunk_source_text` (paragraph-aware, bounded, overlap-carrying) and `stream_proposals` (incremental `StreamEvent`s, per-chunk error containment, `resume_from`).
- `agent_runs.py` — `InMemoryAgentRunStore` mirroring Migration-009 tables, `execute_agent_step`, `convert_step_to_proposal`, `synthesize_run`.

### HTTP surface (`/api/ai`)

```
GET  /api/ai/providers                     configured providers (secrets masked)
GET  /api/ai/providers/health              health probes
POST /api/ai/proposals/runs        (202)   streamed extraction run
GET  /api/ai/proposals                     review-queue listing
POST /api/ai/agent-runs            (201)   create + execute multi-agent run
GET  /api/ai/agent-runs/{run_id}           run + steps + artifacts
POST /api/ai/agent-runs/{run_id}/steps/{step_id}/proposals  (201)
```

---

## 2. Invariant compliance

1. **All AI-generated facts start `review_state = proposed`.** Enforced twice:
   the pipeline sets it on every record, and `InMemoryProposalStore.insert_proposal`
   pins it at the storage boundary regardless of caller input (test:
   `test_store_boundary_forces_proposed_even_if_caller_cheats`). Agent-step
   conversion goes through the same boundary. No code path mints `accepted` facts.
2. **Providers from `.env.local`.** `merged_environ()` reads `AI_ENV_FILE`
   (default `./.env.local`) under the process environment; NVIDIA
   (`NVIDIA_API_KEY` + `NVIDIA_BASE_URL`, OpenAI-compatible NIM endpoint),
   Ollama (`OLLAMA_BASE_URL`, key optional for cloud), OpenAI and Anthropic
   are all first-class. `.env.example` documents the full contract.
3. **No Alembic migrations touched** — none exist in this checkout and none
   were created. Persistence is behind protocols (see seams below).
4. **This note** — written.

---

## 3. Deviations from the brief / environment findings (read this first)

- **Branch/worktree:** this agent session is pinned to branch
  `arena/01a100f2-casevault` inside `/home/user/casevault`. The brief's
  worktree `../casevault-ai` / branch `feat/ai-intelligence` were not created
  (session policy fixes the branch); content is identical, only the branch
  name differs.
- **Missing referenced artifacts:** `handoff/AGENT_POLICY.md`,
  `handoff/PARALLEL_PLAN.md`, `.env.local`, and integration target branch
  `arena/01a0899f-casevault` **do not exist** in this checkout or on
  `origin` (only `main`). The spec docs under `docs/specs/` were used as the
  source of truth instead.
- **No Wave 0-2 scaffold existed** (repo contained only `docs/specs/`). To
  make the deliverables runnable/testable I created three minimal shared
  files that normally belong to the platform scaffold workstream:
  `.gitignore` (spec minimum set), `.env.example` (spec §6.2 + NVIDIA),
  `pyproject.toml` (deps + pytest config). **If another workstream lands
  these files first, prefer theirs and diff in the AI provider sections.**
- **DB-independent by design:** no SQLAlchemy/Alembic dependency. Stores are
  in-memory reference implementations behind protocols.

---

## 4. Integration seams for later waves

1. **Postgres-backed stores:** implement `ProposalStore` (Migration 004
   `proposals`) and the `InMemoryAgentRunStore` surface (Migration 009
   `agent_runs`/`agent_run_steps`/`agent_run_artifacts`), then pass them to
   `AIService(...)` / job kwargs. The storage-boundary `review_state`
   pinning must be preserved in SQL (DB default `proposed`).
2. **Queue wiring:** `workers/pipeline/ai_jobs.py::JOB_REGISTRY` +
   `run_job()` are the RQ/Arq dispatch seam (queues: `analysis`, `ai` per
   Spec §10.1). Jobs are plain `dict -> dict` callables.
3. **Router mount:** `app.include_router(ai_router)` from
   `app.routers.ai` in the API workstream's `main.py`.
4. **Source hydration:** `POST /api/ai/proposals/runs` currently accepts
   source text inline (no source-storage service exists yet). Once
   Migration-003 repositories land, resolve `source_id` → pages/excerpts
   inside `AIService.run_proposal_extraction`.
5. **Default-provider env:** `AI_DEFAULT_PROVIDER`, `AI_SHARING_POLICY`,
   `AI_DISABLED_PROVIDERS` (see `.env.example`).

## 5. Verification

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'  # fastapi pydantic httpx pytest
.venv/bin/python -m pytest tests/workers/test_ai_pipeline.py -q   # 57 passed
```

Tests cover: proposed-state invariant (pipeline + store boundary), JSON
extraction robustness, confidence clamping, dedupe/near-dedupe, sharing
policies (`no_ai` rejection, `local_only` routing), env resolution for all
four brief providers, adapter envelopes (OpenAI-compat/Anthropic/Ollama),
chunker bounds + coverage, streaming events + error containment + resume,
all five jobs end-to-end, and the full HTTP surface via TestClient.

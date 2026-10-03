<!-- Brief + paste-ready prompt for Wave 3 agent session. Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4b -->
# WS-AI-INTEL — AI Proposal Pipeline & Streaming Intake

**Owner:** Wave 3 Subagent · **Worktree:** `../casevault-ai` · **Branch:** `feat/ai-intelligence`
**Integration Target:** `arena/01a0899f-casevault` · **Migration:** None

---

### Paste this into the subagent session:

```markdown
You are the implementer for workstream **WS-AI-INTEL** of CaseVault Wave 3.
Worktree: ../casevault-ai (Branch: feat/ai-intelligence).
Binding rules: handoff/AGENT_POLICY.md.

## Deliverables & Write Set:
You own exclusively:
- `workers/ai/**`
- `workers/pipeline/ai_jobs.py`
- `apps/api/app/services/ai_service.py`
- `apps/api/app/routers/ai.py`
- `tests/workers/test_ai_pipeline.py`

## Invariants:
1. All AI-generated facts MUST start in `review_state = proposed`.
2. Integrate with configured AI providers from `.env.local` (NVIDIA, Ollama Cloud, OpenAI/Anthropic).
3. Do not edit Alembic migrations.
4. When finished, write `handoff/notes/WS-AI-INTEL.md`.
```

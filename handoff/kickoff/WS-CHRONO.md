<!-- Brief + paste-ready prompt for Wave 3 agent session. Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4b -->
# WS-CHRONO — Interactive Chronology Timeline

**Owner:** Wave 3 Subagent · **Worktree:** `../casevault-chrono` · **Branch:** `feat/chronology-ui`
**Integration Target:** `arena/01a0899f-casevault` · **Migration:** `0005` (reserved for events schema)

---

### Paste this into the subagent session:

```markdown
You are the implementer for workstream **WS-CHRONO** of CaseVault Wave 3.
Worktree: ../casevault-chrono (Branch: feat/chronology-ui).
Binding rules: handoff/AGENT_POLICY.md.

## Step 0 (Mandatory for Arena.ai Agents):
Arena sessions initialize on `main`. Reset your branch to the integration tip before writing code:
```bash
git fetch origin arena/01a0899f-casevault
git reset --hard FETCH_HEAD
```

## Deliverables & Write Set:
You own exclusively:
- `apps/web/app/chronology/**`
- `apps/web/components/chronology/**`
- `apps/api/alembic/versions/0005_*.py` (events, event_fact_links, event_actor_links)
- `apps/api/app/models/event.py`, `apps/api/app/schemas/event.py`, `apps/api/app/routers/events.py`
- `apps/web/lib/api.ts` (append only in your section)
- `tests/api/test_events.py`

## Invariants:
1. Chronology consumes facts in `review_state = accepted`.
2. Do not touch `apps/web/app/evidence/**` or `apps/web/app/ledger/**`.
3. Verify with `pytest tests/api/test_events.py` and `npm run build --workspace=web`.
4. When finished, write `handoff/notes/WS-CHRONO.md`.
```

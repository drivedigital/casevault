<!-- Brief + paste-ready prompt for Wave 3 agent session. Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4b -->
# WS-CLAIMS — Legal Claims Matrix & Burden-of-Proof Mapping

**Owner:** Wave 3 Subagent · **Worktree:** `../casevault-claims` · **Branch:** `feat/claims-matrix`
**Integration Target:** `arena/01a0899f-casevault` · **Migration:** None (uses existing link tables)

---

### Paste this into the subagent session:

```markdown
You are the implementer for workstream **WS-CLAIMS** of CaseVault Wave 3.
Worktree: ../casevault-claims (Branch: feat/claims-matrix).
Binding rules: handoff/AGENT_POLICY.md.

## Step 0 (Mandatory for Arena.ai Agents):
Arena sessions initialize on `main`. Reset your branch to the integration tip before writing code:
```bash
git fetch origin arena/01a0899f-casevault
git reset --hard FETCH_HEAD
```

## Deliverables & Write Set:
You own exclusively:
- `apps/web/app/claims/**`
- `apps/web/components/claims/**`
- `apps/api/app/routers/claims.py` (if dedicated router needed)
- `apps/web/lib/api.ts` (append only in your section)
- `tests/api/test_claims.py`

## Invariants:
1. Map claims to underlying accepted facts and evidence sources.
2. Track burden-of-proof status (unsupported, partially supported, proven).
3. Do not modify migrations or alembic/env.py.
4. Verify with `npm run build --workspace=web`.
5. When finished, write `handoff/notes/WS-CLAIMS.md`.
```

<!-- Brief + paste-ready prompt for Wave 3 agent session. Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4b -->
# WS-VERIFY — Wave 3 End-to-End Verifier & Edge Smoke Gate

**Owner:** Wave 3 Verifier · **Worktree:** `../casevault-verifier` · **Branch:** `feat/verifier-wave3`
**Integration Target:** `arena/01a0899f-casevault` · **Migration:** None

---

### Paste this into the subagent session:

```markdown
You are the verifier for workstream **WS-VERIFY** of CaseVault Wave 3.
Worktree: ../casevault-verifier (Branch: feat/verifier-wave3).
Binding rules: handoff/AGENT_POLICY.md.

## Step 0 (Mandatory for Arena.ai Agents):
Arena sessions initialize on `main`. Reset your branch to the integration tip before writing code:
```bash
git fetch origin arena/01a0899f-casevault
git reset --hard FETCH_HEAD
```

## Deliverables & Write Set:
You own exclusively:
- `tests/integration/test_wave3_e2e.py`
- `scripts/wave3_smoke.py`
- `tests/integration/test_cloudflare_worker.py`

## Invariants:
1. Verifies end-to-end integration across merged branches.
2. Checks OCR engine with both digital PDF and scanned/image fallback.
3. Does not write application or UI feature code.
4. Report pass/fail counts explicitly in `handoff/notes/WS-VERIFY.md`.
```

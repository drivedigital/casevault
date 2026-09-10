<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-I — Wave 2 — /ai-review inbox UI (proposal queue + accepted-facts tab)

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** 2nd (parallel with W2-F/G/H) · **Depends on:** contract only (build against §4; API lands behind you)

---

## Paste this into the agent session

```
Workstream **W2-I** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. Implement
contract §5.2 exactly.

## Deliverable
The proposal review inbox (Screen 6) — the high-trust screen where raw source
becomes a reviewed fact (PRD §10.5).

- `/ai-review` page, two tabs: **Inbox** and **Accepted facts**.
  - Inbox: filters (proposal type, matter, review state, source, min
    confidence), card feed (type badge, matter, source anchor link to
    `/evidence/{id}`, proposed text, confidence, linked actors/dates when
    present in `proposed_structured_json`), per-card actions (Accept, Accept
    with edits, Reject, Defer, Uncertain), bulk select with the same actions,
    and a “Generate proposals from a source” control (`POST /proposals/generate`).
  - Accepted facts: table with review state, confidence, material flag, and row
    actions Approve / Reject / Defer / Dispute / Supersede.
- The UI must never imply a fact is trusted before **Approved**: `proposed`
  facts render distinctly (badge + copy), and the only Approve affordance is the
  §4.1 approve route. This is the visible half of the review-state floor.
- Empty states exactly as in §5.2.
- `lib/types.ts` + `lib/api.ts`: append the §5.3 intake types and client
  functions **in your own commented section at the end** (append-only rule).
  Do not reorder or reformat existing lines.

## Write set (nothing else)
`apps/web/app/ai-review/**`, `apps/web/components/review-*.tsx`,
`apps/web/lib/api.ts` (append-only), `apps/web/lib/types.ts` (append-only).

## Proof required
`npm run lint --workspace=web && npm run typecheck --workspace=web && npm run
build --workspace=web`, plus a walk description: generate from a text source →
accept a proposal → fact appears `proposed` → Approve → `accepted` → reject and
defer another → bulk action on two proposals.

## Notes
- Coordinate nothing directly with W2-G: if the API shape surprises you, it is a
  contract gap — report it (AGENT_POLICY §4.1).
- No mocks may merge; delete any temporary fixture before the PR.
- Write `handoff/notes/W2-I.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

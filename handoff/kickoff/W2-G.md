<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-G — Wave 2 — proposal review, trusted-fact intake, links, generation job

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** 2nd (parallel with W2-F/H/I) · **Depends on:** W2-E merged

---

## Paste this into the agent session

```
Workstream **W2-G** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. Implement
contract §4 as written. §4.1 (the review-state floor) is the heart of this
workstream — the product promise is that nothing untrusted becomes a fact.

## Deliverable
Sprint 5's backend: the proposal review inbox and the trusted fact store.

- `app/schemas/intake.py` — `ProposalCreate/Update/Out/Page`, `ReviewAction`,
  `BulkReviewRequest`, `FactCreate/Update/Out/Page`,
  `FactReviewStateChange`, `SupersedeRequest`, source/actor link schemas.
- `app/services/proposal_service.py` — list/filters, manual creation,
  `review` (accept / accept_with_edits / reject / defer / uncertain / dispute
  with the exact §4.2 semantics), `bulk_review` (partial success), `generate`.
- `app/services/fact_service.py` — list/filters, create (always `proposed`),
  patch (never `review_state`), `approve` (the only path to `accepted`, stamps
  `approved_by_user_id`/`approved_at`), `set_review_state` with the §4.3 409
  cases, `supersede`, and the fact↔source / fact↔actor links with 409 on
  duplicate tuples.
- `app/routers/proposals.py`, `app/routers/facts.py` — fill W2-E's stubs with
  every §4.2/§4.3 endpoint.
- `workers/pipeline/intake_jobs.py` — `generate_fact_proposals` (paragraph
  split, <40-char skip, `provenance_key` idempotency, cap 50, never raises) and
  `enqueue_proposal_generation` (graceful without redis), per §4.4.
- `tests/api/test_intake_review.py`, `tests/workers/test_intake_jobs.py` — the
  floor-rule tests (every creation path leaves `proposed`; only `/approve`
  yields `accepted`), forbidden-field rejection (422, not ignore), 409
  transitions, bulk partial success, link uniques, job idempotency on re-run.

## Write set (nothing else)
`app/schemas/intake.py`, `app/services/proposal_service.py`,
`app/services/fact_service.py`, `app/routers/proposals.py`,
`app/routers/facts.py`, `workers/pipeline/intake_jobs.py`,
`tests/api/test_intake_review.py`, `tests/workers/test_intake_jobs.py`.

## Proof required
`bash scripts/verify_all.sh --no-web` plus the floor-rule test output pasted in
the note, and one end-to-end command sequence (generate → accept → approve)
shown with real JSON.

## Notes
- Clients can never set `review_state`, `approved_*`, `supersedes_fact_id`, or
  `created_from_proposal_id` — reject with 422 rather than ignoring.
- Do not add audit rows (Migration 010 owns those); do not touch evidence
  endpoints, models, or the migration.
- Write `handoff/notes/W2-G.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

# W2-G — Wave 2 — proposal review, trusted-fact intake, links, generation job

Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen)
Branch: `arena/01a089cc-casevault` · PR #9 (base `arena/01a0899f-casevault`)

## What changed

- `apps/api/app/schemas/intake.py` — `ProposalCreate/Update/Out/Page`,
  `ReviewAction` (request-side enum), `ProposalReviewRequest/Edits/Result`,
  `BulkReviewRequest/Result`, `ProposalGenerateRequest/Result`,
  `FactCreate/Update/Out/Page`, `FactReviewStateChange`, `SupersedeRequest/Result`,
  `FactSourceLinkCreate/Out`, `FactActorLinkCreate/Out`, `SourceRef`/`ExcerptRef`/
  `ProposalRef`. All create/update/review bodies `extra="forbid"` → forbidden or
  unknown fields 422 (§4.1), never ignored.
- `apps/api/app/services/proposal_service.py` — list (matter_id/proposal_type/
  review_state/source_id/min_confidence + envelope), manual create
  (`created_by_system=false`, state forced `proposed`), PATCH (only while
  `proposed`, else 409), `review` with the §4.2 semantics (accept/
  accept_with_edits stamp reviewer/at/notes and create a `proposed` fact via
  `edits.statement_text ?? proposed_text`; 422 when both blank; reject/defer/
  uncertain/dispute touch the proposal only; 409 outside `proposed|deferred|
  uncertain`), partial-success `bulk_review` (per-item commit — failures never
  roll back successes), `generate` (enqueue when redis answers, else inline job).
- `apps/api/app/services/fact_service.py` — list/filters (repeatable
  review_state, fact_type, is_material, q), create (always `proposed`),
  PATCH (never review_state), `approve` (the only path to `accepted`; stamps
  `approved_by_user_id`/`approved_at`; 409 re-approve, 409 superseded),
  `set_review_state` (409 for `accepted` → "use /approve", 409 for `proposed`,
  409 re-transitioning a superseded fact), `supersede` (new fact `proposed` +
  `supersedes_fact_id`, old → `superseded`), fact↔source / fact↔actor links
  (409 on duplicate `NULLS NOT DISTINCT` tuples, 404 unknown refs, 422
  excerpt/source mismatch, 204 deletes).
- `apps/api/app/routers/proposals.py`, `app/routers/facts.py` — every
  §4.2/§4.3 endpoint under `/api/v1` (replaces W2-E's stubs by contract §1;
  static `/proposals/generate` + `/proposals/bulk-review` declared before the
  UUID path).
- `workers/pipeline/intake_jobs.py` — `generate_fact_proposals` (text pages
  only; blank-line paragraph split; trim to 1200; skip <40; sha1
  `proposed_structured_json["provenance_key"]` idempotency per source;
  cap `max_proposals`; single commit; never raises) +
  `enqueue_proposal_generation` (RQ on the frozen `extract` queue;
  `{"queued": false, …, reason}` without redis; importable without it).
- `tests/api/test_intake_review.py` (25 tests) +
  `tests/workers/test_intake_jobs.py` (7 tests).
- No edits to models, migrations, evidence routes, or any hub file.

## Status: rebased onto the merged tip and re-proven against real deliverables

This workstream was first implemented while W2-E was still in flight, against
the frozen interface plus a local W2-E reconstruction held outside the branch.
The integrator has since merged E (`f0aa9e2`), F (`4ce4555`), H (`e62daae`),
I (`0ba7a0c`) and EV (`c7842bb`) into `arena/01a0899f-casevault`
(tip `b0be226`, kickoff table: "W2-G — unblocked, proceed"). The branch is now
**rebased onto `b0be226`** and everything below was re-run in the real tree:

- Rebase conflicts: exactly the two anticipated add/adds on
  `app/routers/{proposals,facts}.py` (E's empty stubs vs G's filled routers) —
  resolved by taking G's versions, which is the designed outcome (contract §1:
  G "fill E's stubs"). Nothing else conflicted; the earlier stray W2-H commit
  that had been pushed onto this session branch is gone from it (H's content is
  in the base via PR #2).
- Real-vs-reconstruction audit: merged `models/intake.py` matches every
  assumption G makes (table/column names, enum types, `created_by_system` /
  state / `fact_type` server defaults, and **both** link uniques carry
  `postgresql_nulls_not_distinct=True` — so the API tests' `create_all` path
  enforces the same duplicate rules as migration `0004`); `workers/pipeline/
  jobs.py` still exports `_connect`/`_ensure_app_importable` that the intake
  job reuses; `main.py` already registers `proposals.router` and
  `facts.router`; `tests/api/conftest.py` is metadata-driven and needed no
  change; W2-F's routes live entirely under `/ledger-entries*` — no overlap
  with `/proposals` or `/facts` (closes my earlier route-collision risk).
- W2-I cross-check: the merged `/ai-review` client (`lib/api.ts` WS-I section)
  calls `/proposals`, `/proposals/{id}` (+PATCH), `/proposals/{id}/review`,
  `/proposals/bulk-review`, `/proposals/generate` (body `max_proposals`),
  `/facts`, `/facts/{id}` (+PATCH), `/facts/{id}/approve` (no body),
  `/facts/{id}/review-state`, `/facts/{id}/supersede`,
  `/facts/{id}/{source,actor}-links`, `/fact-{source,actor}-links/{id}`
  DELETE — every one matches a shipped route, incl. DELETE living outside
  `/facts`. Full web gate (lint/typecheck/build) green on the merged tree.

## Proof

Environment: sandbox without Docker — repo `.venv` + `pip install pgserver`,
`python scripts/agent_pg.py start` (embedded Postgres 16 under git-ignored
`data/pgdata`), then the wave gate in the repo itself.

1. `bash scripts/verify_all.sh` (FULL gate incl. web — real W2-E/F/H/I/EV
   plus G; fresh DB; migration round-trip through real `0004`):

```
==> Migrations (upgrade head -> downgrade base -> upgrade head)
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger proposals facts links
INFO  [alembic.runtime.migration] Running downgrade 0004 -> 0003, wave2 intake core: ledger proposals facts links
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger proposals facts links
==> pytest (real Postgres)
..................................................................       [100%]
66 passed, 2 warnings in 3.55s
==> ruff
All checks passed!
==> web: lint / typecheck / build   (routes include /ledger and /ai-review)
GATE GREEN — python, migrations, lint and web all pass.
```

(`--no-web` was also run standalone first: same 66 passed / ruff clean; web
steps then added by running the full gate after `npm ci`.)

2. Floor-rule suite, verbatim:

```
tests/api/test_intake_review.py::test_manual_proposal_is_created_as_proposed PASSED
tests/api/test_intake_review.py::test_post_fact_always_proposed PASSED
tests/api/test_intake_review.py::test_accept_and_accept_with_edits_only_ever_yield_proposed PASSED
tests/api/test_intake_review.py::test_review_state_accepted_forbidden_via_review_state_route PASSED
tests/api/test_intake_review.py::test_forbidden_fields_are_rejected_not_ignored PASSED
tests/api/test_intake_review.py::test_accept_stamps_proposal_and_links_fact PASSED
tests/api/test_intake_review.py::test_accept_with_edits_moves_matter_and_sets_fields PASSED
tests/api/test_intake_review.py::test_accept_requires_text_or_edits_422 PASSED
tests/api/test_intake_review.py::test_accept_needs_a_matter_422 PASSED
tests/api/test_intake_review.py::test_non_accept_actions_touch_only_the_proposal PASSED
tests/api/test_intake_review.py::test_review_and_patch_conflicts PASSED
tests/api/test_intake_review.py::test_patch_proposal_fields_while_proposed PASSED
tests/api/test_intake_review.py::test_bulk_review_partial_success PASSED
tests/api/test_intake_review.py::test_bulk_review_reject_flow PASSED
tests/api/test_intake_review.py::test_generate_from_text_source_flow PASSED
tests/api/test_intake_review.py::test_generate_unknown_source_404 PASSED
tests/api/test_intake_review.py::test_approve_only_once PASSED
tests/api/test_intake_review.py::test_review_state_transitions_and_notes PASSED
tests/api/test_intake_review.py::test_supersede_flow PASSED
tests/api/test_intake_review.py::test_fact_patch_touches_content_only PASSED
tests/api/test_intake_review.py::test_fact_source_link_uniques PASSED
tests/api/test_intake_review.py::test_fact_actor_link_uniques PASSED
tests/api/test_intake_review.py::test_fact_list_filters_and_envelope PASSED
tests/api/test_intake_review.py::test_proposal_list_filters PASSED
tests/api/test_intake_review.py::test_workspace_scoping PASSED
tests/workers/test_intake_jobs.py::test_generate_creates_proposals_from_pages PASSED
tests/workers/test_intake_jobs.py::test_rerun_is_idempotent PASSED
tests/workers/test_intake_jobs.py::test_max_proposals_cap PASSED
tests/workers/test_intake_jobs.py::test_long_paragraphs_are_trimmed_to_the_cap PASSED
tests/workers/test_intake_jobs.py::test_pages_without_text_are_ignored PASSED
tests/workers/test_intake_jobs.py::test_job_never_raises_on_bad_input PASSED
tests/workers/test_intake_jobs.py::test_enqueue_reports_gracefully_without_redis PASSED
======================== 32 passed, 2 warnings in 1.85s ========================
```

3. End-to-end over real HTTP on the merged tree (uvicorn :8101, embedded
   Postgres, synthetic text source) — generate → accept → approve:

```
$ curl -s -X POST $API/proposals/generate -H "$J" -d '{"source_id":"'$SRC'","max_proposals":50}'
{ "created": 3, "skipped": 1, "queued": false, "job_id": null, "reason": null }  # 4th para <40 chars

$ curl -s "$API/proposals?source_id=$SRC" | jq '{total, states: [.items[].review_state]|unique, system: [.items[].created_by_system]|unique}'
{ "total": 3, "states": ["proposed"], "system": [true] }

$ curl -s -X POST $API/proposals/$PID/review -H "$J" \
    -d '{"action":"accept","review_notes":"verified against receipt scan","edits":{"matter_id":"'$MATTER'","short_label":"hallway light"}}' | jq '{proposal_state: .proposal.review_state, fact_state: .fact.review_state, created_from_proposal_id: .fact.created_from_proposal_id}'
{ "proposal_state": "accepted",
  "fact_state": "proposed",                                     # the floor holds
  "created_from_proposal_id": "467d59e3-439c-4db4-8449-d913ed8b5cf8" }

$ curl -s "$API/facts?review_state=accepted" | jq '.total'
0

$ curl -s -w ' [%{http_code}]' -X POST $API/facts/$FID/review-state -H "$J" -d '{"review_state":"accepted"}'
{"detail":"`accepted` may only be set via POST /facts/{id}/approve."} [409]

$ curl -s -X POST $API/facts/$FID/approve
{ "review_state": "accepted",
  "approved_at": "2026-09-10T06:05:04.207231Z",
  "approved_by_user_id": "e54e83fb-ed36-45f6-ac9c-b45375749055" }

$ curl -s $API/facts/$FID | jq '{review_state, source_links, actor_links}'   # after linking
{ "review_state": "accepted",
  "source_links": [ { "source_title": "Notice of exclusion (G e2e)",
                      "support_type": "supports", "strength": "high" } ],
  "actor_links": [ { "actor_name": "Supervisor Lee", "role_in_fact": "witness" } ] }

$ curl -s "$API/facts?review_state=accepted" | jq '.total'
1
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/facts/$FID/approve
409
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/facts -H "$J" -d '{"matter_id":"'$MATTER'","statement_text":"x","review_state":"accepted"}'
422
```

## Contract gaps

(unmodified from the first pass; all stand after the E/F merge audit — the
merged code confirms each interpretation was needed and none conflicted with
upstream choices)

1. **§4.3 review-state `notes?`** — `fact_assertions` has no notes column
   (§2), audit rows deferred to Migration 010. Expected: field exists in the
   payload. Observed: accepted, validated, **not persisted** (test pins that it
   does not error). Minimum change: one contract line "stored with Migration
   010 audit rows," or drop the field.
2. **§4.2 `/proposals/generate` response** — `{created, skipped}` undefined for
   the redis-queued path. Kept `created/skipped`; added optional
   `queued`/`job_id`/`reason` (additive keys; W2-I ignores extras; its
   `ProposalGenerateResult` type is a superset-tolerant match). Minimum
   change: document the three keys (1.x).
3. **§4.2 accept validation codes** — contract fixes 422 for empty statement
   but not for a missing matter (fact.matter_id NOT NULL per §2). Used **422**
   for both; a failed accept leaves the proposal `proposed` (test-pinned).
4. **§4.3 review-state targets** — only `accepted` has a specified 409;
   `proposed` also gets 409, and superseded facts are immutable (409 on
   review-state/approve/supersede attempts) as an extension of the stated
   "re-transitioning a superseded fact → 409" rule.
5. **§4.4 paragraph ≤ 1200 chars** — read as "trim", not "skip"; the sha1
   provenance key is taken on the trimmed text. If "skip oversized" is the
   intent it is a one-line change.
6. **§4.4 job signature** — `generate_fact_proposals` gained optional 4th kwarg
   `database_url=None` (mirrors `process_source` in `workers/pipeline/
   jobs.py`) so the API's inline path and direct tests bind to the request/
   pytest database; default stays env-driven.
7. **§4.3 PATCH proposal guard** — "only while review_state=proposed" had no
   error code; used **409**.
8. **Minor caps as schema validation** — `max_proposals` `le=50` (422 above),
   list `limit le=200` (§3 preamble), bulk `ids` 1..200.

## Risks / follow-ups

- ~~W2-F route collision~~ closed: F's routes are all under `/ledger-entries`
  (audited in the merged tree).
- `GET /proposals?review_state=` is single-valued per §4.2 while facts' is
  repeatable per §4.3 — intentional asymmetry, contract as written. If W2-J or
  the UI wants multi-state proposal filtering, that's a 1.x addition.
- The inline generate path commits with the job's **own** session, not the
  request's (deliberate: job signature is frozen). Same DB, sequential — fine
  at this scale; revisit if a same-transaction need appears.
- `created_fact_id` on ProposalOut is derived by lookup (§4.2). Today one
  proposal maps to at most one fact (a reviewed proposal cannot be re-
  accepted); if a reopen route ever lands, define re-accept semantics.
- Redis-backed enqueue is proven only to degrade gracefully (`queued:false` +
  reason) in this sandbox; one worker run against real redis is worth a line
  on the tester's checklist (job is registered on the frozen `extract` queue).
- Nothing here touches audit rows, evidence endpoints/models, migration 0004,
  or hub files.

## What the next agent must know

- **Merge order is now: G (this PR #9) → J.** Branch head is
  `W2-G: handoff note…` on top of `71f40e6` on top of `b0be226`; two commits
  total, no W2-H content left on the branch. Expect no conflicts — the stub
  add/adds are already resolved.
- Gate above was run on the rebased head: re-running
  `bash scripts/verify_all.sh` on the merge commit should reproduce
  `66 passed` + GATE GREEN verbatim.
- W2-J (parked at `4d2c16d` per the integrator's table): this note's e2e
  sequence (steps 1–11) is the intended smoke-script skeleton; the negative
  cases are already pinned by `tests/api/test_intake_review.py` (forbidden
  fields 422, review-state→accepted 409, re-approve 409, bulk partial success,
  link uniques 409, job re-run idempotent) — assert them at HTTP level there.
- W2-I's UI consumes exactly these routes; if the integrator bumps the
  contract (e.g. gap #2's `queued/job_id/reason` keys), I's
  `ProposalGenerateResult` type already tolerates them.
- The `/home/user/lab` scratch tree (pre-merge reconstruction rig) is retired;
  nothing in it is part of this branch. `python scripts/agent_pg.py stop` after
  any further local runs.

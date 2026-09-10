# W2-G — Wave 2 — proposal review, trusted-fact intake, links, generation job

Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen)

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
  uncertain/dispute touch the proposal only; non-reviewable state → 409),
  partial-success `bulk_review` (per-item commit — failures never roll back
  successes), `generate` (enqueue when redis answers, else inline job run).
- `apps/api/app/services/fact_service.py` — list/filters (repeatable
  review_state, fact_type, is_material, q), create (always `proposed`),
  PATCH (never review_state), `approve` (only path to `accepted`; stamps
  `approved_by_user_id`/`approved_at`; 409 already-accepted, 409 superseded),
  `set_review_state` (409 for `accepted` → "use /approve", 409 for `proposed`,
  409 re-transitioning a superseded fact), `supersede` (new fact `proposed` +
  `supersedes_fact_id`, old → `superseded`), fact↔source / fact↔actor links
  (409 on duplicate NULLS-NOT-DISTINCT tuples, 404 unknown refs, 422
  excerpt/source mismatch, 204 deletes).
- `app/routers/proposals.py`, `app/routers/facts.py` — all §4.2/§4.3 endpoints
  under `/api/v1` (replaces W2-E's stubs by contract §1).
- `workers/pipeline/intake_jobs.py` — `generate_fact_proposals` (text pages
  only; blank-line paragraph split; trim to 1200; skip <40; sha1
  `proposed_structured_json["provenance_key"]` idempotency per source;
  cap `max_proposals`; single commit; never raises) +
  `enqueue_proposal_generation` (RQ on the frozen `extract` queue;
  `{"queued": false, …, reason}` with no redis; importable without it).
- `tests/api/test_intake_review.py` (25 tests) +
  `tests/workers/test_intake_jobs.py` (7 tests).
- No edits to models, migrations, evidence routes, or any hub file.

## Dependency situation (read this before reviewing)

`arena/01a0899f-casevault` @ `adcb1b8` (the base of this branch) does **not yet
contain W2-E** — no `app/models/intake.py`, no migration 0004, no stub routers,
no `main.py` registration. Per AGENT_POLICY §4.6 ("code against the frozen
interface") I implemented against contract §2 interfaces exactly, and produced
all proof below against a **local W2-E reconstruction** (migration `0004`,
`models/intake.py`, five enums appended to `models/enums.py`, stub/registration
in `main.py`) held OUTSIDE this branch in `/home/user/lab` — a copy of this
tree with the E files added. That reconstruction is the integrator's contract
check on E as much as my test rig: it passes `upgrade head → downgrade base →
upgrade head`, and it is what W2-G merges on top of. **Nothing from the
reconstruction is in this branch's diff.** After E merges, `git rebase` onto it
should be conflict-free except `app/routers/{proposals,facts}.py` (E's empty
stubs → take G's versions by design, contract §1).

One artifact of this to be aware of: `ruff check` run standalone on this branch
(pre-merge) flags two I001 import-sorting errors, because isort resolves
first-party status from disk and `app.models.intake` doesn't exist until E
lands. In the lab (E present) ruff is green, and import blocks are sorted for
that merged state. No action needed at merge.

## Proof

Environment: sandbox without Docker — `bash scripts/setup_local.sh` (venv part),
`.venv/bin/pip install pgserver`, `python scripts/agent_pg.py start` (embedded
Postgres 16, socket under `data/pgdata`; the lab has its own instance).

1. `bash scripts/verify_all.sh --no-web` (run in the E-reconstructed tree —
   fresh DB, full migration round-trip, full pytest incl. Wave 0–3 suites, ruff):

```
==> Database
    fresh casevault_test created
==> Migrations (upgrade head -> downgrade base -> upgrade head)
...
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ledger_entries, proposals, fact_assertions, link tables
INFO  [alembic.runtime.migration] Running downgrade 0004 -> 0003, wave2 intake core: ...
INFO  [alembic.runtime.migration] Running upgrade 0003 -> 0004, wave2 intake core: ...
==> pytest (real Postgres)
.................................................                        [100%]
49 passed, 2 warnings in 2.97s
==> ruff
All checks passed!

GATE GREEN — python, migrations, lint and web all pass.
```

2. Floor-rule suite (`pytest tests/api/test_intake_review.py tests/workers/test_intake_jobs.py -v`, tail):

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
======================== 32 passed, 2 warnings in 1.77s ========================
```

3. End-to-end, real HTTP (uvicorn :8100 on the embedded DB, synthetic text,
   `curl` + `jq`) — generate → accept → approve:

```
$ curl -s -X POST $API/proposals/generate -H "$J" -d '{"source_id":"'$SRC'","max_proposals":50}'
{ "created": 3, "skipped": 1, "queued": false, "job_id": null, "reason": null }   # 4th para <40 chars

$ curl -s "$API/proposals?review_state=proposed&source_id=$SRC" | jq '.total'
3   # every generated proposal is proposed; created_by_system: true

$ curl -s -X POST $API/proposals/a59d37ef-…/review -H "$J" \
    -d '{"action":"accept","review_notes":"verified against receipt scan","edits":{"matter_id":"'$MATTER'","short_label":"renewal request date"}}'
{ "proposal": "accepted",
  "fact_id": "5c31ca7f-dfe1-4e02-8854-1e2ec56eec75",
  "fact_state": "proposed",                                   # the floor holds
  "created_from_proposal_id": "a59d37ef-dc3f-42bf-8e29-3bf9560c3a1f" }

$ curl -s "$API/facts?review_state=accepted" | jq '.total'
0

$ curl -s -X POST $API/facts/$FID/review-state -H "$J" -d '{"review_state":"accepted"}'
{ "detail": "`accepted` may only be set via POST /facts/{id}/approve." }        # 409

$ curl -s -X POST $API/facts/$FID/approve
{ "review_state": "accepted",
  "approved_at": "2026-09-10T05:52:26.467206Z",
  "approved_by_user_id": "aab30b3b-c70c-4c6b-a189-9e90a6a949c4" }

$ curl -s $API/facts/$FID | jq '{review_state, source_links: [.source_links[] |
    {source_title, support_type, strength}], actor_links: [.actor_links[] |
    {actor_name, role_in_fact}]}'
{ "review_state": "accepted",
  "source_links": [ { "source_title": "Notice of exclusion",
                      "support_type": "supports", "strength": "high" } ],
  "actor_links": [ { "actor_name": "Supervisor Lee", "role_in_fact": "witness" } ] }

$ curl -s "$API/facts?review_state=accepted" | jq '.total'
1
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/facts/$FID/approve
409
```

## Contract gaps

1. **§4.3 review-state `notes?`** — `fact_assertions` has no notes column
   (§2), and audit rows are deferred (Migration 010). Expected: field exists in
   the payload. Observed: accepted, validated, **not persisted** (a test pins
   that it does not error). Minimum change: one contract line saying "stored
   with Migration 010 audit rows," or drop the field.
2. **§4.2 `/proposals/generate` response** — `{created, skipped}` is undefined
   for the redis-queued path (results aren't known synchronously). I kept
   `created/skipped` and added optional `queued`/`job_id`/`reason` (additive
   keys; W2-I/W2-J can ignore them). Minimum change: document the three keys,
   1.x.
3. **§4.2 accept validation codes** — contract fixes 422 for
   empty statement (`edits.statement_text ?? proposed_text`) but not for a
   missing matter (fact.matter_id is NOT NULL in §2). Used **422** for both; a
   failed accept leaves the proposal `proposed` untouched (test-pinned).
4. **§4.3 review-state targets** — only `accepted` has a specified 409;
   `proposed` (a creation state, not a transition target) also gets **409**, and
   so does `approve`/`supersede`/review-state on a `superseded` fact (extension
   of the "re-transitioning a superseded fact → 409" rule).
5. **§4.4 paragraph ≤ 1200 chars** — "split … ≤ 1200 chars, trim" read as:
   paragraphs longer than 1200 are **trimmed** (not skipped) and the sha1
   provenance key is taken on the trimmed text; overflow counts as created, not
   skipped. If the intent is "skip oversized," it's a one-line change.
6. **§4.4 job signature** — `generate_fact_proposals(source_id, workspace_id,
   max_proposals=50)` gained an optional 4th kwarg `database_url=None` so the
   API's inline path and direct tests bind to the same DB as the request/pytest
   session (mirrors the `process_source(source_id, database_url)` precedent in
   `workers/pipeline/jobs.py`; default stays env-driven).
7. **§4.3 PATCH proposal guard code** — "only while review_state=proposed" had
   no error code; used **409** (matches the sibling 409s in the same section).
8. **Minor caps as schema validation**: `max_proposals` `le=50` (422 above;
   brief's "cap 50"), list `limit le=200` (§3 preamble), bulk `ids` 1..200.

## Risks / follow-ups

- W2-F must not register routes starting `/proposals` or `/facts` (none in its
  contract; noted for the integrator's route-conflict sweep at merge).
- `GET /proposals?review_state=` is single-valued per §4.2; facts list is
  repeatable per §4.3. If W2-I wants multi-state proposal filtering, that's a
  1.x addition.
- The inline generate path commits with its **own** session (job-owned), not
  the request's; if a future refactor needs same-transaction semantics, pass a
  session factory into the job — deliberately not done (job signature is frozen).
- `created_fact_id` on ProposalOut is derived by lookup (§4.2), so re-accepting
  a (deferred/uncertain) proposal that already has a fact from an earlier
  accepted→reopened flow cannot occur today (no reopen route); when one is
  added (later sprint), revisit "one proposal → one fact."
- Nothing here touches audit rows, evidence endpoints/models, migration 0004,
  or hub files. `workers/queues.py` untouched — the job uses the frozen
  `extract` queue name.

## What the next agent must know

- **This branch cannot run the API standalone** until W2-E merges (it imports
  `app.models.intake` by design; that's the dependency, not a defect). Merge
  order E → G, re-run `bash scripts/verify_all.sh --no-web` on the merge
  commit, expect add/add conflict on `app/routers/{proposals,facts}.py` — take
  G's (filled) versions.
- E's `models/intake.py` must set `postgresql_nulls_not_distinct=True` on both
  link uniques (mine does in the reconstruction); if it doesn't,
  `test_fact_source_link_uniques` fails on the API tests' `create_all` path —
  loud, not silent.
- W2-J: the e2e smoke should reuse this note's step order (steps 1–11 above)
  and add the negative cases `tests/api/test_intake_review.py` pins.
- The lab rig (repo copy + W2-E reconstruction) is disposable; recreate with
  `cp -a`, the four E files from contract §2, and `eval
  "$(.venv/bin/python scripts/agent_pg.py env)"` per `handoff/kickoff/README.md`.
- Local redis is absent in the sandbox, so every proof above ran the **inline**
  generation path; the enqueue path is proven only to fail gracefully
  (`queued:false` + reason). A redis-backed worker run is worth one line in the
  tester's checklist.

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

## Integrator review round (findings at WORKLOG `9a55aee`, PR #9 06:19)

All four verified defects fixed in this commit; each pinned by a regression
test that **fails against the pre-fix code** (revert-probed, output below).

| # | Finding | Fix | Regression test |
|---|---------|-----|-----------------|
| 1 | excerpt-only proposal create skipped the excerpt's owning-source/workspace check | `proposal_service._validate_refs` now always loads `Source` for `excerpt.source_id` and 404s on missing/foreign owner (both excerpt-only and source+excerpt forms) | `test_cross_workspace_excerpt_cannot_be_attached` (real second Workspace + source uploaded into it through the EV endpoint; foreign excerpt-only → 404, foreign source+excerpt → 404, same-ws excerpt-only → 201) |
| 2 | `str(db.get_bind().url)` masks the password as `***` → invalid DSN for inline generation on authenticated deployments | new `proposal_service._inline_database_url()` renders `hide_password=False`; used only for the internal job call, never logged, never serialized into a response | `test_inline_database_url_preserves_password_without_exposing_it` (synthetic password-bearing URL: helper keeps creds, `str()` still masks) + `test_generate_forwards_cap_to_queued_and_inline_paths` (inline `database_url` is `make_url`-equal to the API's own DSN, contains no `***`) |
| 3 | queued generation dropped `max_proposals` (worker always used 50) | `enqueue_proposal_generation(source, ws, max_proposals=None)` forwards the cap as RQ `kwargs={"max_proposals": n}` on the `extract` queue; omitted cap → job default; service passes `payload.max_proposals` | `test_enqueue_forwards_cap_via_rq_kwargs` (fake redis/rq, captured enqueue call incl. no-kwargs form) + `test_queued_job_consumes_the_forwarded_cap` (job called with exactly the wire shape caps identically) + the API wiring test asserts queued/inline parity |
| 4 | explicit `null` on NOT NULL PATCH fields was schema-valid then crashed (500 at `.strip()`/commit) | `FactUpdate` rejects `statement_text/fact_type/is_material` = null and `ProposalUpdate` rejects `proposed_structured_json` = null via `model_validator(mode="before")` → 422; nullable clears (`short_label`, `confidence_level`, `title`, `proposed_text`, `confidence_score`) and omission-means-no-change preserved | `test_explicit_null_on_not_null_patch_fields_rejected` (all rejection forms + no side effects after 422 + clear-on-nullable for both PATCH bodies) |

Revert-probes (each fix temporarily rolled back, matching test re-run):
`test_inline_database_url_... FAILED`, `test_cross_workspace_excerpt_... FAILED`,
`test_generate_forwards_cap_... FAILED` — one failure each; restored → 38/38
pass. Note the wiring test still passed under the reverted URL fix (the
sandbox socket DSN has no password) — exactly the blind spot the synthetic
password-bearing test now covers.

Live spot-check on the rebuilt tree (uvicorn :8103, real inline run):
null PATCH on `statement_text`/`fact_type`/`proposed_structured_json` → **422**
with the row untouched; `short_label:null` clears (200);
`POST /proposals/generate {max_proposals:1}` → `{"created":1,"queued":false}`
through the real `_inline_database_url` path.

### Round 2 (PR #9 comment on `c174051`) — RQ call shape

The finding-3 fix called `Queue.enqueue(fn, sid, wid, kwargs={...})`. RQ 2.x
`Queue.parse_args` asserts `args == ()` whenever explicit `args=`/`kwargs=`
keys are present, so that mix raised `AssertionError: Extra positional
arguments cannot be used when using explicit args and kwargs` **inside** the
helper's try/except — every queued generation would have silently degraded to
the inline fallback, invisible to the suite (the round-1 fake queue accepted
the invalid syntax). Fix: job data now travels only as
`enqueue(fn, args=(source_id, workspace_id), kwargs={"max_proposals": n})`
(`kwargs=None` when the cap is omitted, which still keeps the call in the
explicit form — no positional args are ever used).

Regression test `test_enqueue_forwards_cap_through_real_rq_parsing` drives the
**real** `rq.Queue.enqueue`/`parse_args` (rq is a declared dependency in
`workers/requirements.txt`; hard import, no silent skip) with zero Redis by
stubbing exactly the connection-touching boundary (`create_job`,
`enqueue_job`); it asserts the worker-side wire payload for both the supplied
(`args == ("src-id","ws-id")`, `kwargs == {"max_proposals": 1}`) and omitted
(`kwargs is None`) cap, plus queue name `extract` and `status == "queued"`.
Revert-probed: with the mixed call restored the test FAILS (helper swallows
the assert into `queued: False`), and a direct `Queue.parse_args` probe outside
the module reproduces the integrator's AssertionError verbatim. The superseded
fake-queue test (which had encoded the invalid call shape) was removed —
workers suite stays at 9 tests, floor total 38.

Full `bash scripts/verify_all.sh` at the round-2 commit: migrations up/down/up,
72 passed, ruff clean, web lint/typecheck/build clean — GATE GREEN.

Floor suite grew to **38** (tests/api/test_intake_review.py 29 +
tests/workers/test_intake_jobs.py 9); repo-wide gate re-run at this commit:
migrations up/down/up clean, **72 passed**, ruff clean, web
lint/typecheck/build clean — GATE GREEN.

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

## Normal-worker post-merge fix (2026-09-10)

PR #9 is already integrated. This follow-up fast-forwards the existing assigned
branch to integration `e36caae46d95ca125848336f8993af6f4d1814f0`; new focused PR.
No contract changes, migrations, hub edits, or unrelated implementation changes.

### Cause and fix

A fresh `python -m workers.run_worker` process does not inherit pytest's API
pythonpath. `generate_fact_proposals` imported app models before `_connect`
could bootstrap that path. Call the existing `_ensure_app_importable` inside
the job's try block, before app imports. Bootstrap exceptions still produce the
existing failed result rather than escaping the job.

### Automated proof

- `bash scripts/verify_all.sh`: **95 passed**, migration upgrade/downgrade/upgrade,
  ruff, web lint/typecheck/build; **GATE GREEN**.
- `.venv/bin/python -m pytest -q tests/workers/test_intake_jobs.py`: **11 passed**.
- Fresh subprocess regression removes PYTHONPATH and first asserts `app` cannot
  be found; runs real Postgres generation in three separate interpreters with
  caps 1/2/2, checks complete results, committed totals 1/3/3 and unique provenance.
- Negative probe: remove only the job bootstrap invocation, run
  `test_generation_in_fresh_process_without_pythonpath`: **1 failed**, reason
  `ModuleNotFoundError: No module named 'app'`; restore it: **11 passed**.
- Dedicated bootstrap-failure test confirms status=failed, created=0, reason
  `RuntimeError: synthetic bootstrap failure`, with no exception escaping.

### Real Redis / normal RQ worker proof

Redis 6.2.14 executable installed locally via `pip install redislite` (real server,
not a mock; no dependency-file change). RQ 2.12.0, real embedded Postgres test DB.
Launched separate long-lived processes from repository root:

```bash
.venv/bin/redis-server --bind 127.0.0.1 --port 6387 --save '' --appendonly no

eval "$(.venv/bin/python scripts/agent_pg.py env)"
export DATABASE_URL="$TEST_DATABASE_URL" REDIS_URL=redis://127.0.0.1:6387/0
env -u PYTHONPATH .venv/bin/python -m workers.run_worker
```

No API import-path workaround in the worker. Seeded a unique synthetic user,
workspace, text source and page containing three distinct eligible paragraphs
in **casevault_test**. Used `enqueue_proposal_generation` (extract queue), fetched
real RQ jobs, blocked on `job.latest_result(timeout=30)` and checked return values
in addition to refreshed RQ status. Queried proposals in the independent seed
session after each committed run; all rows system-created/proposed, unique keys.

| Job | Requested cap | RQ | Result status | Created | Skipped | Committed total |
|---|---:|---|---|---:|---:|---:|
| c5b6e1d7-b743-44f8-b804-8d594c5ae102 | 1 | finished | complete | 1 | 2 | 1 |
| c4d4c46e-1618-4b3e-a219-a9e6451dd478 | 2 | finished | complete | 2 | 1 | 3 |
| a1bc2c45-947b-4523-adfd-6b9afdebd60b | 2 | finished | complete | 0 | 3 | 3 |

All reasons null; fetched kwargs exactly matched requested limits. The second
run processes remaining paragraphs; the third proves no duplicate creation once
all eligible paragraphs have provenance (the existing per-run cap semantics).

Cleanup in finally: scoped deletion by fixture IDs, then queries verified **0**
proposals, source_pages, sources, workspaces and users for those IDs. Deleted all
three RQ jobs and asserted **0** remaining job keys. Stopped normal worker and
nonpersistent Redis. No source files or real case data were used.

Fixture IDs: source `b96a2602-6442-4312-9272-404924298457`, workspace
`75640efd-4e04-4563-8e62-7478e8bfd1bb`, user
`044f5c4c-f5dc-49ec-8574-e6aede90e88b`.

Local transcripts: `/tmp/w2g-normal-gate.log`, `/tmp/w2g-normal-negative.log`,
`/tmp/w2g-normal-proof.log` (ephemeral; essential results preserved above).

Reproducible seed/enqueue/assert/cleanup driver (run from repo root after the
above environment setup using `env -u PYTHONPATH .venv/bin/python -c
'exec(open("/tmp/w2g-normal-proof.py").read())'`; save this block to that file):

```python
import os, json, uuid
from workers.pipeline.jobs import _connect
session = _connect(os.environ['TEST_DATABASE_URL'])
from app.models.identity import User
from app.models.workspace import Workspace
from app.models.source import Source, SourcePage
from app.models.intake import Proposal
from app.models.enums import SourceType
from workers.pipeline.intake_jobs import enqueue_proposal_generation
from redis import Redis
from rq.job import Job
from sqlalchemy import select, func, delete
r = Redis.from_url(os.environ['REDIS_URL'])
u = User(email=f'w2g-normal-{uuid.uuid4()}@example.invalid', display_name='Synthetic worker proof')
session.add(u); session.flush()
w = Workspace(name='Synthetic normal-worker proof', created_by_user_id=u.id)
session.add(w); session.flush()
s = Source(workspace_id=w.id, source_type=SourceType.text, title='Synthetic normal-worker proof', storage_path='synthetic/no-file.txt', page_count=1)
session.add(s); session.flush()
session.add(SourcePage(source_id=s.id, page_number=1, page_label='1', ocr_text='\n\n'.join(f'Synthetic paragraph {i}: this is fabricated worker verification text, not case data.' for i in range(3))))
session.commit()
ids = (s.id, w.id, u.id)
jobs = []
print('fixture', *map(str, ids), flush=True)
try:
    for cap, created, total in [(1,1,1),(2,2,3),(2,0,3)]:
        queued = enqueue_proposal_generation(str(s.id),str(w.id),max_proposals=cap)
        assert queued['queued'], queued
        job = Job.fetch(queued['job_id'],connection=r); jobs.append(job)
        result = job.latest_result(timeout=30)
        assert result is not None
        value = result.return_value
        assert value == dict(job='generate_fact_proposals',status='complete',created=created,skipped=3-created,reason=None), value
        assert job.get_status(refresh=True).value == 'finished'
        assert job.kwargs == {'max_proposals':cap}
        session.expire_all()
        rows = list(session.scalars(select(Proposal).where(Proposal.source_id==ids[0])))
        assert len(rows)==total
        assert len({p.proposed_structured_json['provenance_key'] for p in rows})==total
        assert all(p.created_by_system and p.review_state.value=='proposed' for p in rows)
        print(json.dumps(dict(job_id=job.id,rq_status=job.get_status().value,kwargs=job.kwargs,result=value,committed=total)),flush=True)
finally:
    session.rollback()
    for model, condition in [(Proposal,Proposal.source_id==ids[0]),(SourcePage,SourcePage.source_id==ids[0]),(Source,Source.id==ids[0]),(Workspace,Workspace.id==ids[1]),(User,User.id==ids[2])]:
        session.execute(delete(model).where(condition))
    session.commit()
    for model, condition in [(Proposal,Proposal.source_id==ids[0]),(SourcePage,SourcePage.source_id==ids[0]),(Source,Source.id==ids[0]),(Workspace,Workspace.id==ids[1]),(User,User.id==ids[2])]:
        count=session.scalar(select(func.count()).select_from(model).where(condition)); assert count==0
        print('cleanup',model.__tablename__,count,flush=True)
    for job in jobs: job.delete()
    assert all(not r.exists(job.key) for job in jobs)
    print('cleanup Redis job keys: 0',flush=True)
    session.close()

```

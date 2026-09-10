# W2-J — Wave 2 end-to-end verification + CI job

Contract: `docs/contracts/wave2_intake_core.md` v1.0 (frozen)
Branch: `arena/01a089cd-casevault` · PR #3
**Status:** integrator findings 1–5 addressed; **full merged-tip proof done** on
the integration tip `908e96f` (W2-G merged at `4d13527`, head `93656db`) **plus a
hardened layer** (cap, bulk partial success, forbidden acceptance paths, link
uniqueness) rehearsed against the real G code. Inline generation is green; the
**queued generation path has one open deviation against W2-G** (worker cannot
import `app`; the job swallows the error and RQ still reports success) — reported
below, minimal change identified, no feature code touched in this PR.

**Branch state:** rebased onto the post-W2-G integration tip `908e96f`; the diff
against it is exactly the five J files (+3001 lines, **zero deletions**), so the
PR is reviewable as-is and carries no other workstream's content. The WS-A note
that this session branch once held is not in the diff.

## What changed

Write set only: `scripts/intake_smoke.py`, `tests/integration/test_intake_e2e.py`,
`tests/integration/test_intake_e2e_guards.py` (new — the negative-path suite the
review asked for; additive file in the J surface, no other workstream owns it),
`.github/workflows/ci.yml` (append one `intake` job), `handoff/notes/W2-J.md`.
No feature code, no hub files, no migrations.

Beyond the five findings, the same files now verify **both generation shapes**
(inline counters and the real-queued path) and expose `--generation-wait` /
`INTAKE_GENERATION_WAIT` for the queued wait; the guard suite grew to 20 tests.
W2-G's queued-path defect found by that work is reported below with a one-line
minimum change — deliberately **not** fixed here.

### Integrator findings → what changed → proof

| # | Finding (PR #3 review) | Fix | Proof |
|---|---|---|---|
| 1 | `Path(__file__).resolve().parents[2]` used as the repo root; `import intake_smoke` fails in clean standalone CI | Both modules now locate the root by **marker files** (`pytest.ini` + `scripts/intake_smoke.py`) walking up from `__file__` — no depth arithmetic. `find_repo_root()` in the smoke, `_repo_root()` in the test (deliberate duplicate so the test can bootstrap before importing the module) | `test_repo_root_found_by_marker`, `test_repo_root_is_importable_without_pythonpath`, plus the exact CI command run with `PYTHONPATH` unset from two CWDs (below) |
| 2 | Explicit DB failures still `skip`; missing tables/routes skip too | Fail-closed policy: explicitly configured target that is empty/unparseable/**unreachable** → **FAIL**; `DATABASE_URL` is never a fallback; missing tables/routers → **FAIL** when `INTAKE_REQUIRE=1` (CI + merged-tip), otherwise exit 2 / skip **with an explicit reason** (pre-merge park only) | Fail-closed matrix below (7 cases, exit codes) + `INTAKE_REQUIRE=1` failure on an unmigrated database |
| 3 | `Base.metadata.create_all()` can heal a defective migration | Removed from the verification path. The test now verifies the **migrated** schema only and fails/skips on missing tables | Unmigrated database still has **zero** tables after two pytest runs (`tables: (none — the verifier created no schema)`) |
| 4 | Smoke printed the full DB URL (credentials) | `redact()` / `redact_url()` applied to every log line, configuration message, deviation and connection diagnostic; URLs print as `scheme://***@host/db` | `grep -c "s3cret\|:pw@\|sup3rsecret"` → 0 in both entry-point logs; `test_redaction_hides_credentials`, `test_log_lines_are_redacted` |
| 5 | CLI fell back to `DATABASE_URL` and migrated it | Explicit disposable target required (`--database-url` or `TEST_DATABASE_URL`); synthetic rows deleted by id after every run (including deviations); scratch upload dir + pytest scratch storage removed; no truncation, no shared identity rows touched | `collect_fixtures`/`cleanup_fixtures` + `cleaned up 23 synthetic row(s) created by this run`; before/after counts `0 → 0`; `test_collect_fixtures_is_scoped_to_this_run`, `test_cleanup_spec_covers_every_table_the_flow_creates` |

**Finding 5 nuance (please confirm):** a target *byte-identical to* `DATABASE_URL`
warns loudly (`WARNING: … is identical to DATABASE_URL … set INTAKE_ALLOW_APP_DB=1
to acknowledge it`) instead of hard-refusing, because the integrator-owned
`scripts/verify_all.sh` exports `DATABASE_URL` and `TEST_DATABASE_URL` to the same
throwaway database by design — a hard refusal there would red the wave gate. The
*fallback* is gone (that was the risk), and the equality case is never silent.

## Proof

Environment: no Docker; repo `.venv` + `pgserver`, embedded Postgres 16. For the
queued path, a real Redis 6.2.14 server (binary from the `redislite` wheel,
extracted outside the repo — **not** a dependency) on `127.0.0.1:16379` and a real
RQ worker 2.12. Port 6399 is deliberately avoided: other workstreams' tests use it
as their "explicitly unreachable" endpoint.

### A0. Final merged-tip run (`908e96f`, W2-G merged at `4d13527`)

```
$ bash scripts/verify_all.sh            # full, incl. web
==> Database              fresh casevault_test created
==> Migrations            upgrade 0001..0004 -> downgrade base -> upgrade head
==> pytest (real Postgres) 93 passed, 3 warnings in 5.95s
==> ruff                  All checks passed!
==> web: lint / typecheck / build   (next lint + tsc + next build, 19 routes)
GATE GREEN — python, migrations, lint and web all pass.

$ pytest tests/integration/test_intake_e2e_guards.py -q
20 passed in 1.22s

$ INTAKE_REQUIRE=1 pytest tests/integration/test_intake_e2e.py -v
1 passed, 2 warnings in 1.52s

$ INTAKE_REQUIRE=1 python scripts/intake_smoke.py --require-intake
  PASS: generated 3 proposals (inline counters)
  PASS: re-run created nothing (idempotent)
  PASS: cleaned up 23 synthetic row(s) created by this run
SMOKE GREEN — all intake steps passed; deviations: none
generation mode: inline (jobs=none; waits=n/a)
```

### A. Rehearsal against corrected W2-G (pre-merge history)

```
$ env -u PYTHONPATH pytest tests/integration/test_intake_e2e_guards.py -q
14 passed in 0.79s

$ env -u PYTHONPATH -u DATABASE_URL INTAKE_REQUIRE=1 TEST_DATABASE_URL=<disposable> \
    pytest tests/integration/test_intake_e2e.py -v
tests/integration/test_intake_e2e.py::test_intake_e2e_full_flow PASSED
1 passed

$ env -u PYTHONPATH -u DATABASE_URL TEST_DATABASE_URL=<disposable> \
    python scripts/intake_smoke.py --require-intake
mode: required (missing surfaces FAIL)
STEP: 5b. bulk review is partial-success and never approves
  NOTE: created_facts element type: fact ids (strings) (contract 4.2 leaves this unspecified)
  PASS: bulk accept on 2 proposals: 2 facts created `proposed` (floor holds)
  PASS: bulk partial success: good id committed, failing id reported, no rollback
  PASS: bulk reject: partial success, no facts created
STEP: 5c. forbidden acceptance paths on proposals (422, then left untouched)
  PASS: proposal create with review_state rejected with 422
  PASS: proposal patch with review_state rejected with 422
  PASS: review body with an unknown/forbidden field rejected with 422
  PASS: reject probes left the proposal `proposed`
  PASS: accept without a matter rejected with 422; proposal left `proposed`
STEP: 6 … PASS: approved; repeat approve 409; trusted set contains it
STEP: 7 … PASS: source-link unique …: strength ignored, NULL excerpt not a wildcard, new support_type allowed
STEP: 8 … PASS: actor-link unique includes role_in_fact; NULL role duplicates NULL, new role allowed
STEP: 9 … PASS: ledger CSV round-trip, dry_run wrote nothing, malformed header 422, re-import skipped
STEP: 10 … PASS: supersede → old `superseded`, new `proposed`; re-transition 409; `accepted` via /review-state 409
STEP: 11 … PASS: cleaned up 23 synthetic row(s) created by this run
SMOKE GREEN — all intake steps passed; deviations: none

$ bash scripts/verify_all.sh --no-web          # on the rehearsal tree
==> pytest (real Postgres)   87 passed, 3 warnings
==> ruff                     All checks passed!
GATE GREEN — python, migrations, lint and web all pass.
```

### A1. Hardened verifier rehearsed against the real W2-G code

Added after the merge gate passed, then rehearsed on the same tree
(`/tmp/w2j_pre`, G head `c174051`, fresh disposable DB):

| new coverage | result against real G |
|---|---|
| **2b. `max_proposals` cap** (`generate max_proposals=2` on a 3-paragraph source) | `created=2 skipped=1` and exactly 2 rows stored — contracts §4.4; in queued mode this is the assertion that proves the cap actually reaches the **worker** (RQ kwargs path, G review finding 3) |
| **5b. bulk partial success** (matter-carrying fixtures) | 1 of 2 ids ok with the failing id reported (no rollback), exactly 1 `proposed` fact created, read-back `proposed`; reject: 1 of 2 ok, `created_facts` empty, rejected state committed |
| **5b note. matter-less generator output** | `ok=false` "Facts require a matter…" — **not failed**, this is contract tension 4.4+4.2+2 below |
| **5c. forbidden acceptance paths** | `review_state` on POST/PATCH 422, unknown review-body field 422, accept with no matter 422 and the proposal left `proposed` |
| **7. source-link uniqueness** | same tuple + different `strength` → 409 (strength not in the key), new `support_type` → 201, repeat → 409, list shows 2 links; §4.3/§2 |
| **8. actor-link uniqueness** | NULL role duplicates NULL → 409, `role_in_fact=witness` → 201, repeat → 409, list shows 2 links |

```
$ TEST_DATABASE_URL=<disposable> INTAKE_REQUIRE=1 python scripts/intake_smoke.py --require-intake
STEP: 2b. POST /proposals/generate with max_proposals=2 (cap honored in this shape)
  PASS: inline cap run: created=2 skipped=1
STEP: 5b. bulk review is partial-success and never approves
  PASS: bulk accept: 1 of 2 ids ok, fact <id> created `proposed` (failing id: 'Proposal already reviewed (accepted)…')
  PASS: bulk reject: 1 of 2 ids ok, no facts created, good id committed
  NOTE: bulk accept of a matter-less generated proposal cannot commit: 'Facts require a matter…'
STEP: 5c. forbidden acceptance paths on proposals (422, state untouched)   → all PASS
STEP: 7/8. link uniqueness …                                              → both PASS
SMOKE GREEN — all intake steps passed; deviations: none
  PASS: cleaned up 24 synthetic row(s) created by this run

$ pytest tests/integration/test_intake_e2e_guards.py -q          → 20 passed
$ INTAKE_REQUIRE=1 pytest tests/integration/test_intake_e2e.py   → 1 passed
$ bash scripts/verify_all.sh --no-web                            → 93 passed, ruff clean, GATE GREEN
leftovers afterwards: matters=0 sources=0 proposals=0 facts=0 source_links=0 actor_links=0
```

**Lesson recorded for the next agent:** the first rehearsal of step 7 reported a
false deviation (`new support_type → 409`) because the patch had left *two* copies
of the probe in the file, so the second copy replayed a now-duplicate tuple. The
verifier's own bugs surface exactly like product deviations do — when a new probe
fails, isolate it below the flow (four raw requests against a fresh schema) before
reporting it, and dedupe after every patch. Product-side, the isolated probe
confirmed G is contract-correct here.

### B. Fail-closed matrix (exact commands, exit codes)

| case | command | result |
|---|---|---|
| no explicit target (only `DATABASE_URL`) | `DATABASE_URL=<app> TEST_DATABASE_URL= python scripts/intake_smoke.py` | **exit 1** — `CONFIGURATION FAILURE: no disposable test database configured: pass --database-url or set TEST_DATABASE_URL. DATABASE_URL is deliberately not used as a fallback` |
| empty explicit target | `TEST_DATABASE_URL="" pytest tests/integration/test_intake_e2e.py` | **exit 1 / error** (was a green skip before) |
| unparseable target | `TEST_DATABASE_URL=not-a-database-url …` | **exit 1** (`ConfigurationError`) |
| unreachable target | `TEST_DATABASE_URL=postgresql://postgres@/nope?host=/tmp/does-not-exist` | smoke **exit 1**, pytest **failed**: `database configured via TEST_DATABASE_URL is unreachable at postgresql://local-socket/nope: …` (redacted) |
| unmigrated DB, park mode | `TEST_DATABASE_URL=<empty db> pytest …` | **1 skipped** with reason `intake tables missing (…): migration 0004 is not applied` |
| unmigrated DB, required mode | `INTAKE_REQUIRE=1 TEST_DATABASE_URL=<empty db> pytest …` | **error / exit 1**: `intake tables missing … — INTAKE_REQUIRE=1 forbids skipping` |
| schema repair | after both runs on the empty DB: `inspect(engine).get_table_names()` | `(none — the verifier created no schema)` |

### C. Credential-safe output

```
$ env … python scripts/intake_smoke.py 2>&1 | grep -c "s3cret\|:pw@\|sup3rsecret"
0
$ python -c "import intake_smoke as m; print(m.redact_url('postgresql://user:s3cret@host:5432/db'))"
postgresql://***@host/db
```

### D. Test isolation + cleanup

```
before:  matters=0 actors=0 sources=0 proposals=0 facts=0 page_links=0
run:     e2e (required mode) + smoke --require-intake   → both green
after:   matters=0 actors=0 sources=0 proposals=0 facts=0 page_links=0
```

Cleanup deletes only ids collected for this run (`uid` appears in the text, or the
row hangs off this run's own matters/source), in FK-safe order, and never touches
the shared local user/workspace. The scratch upload dir and the pytest scratch
storage dir are removed on every exit path.

### E. Standalone import (finding 1, exact CI command)

```
$ cd <repo> && env -u PYTHONPATH pytest tests/integration/test_intake_e2e.py -q
   (no PYTHONPATH, no editable install — root found by marker; result depends on DB config, never on import errors)
$ cd /tmp && env -u PYTHONPATH pytest /repo/tests/integration/test_intake_e2e.py -q
   (same: imports resolve from any CWD)
```

### F. CI

On the pushed head, CI runs `intake` (new, additive) plus the existing jobs;
`python`, `web` and `intake` pass. The `secrets` (gitleaks) job is the known
WS-D flake: it failed on one of two runs of the *same* commit (the sibling run
passed) and fails on this branch's earlier heads while the integration branch
runs happen to pass — the documented missing `GITHUB_TOKEN` env block that WS-D
owns (`handoff/WORKLOG.md`). This workstream does not touch that job.

`.github/workflows/ci.yml` gains one **additive** job (`intake`) with
`INTAKE_REQUIRE=1` + `INTAKE_ALLOW_APP_DB=1`, running the guard suite, the e2e
integration test and `python scripts/intake_smoke.py --require-intake`.
The existing `python`, `web` and **WS-D's `secrets` (gitleaks) job are untouched**
(verified by parsing the workflow: `jobs: ['python', 'web', 'secrets', 'intake']`,
secrets job still ends with `gitleaks/gitleaks-action@v2`).

### G. Queued generation (real Redis + real RQ worker) — and the deviation it found

W2-G's integration note says queued `created/skipped=0` are placeholders and that
"no real Redis execution was proved; the end-to-end verifier remains responsible
for that distinction". The smoke now verifies **both** shapes: inline counters, or
(Redis reachable) the proposals actually committed by a real worker, waited for up
to `INTAKE_GENERATION_WAIT` seconds (default 90) and never trusted from the
placeholders.

Green queued run (`make worker` equivalent, `apps/api` importable in the worker):

```
$ REDIS_URL=redis://127.0.0.1:16379/0 TEST_DATABASE_URL=<disposable> \
    INTAKE_REQUIRE=1 python scripts/intake_smoke.py --require-intake
  NOTE: generation ENQUEUED (queued=true job_id=73f4cb0a-…): created/skipped are
        placeholders, not job results (W2-G KNOWN_ISSUES) — verifying the committed
        proposals, not the counters
  PASS: queued job produced 3 proposals in 2.1s (statuses=[<JobStatus.FINISHED>])
  PASS: re-run job finished with no new proposals (idempotent, 1.5s, 2 jobs)
  PASS: cleaned up 23 synthetic row(s) created by this run
SMOKE GREEN …  generation mode: queued (jobs=[73f4cb0a…, 4ff2319a…]; waits=[2.1, 1.5])

$ # real RQ job results, read back from the worker's registry
73f4cb0a FINISHED {'job': 'generate_fact_proposals', 'status': 'complete', 'created': 3, 'skipped': 0, 'reason': None}
4ff2319a FINISHED {'job': 'generate_fact_proposals', 'status': 'complete', 'created': 0, 'skipped': 3, 'reason': None}
```

So the queue plumbing, the `max_proposals` kwargs (finding 3 of the G review), the
sweep itself and queued idempotency are genuinely exercised — the second job really
did skip all three paragraphs.

**Deviation — report to the integrator, do not fix in this PR (W2-G file).**

`python -m workers.run_worker` (i.e. `make worker`) in a plain process cannot import
`app`; `generate_fact_proposals` swallows that and returns `status="failed"` inside
a job RQ marks **FINISHED / "Job OK"**, so queued generation silently creates
nothing. The API still answers `queued=true, created=0, skipped=0`, which is
indistinguishable from a legitimately empty sweep.

```
$ DATABASE_URL=<.env.local value> REDIS_URL=redis://127.0.0.1:16379/0 \
    .venv/bin/python -m workers.run_worker          # no PYTHONPATH
06:57:31 extract: …generate_fact_proposals('<source>', '<workspace>', max_proposals=10)
generate_fact_proposals failed for source <source>
  File "/…/workers/pipeline/intake_jobs.py", line 57, in generate_fact_proposals
    from app.models.enums import ProposalType, ReviewState
ModuleNotFoundError: No module named 'app'
06:57:31 Successfully completed … job in 0:00:00.099s
06:57:31 extract: Job OK (994e0e9e-…)

$ # the verifier turns that into an actionable deviation:
DEVIATION [generate] POST /proposals/generate (queued): expected 3 proposals visible
for the source …; job result(s): 994e0e9e: status=failed reason=ModuleNotFoundError:
No module named 'app'; a job that returned status=failed still shows as FINISHED in
RQ (the job swallows its exceptions) — check the worker log … (contract 4.4)
  PASS: cleaned up 5 synthetic row(s) created by this run
```

- Root cause: `enqueue_proposal_generation()` calls `_ensure_app_importable()`,
  `generate_fact_proposals()` never does before its `from app.…` imports
  (`workers/pipeline/intake_jobs.py:57`). W2-G's own tests cannot see this because
  `pytest.ini` sets `pythonpath = apps/api workers`.
- **Minimum change (one line):** call `_ensure_app_importable()` at the top of
  `generate_fact_proposals()` (before the app imports) — or equivalently in
  `workers/run_worker.py` before `Worker(...).work()`. With `apps/api` on the
  worker's path the same run is green and the results above are produced; nothing
  else in the job needed to change.
- Related, worth a ruling but not a verifier failure: the **queued** job does not
  receive the API session's DB URL (only the inline path passes
  `database_url=`), so the worker must have `DATABASE_URL` — fine for
  `make env-create` + `.env.local`, but it makes the API's `queued=true` answer a
  promise the client cannot check. Minimum change if you want it closed: let the
  job raise on failure (RQ then marks it failed) or expose the job result.
- Verified both ways: the verifier stays green on the queued path once the worker
  bootstraps the path, and fails loudly (with the reason) when it does not.

**Verifier fix made here (my bug, found by the same run):** `main()` gated fixture
cleanup on a successful flow return, so a mid-flow deviation leaked the rows
created so far. Cleanup is now driven by the incrementally-filled `fixtures` dict
(`cleanup_after_run`), and the deviation run above proves it: `cleaned up 5
synthetic row(s)`, target counts back to `0/0/0/0`. Regression tests: 20 guards
(5 new for the queued path, 2 for cleanup-after-deviation incl. the wiring).

## Contract gaps

Carried (both are contract silence, not defects; recorded for a ruling):

1. **§4.4 + §4.2 + §2 — bulk accept cannot commit a generated proposal.** The
   §4.4 job creates proposals with `matter_id = null`, §2 requires
   `fact_assertions.matter_id` NOT NULL, and §4.2's bulk body has no `edits`, so
   `bulk-review action=accept` on generator output answers per-id
   `ok=false, error="Facts require a matter…"`. W2-G's behaviour is correct and
   safe; §5.2's “bulk select with the same actions” is unreachable for generator
   output. Minimum change: allow `edits.matter_id` in the bulk body, or stamp a
   default matter in `generate`. The smoke **notes** this case (does not fail it)
   and the UI-visible half is already documented in `handoff/notes/W2-I.md`.
2. **§4.2 — `created_facts` element type unspecified.** W2-G returns fact **ids**;
   W2-I's `BulkReviewResult.created_facts` is typed `Fact[]` (it only reads
   `.length`). Minimum change: one §4.2 line (`created_facts: [uuid]`) plus a type
   tweak in the WS-I section. The verifier normalises both shapes and asserts the
   floor on read-back (`GET /facts/{id}`), so it cannot be fooled by either.
3. Earlier assumptions A1 (CSV import `matter_id` query param), A2 (action
   endpoints answer 200) and A3 (`accept` may carry `edits.matter_id`) all held
   against the real W2-F/W2-G code — no longer open.

## Risks / follow-ups

- **Merged-tip proof is complete** on `908e96f` (see A0): gate 92 passed + web,
  guards 19, e2e required 1, smoke green in inline mode; the queued path is green
  with the worker path bootstrap and fails loudly without it (see G).
- **Open deviation (W2-G, not this PR):** queued generation is a silent no-op in a
  plain worker process — `_ensure_app_importable()` is missing before
  `generate_fact_proposals`'s `app` imports, the job swallows the error and RQ
  reports "Job OK". One-line fix available; until it lands, CI (no Redis) and
  operator runs without `apps/api` on the worker's path never create proposals.
  Re-run the queued proof after that fix and record the new job ids here.
- Strict assertions that could false-fail on a valid-but-different reading:
  `generate` returning exactly `created=3/skipped=1` for the 4-paragraph fixture,
  CSV header order exact, link-list GETs as bare arrays. A failure there means
  “ruling needed”, not “verifier bug”.
- `matter_links` cleanup covers both `from_matter_id` and `to_matter_id`; the
  shared local user/workspace are intentionally left alone.
- The WS-A verification note that had been pushed onto this session branch is
  **not** part of the J-only diff; it lives in the pre-rebuild history
  (`19346d3`, previously `afef55b`) and a copy is preserved outside the repo.
  Integrator: cherry-pick it if you want it in the tree.

## What the next agent must know

- Entry points and their flags/env:
  - `python scripts/intake_smoke.py [--database-url URL] [--require-intake] [--generation-wait SECONDS] [--keep-uploads] [--keep-fixtures]`
  - `pytest tests/integration/test_intake_e2e_guards.py -v` (no DB needed)
  - `pytest tests/integration/test_intake_e2e.py -v` (needs a migrated disposable DB;
    inline path pinned by default, `INTAKE_E2E_QUEUED=1` exercises the real queue)
  - `INTAKE_REQUIRE=1` = fail instead of park; `INTAKE_ALLOW_APP_DB=1` = acknowledge
    a target identical to `DATABASE_URL` (CI service container);
    `INTAKE_GENERATION_WAIT` = queued wait in seconds (0 refuses queued mode).
  - Queued proof recipe: `REDIS_URL=<redis> DATABASE_URL=<db> python -m workers.run_worker`
    (with `apps/api` importable — see deviation G) plus
    `REDIS_URL=<redis> TEST_DATABASE_URL=<same db> python scripts/intake_smoke.py --require-intake`.
    Don't use port 6399: the other workstreams' tests treat it as unreachable.
- Sandbox recipe: `bash scripts/setup_local.sh`; `.venv/bin/pip install pgserver`;
  `.venv/bin/python scripts/agent_pg.py start`; `eval "$(.venv/bin/python scripts/agent_pg.py env)"`.
  Use the venv python for `agent_pg.py` (system python lacks `pgserver`).
- Never point the verifier at a database with real case data: it migrates the
  target and writes synthetic rows (deleted afterwards).
- Every assertion cites a contract section in its failure message, so a red run is
  a ready-made gap report: copy the `DEVIATION …` line into the note and send it to
  the integrator (§4.1) rather than editing feature code.

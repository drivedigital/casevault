# W2-J — Wave 2 end-to-end verification + CI job

Contract: `docs/contracts/wave2_intake_core.md` v1.0 (frozen)
Branch: `arena/01a089cd-casevault` · PR #3
**Status:** integrator review findings 1–5 addressed and rehearsed against the
corrected W2-G head (`c174051`); the **final merged-tip proof still waits for the
integrator's merge of the corrected W2-G**.

## What changed

Write set only: `scripts/intake_smoke.py`, `tests/integration/test_intake_e2e.py`,
`tests/integration/test_intake_e2e_guards.py` (new — the negative-path suite the
review asked for; additive file in the J surface, no other workstream owns it),
`.github/workflows/ci.yml` (append one `intake` job), `handoff/notes/W2-J.md`.
No feature code, no hub files, no migrations.

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

Environment: no Docker; repo `.venv` + `pgserver`, embedded Postgres 16.
Rehearsal tree = this branch's files applied to **corrected W2-G**
(`c174051`, the head that fixes the four integrator-review defects) in a scratch
worktree (`/tmp/w2j_pre`); nothing from it is committed.

### A. Rehearsal against corrected W2-G

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

`.github/workflows/ci.yml` gains one **additive** job (`intake`) with
`INTAKE_REQUIRE=1` + `INTAKE_ALLOW_APP_DB=1`, running the guard suite, the e2e
integration test and `python scripts/intake_smoke.py --require-intake`.
The existing `python`, `web` and **WS-D's `secrets` (gitleaks) job are untouched**
(verified by parsing the workflow: `jobs: ['python', 'web', 'secrets', 'intake']`,
secrets job still ends with `gitleaks/gitleaks-action@v2`).

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

- **Final merged-tip proof still pending** the corrected W2-G merge. On the
  current integration tip (no G) the verifier correctly *parks*: smoke exits 2 and
  `--require-intake` fails, because `/proposals`/`/facts` are E's empty stubs. That
  is the designed pre-merge state, not a defect.
- After the merge, the final pass is: rebase → `bash scripts/verify_all.sh` (full,
  incl. web) → `pytest tests/integration/test_intake_e2e_guards.py -v` →
  `INTAKE_REQUIRE=1 pytest tests/integration/test_intake_e2e.py -v` →
  `python scripts/intake_smoke.py --require-intake` on the merged sha.
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
  - `python scripts/intake_smoke.py [--database-url URL] [--require-intake] [--keep-uploads] [--keep-fixtures]`
  - `pytest tests/integration/test_intake_e2e_guards.py -v` (no DB needed)
  - `pytest tests/integration/test_intake_e2e.py -v` (needs a migrated disposable DB)
  - `INTAKE_REQUIRE=1` = fail instead of park; `INTAKE_ALLOW_APP_DB=1` = acknowledge
    a target identical to `DATABASE_URL` (CI service container).
- Sandbox recipe: `bash scripts/setup_local.sh`; `.venv/bin/pip install pgserver`;
  `.venv/bin/python scripts/agent_pg.py start`; `eval "$(.venv/bin/python scripts/agent_pg.py env)"`.
  Use the venv python for `agent_pg.py` (system python lacks `pgserver`).
- Never point the verifier at a database with real case data: it migrates the
  target and writes synthetic rows (deleted afterwards).
- Every assertion cites a contract section in its failure message, so a red run is
  a ready-made gap report: copy the `DEVIATION …` line into the note and send it to
  the integrator (§4.1) rather than editing feature code.

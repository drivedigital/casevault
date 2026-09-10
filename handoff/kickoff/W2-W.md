<!-- Brief + paste-ready prompt for one agent session (post-Wave-2 hotfix track).
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Source material: handoff/OCR_CRASH_REPORT.md (committed 733840c) + the owner-held
     review of that report, 2026-09-10 -->

# W2-W — Darwin-safe worker process model (macOS fork-safety crash)

**Owner:** one agent session (the integrator decides which — a fresh session is fine)
**Branch:** base = `arena/01a0899f-casevault` (integration tip)
**Merge order:** independent — *not* part of the E → F → G → J chain. Land before the next
local-tester round.
**Assigned:** 2026-09-10 by the W2-J verifier session (`arena/01a089cd-casevault`) at the
owner's request. The roster row in `handoff/kickoff/README.md` is the integrator's to add.

## Why this exists

The local tester's macOS box aborts the RQ worker with `SIGABRT` the moment a queued job
connects to Postgres. The crash is **fork-model × libpq GSS on macOS**:

- RQ 2.12's default `Worker` runs **every job in an `os.fork()` child**
  (`rq/worker/worker_classes.py` → `Worker.fork_work_horse`).
- The child's first DB action is `psycopg2.connect`; libpq's default `gssencmode=prefer`
  probes for Kerberos/GSS credentials (`pg_GSS_have_cred_cache`), which initialises
  CoreFoundation/Objective-C — forbidden in a macOS fork child → `SIGABRT`
  (`Namespace OBJC`, "crashed on child side of fork pre-exec").

Evidence: dev-logs `79ca457` (`py_error.txt`, `ocr_error.txt`), `handoff/OCR_CRASH_REPORT.md`,
and the integrator's triage in `handoff/KNOWN_ISSUES.md` ("Local macOS native worker crash").

**Not the fix:** `multiprocessing.set_start_method('spawn', force=True)` — RQ does not use
multiprocessing to execute jobs, and macOS already defaults to spawn. **Not allowed:**
`OBJC_DISABLE_INITIALIZE_FORK_SAFETY`, global `gssencmode=disable`, or any `sslmode` weakening
in shipped config.

---

## Paste this into the agent session

```
Workstream **W2-W** (post-Wave-2 hotfix) of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and this brief first, then base your
session branch on the integration tip (step 0 in `handoff/kickoff/README.md`).

## Problem
The local tester's macOS machine aborts the RQ worker with SIGABRT as soon as a queued job
touches Postgres. Root cause (reviewed, do not re-litigate): RQ's default worker executes jobs
in an os.fork() child; the child's psycopg2.connect triggers libpq's GSS/Kerberos credential
probe, which initialises CoreFoundation/Objective-C and is illegal in a macOS fork child.
It is not OCR, not inherited parent connections (the launcher opens none), and not fixed by
multiprocessing start-method changes. Evidence: dev-logs 79ca457, handoff/OCR_CRASH_REPORT.md,
handoff/KNOWN_ISSUES.md.

## Deliverable
1. `workers/run_worker.py` — choose the RQ worker class per platform; Linux default unchanged:
   - `sys.platform == "darwin"` -> non-forking class: `rq.SpawnWorker` (fresh interpreter per
     job). If the installed rq lacks `SpawnWorker`, use `SimpleWorker` with a loud warning —
     never silently fall back to the forking `Worker` on Darwin.
   - everywhere else -> today's `rq.Worker`.
   - explicit override `CASEVAULT_WORKER_CLASS=worker|spawn|simple` (unknown value -> exit
     non-zero with a clear message). The override is how the spawn path is exercised on Linux;
     document it in the note.
   - keep `python -m workers.run_worker` / `make worker`, dotenv loading, the queue list and the
     connection wiring exactly as they are; log the selected class.
   - keep redis/rq imports lazy (repo posture: modules stay importable without redis) and put
     the selection in a small pure function so it is unit-testable.
2. `tests/workers/test_worker_process_model.py` — selection per platform, override, unknown-value
   failure, and "Darwin never selects the forking Worker". No network/DB needed.
3. `handoff/notes/W2-W.md` — §4.4 format: what changed, raw proof, contract gaps, risks,
   what the next agent must know — plus the macOS proof block for the local tester and your
   dependency decision.

## Write set (nothing else)
`workers/run_worker.py`, `tests/workers/test_worker_process_model.py`, `handoff/notes/W2-W.md`.
NOT yours: `workers/queues.py`, `workers/pipeline/**`, `apps/**`, `tests/api/**`,
`tests/integration/**`, `scripts/**`, `.github/**`, `Makefile`, `README.md`,
`handoff/TESTING.md`, both `requirements.txt` files. Request changes there in your note;
dependency changes need integrator approval (AGENT_POLICY §5).

## Facts you need
- `workers/requirements.txt` declares `rq>=1.16,<3`, but `SpawnWorker` exists only in rq >= 2.2.0
  (verified against the 1.16.2 / 2.0.0 / 2.1.0 / 2.2.0 wheels). State your compatibility
  decision explicitly: request `rq>=2.2,<3` in the note, and/or ship the guarded `SimpleWorker`
  fallback.
- `_ensure_app_importable()` (merged `fac1568`, `workers/pipeline/jobs.py`) is what lets a fresh
  spawned interpreter import the app; the spawn path leans on it. Do not weaken it.
- RQ 2.12 `SpawnWorker` re-execs `sys.executable -c ...` with the same cwd/env, so the job must
  stay importable from a clean process — your Linux spawn run below is the proof of that.
- `SimpleWorker` runs jobs inside the worker process: no fork, but a crashing job takes the
  worker down and timeout semantics differ. Justify it if you use it as a fallback.
- The Linux default path is already verified end-to-end (W2-J, tested `409b234`). A Darwin fix
  that changes the Linux class is a regression and will be rejected.
- Never point tests/smoke at a DB with real case data; scratch Redis must not use port 6399
  (other workstreams treat it as unreachable). Use 16379.

## Proof required (paste raw output in the note)
1. `pytest tests/workers/test_worker_process_model.py -v` — green.
2. `bash scripts/verify_all.sh` (or `--no-web` with a stated reason) on a fresh DB — green.
3. Linux spawn-path E2E — real Redis + real worker, no PYTHONPATH:
   `env -u PYTHONPATH CASEVAULT_WORKER_CLASS=spawn .venv/bin/python -m workers.run_worker`
   with `REDIS_URL=<scratch redis>` and `DATABASE_URL=<scratch db>`, driving
   `python scripts/intake_smoke.py --require-intake` and/or
   `INTAKE_E2E_QUEUED=1 pytest tests/integration/test_intake_e2e.py -q`.
   Show job-result payloads (`status=complete`, created/skipped) — RQ `FINISHED` alone is not
   proof — and the flow the tester actually clicks: `POST /sources/{id}/reprocess` -> 202 ->
   queued job completes with committed output.
4. Linux default unchanged — the same smoke with no override, green, same job results.
5. macOS local proof block (blocking for closure; this sandbox cannot run it): copy-paste
   commands for the local tester and what to capture — exact worker command, `python -V`,
   `pip freeze | grep -i rq`, `git rev-parse HEAD` + `git status --porcelain`,
   `env | grep -E 'PG|REDIS|DATABASE'`, worker stdout/stderr, the UI -> **Reprocess OCR** ->
   queue -> worker flow, the job result and committed output, the worker surviving two
   sequential jobs, and absence of the SIGABRT stack.
6. GSS row re-test with propagation proven: `PGGSSENCMODE` unset vs `disable`, printed from
   inside the worker at startup, no `gssencmode` in the DSN, worker restarted; record the
   outcome either way (criterion 5 of the assigned review).

## Rules that bite here
- Do not touch the verifier's files (`scripts/intake_smoke.py`,
  `tests/integration/test_intake_e2e*.py`) or the CI job.
- No new mandatory dependency; no queue-name, response-shape or contract change.
- If you cannot make a claim true, say so in the note. A green Linux gate does not prove macOS;
  report blockers in the note and to the owner.
- After merge the W2-J verifier re-runs the normal-worker queued verification plus the Linux
  spawn-path smoke; keep `python -m workers.run_worker` working with PYTHONPATH unset.
- Finish per AGENT_POLICY §6: write `handoff/notes/W2-W.md`, push the branch, open a PR into
  `arena/01a0899f-casevault`, and report branch + sha.
```

---

## Reference for the integrator

- The assignment comes from the verifier's review of `handoff/OCR_CRASH_REPORT.md` (`733840c`);
  the full review is owner-held (`733840c-fork-safety-review.md`, outside the repo). The
  report's own "Fix Verified" claim and its `set_start_method` proposal are wrong — the
  corrected statement is above.
- Close conditions are criteria 1–6 in the pasted block; **5 and 6 need the local tester**, so
  the agent's PR can be green and merged while the issue stays open until the Mac proof lands.
- Suggested PR title: `W2-W: Darwin-safe worker process model (macOS fork-safety)`.

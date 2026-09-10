# W2-W — macOS fork-safety: platform-aware RQ worker class (post-Wave-2 hotfix)

Contract: docs/contracts/wave2_intake_core.md v1.0 (no contract surface touched —
queue names, job payloads, response shapes, status vocabularies all unchanged;
this hotfix only changes *which RQ worker class* executes the same jobs).

Root cause (reviewed, not re-litigated): RQ's default worker runs every job in an
`os.fork()` child; on macOS the fork child's `psycopg2.connect` triggers libpq's
GSS/Kerberos credential probe, which initialises CoreFoundation/Objective-C — an
abort in a fork child → SIGABRT. Evidence: dev-logs `79ca457`,
`handoff/OCR_CRASH_REPORT.md`, `handoff/KNOWN_ISSUES.md`. Not OCR, not inherited
parent connections, not fixable by multiprocessing start-method changes.

## What changed

- `workers/run_worker.py` — the worker bootstrap now selects the RQ worker class
  per platform via the pure function `select_worker_class(platform, override,
  rq_module)` (no env reads, no I/O; `main()` passes `sys.platform` and
  `CASEVAULT_WORKER_CLASS`):
  - `darwin` → `rq.SpawnWorker` (jobs run in a spawned interpreter via
    `os.spawnv` — never a fork). If the installed rq has no `SpawnWorker`
    (added in rq 2.2.0) → `rq.SimpleWorker` (in-process, also fork-free) **with
    a loud startup warning**. The forking `Worker` is *never* selected on
    darwin, not even silently as a fallback.
  - every other platform → `rq.Worker` (today's Linux behaviour, byte-for-byte
    the same constructor call `.work(with_scheduler=False)`).
  - `CASEVAULT_WORKER_CLASS=worker|spawn|simple` overrides the platform default
    (escape hatch for reproduction/debugging; `worker` on darwin prints a loud
    SIGABRT warning but is honoured). Unknown value → startup fails with
    `SystemExit(2)` before any redis contact. Explicit `spawn` on rq < 2.2.0 →
    hard error naming the version, no silent degrade.
  - the chosen class + platform + override state is logged at startup;
    dotenv/REDIS_URL/queuelist wiring unchanged; `redis`/`rq` still import
    lazily inside functions (subprocess-verified — `make ping-job` posture kept).
- `tests/workers/test_worker_process_model.py` — 20 tests: platform defaults
  (Linux stays `Worker`; darwin → `SpawnWorker`), every override value, unknown
  value rejected (pure function *and* `main()` exit code), darwin-without-
  SpawnWorker fallback + warning, spawn-override-without-SpawnWorker error,
  the invariant "darwin never defaults to the forking Worker" (fake rq with and
  without `SpawnWorker`, plus the real installed rq), and lazy-import hygiene.
  No network, no database, no redis server.
- `handoff/notes/W2-W.md` — this note.

Nothing else was modified; `git status --short` shows exactly
`M workers/run_worker.py` and the two new files.

## Proof

Sandbox: Debian 12 (no Darwin kernel available — see the honest limitation in
§Risks), Python 3.11.2, `psycopg2-binary==2.9.13 redis==7.4.1 rq==2.12.0`;
embedded Postgres 16 (`scripts/agent_pg.py`); real Redis 6.2.14 from the
`redislite` wheel extracted to `/tmp` (not a dependency) on `127.0.0.1:16379` —
port 6399/6379 deliberately unused. Base tip `3a9a00da33913bbdff4b429b82e37ffe2ac51422`.

### rq version matrix (dependency-decision basis — verified, not assumed)

`rq.SpawnWorker` exists only in rq ≥ 2.2.0:

```
$ for v in 1.16.2 2.0.0 2.1.0 2.2.0; do pip download rq==$v --no-deps -d ./$v; \
    unzip + grep -rl "SpawnWorker"; done
rq 1.16.2: __init__ exports SpawnWorker: False
rq 2.0.0:  __init__ exports SpawnWorker: False
rq 2.1.0:  __init__ exports SpawnWorker: False
rq 2.2.0:  x2.2.0/rq/__init__.py  x2.2.0/rq/worker.py  -> True
```

And rq 2.12.0's `SpawnWorker.fork_work_horse` is literally
`os.spawnv(os.P_NOWAIT, sys.executable, [...])` — a fresh interpreter per job,
no `os.fork()` anywhere (source inspected, printed during verification).

### (1) Unit tests — green

```
$ .venv/bin/python -m pytest tests/workers/test_worker_process_model.py -v
tests/workers/test_worker_process_model.py::test_linux_default_is_todays_forking_worker PASSED
tests/workers/test_worker_process_model.py::test_darwin_default_is_spawn_worker PASSED
tests/workers/test_worker_process_model.py::test_darwin_without_spawn_worker_falls_back_to_simple_with_loud_warning PASSED
tests/workers/test_worker_process_model.py::test_linux_without_spawn_worker_keeps_forking_worker PASSED
tests/workers/test_worker_process_model.py::test_override_spawn_selects_spawn PASSED
tests/workers/test_worker_process_model.py::test_override_simple_selects_simple PASSED
tests/workers/test_worker_process_model.py::test_override_worker_forces_forking_worker PASSED
tests/workers/test_worker_process_model.py::test_override_worker_on_darwin_is_explicit_but_warns PASSED
tests/workers/test_worker_process_model.py::test_override_spawn_without_spawn_worker_fails_loudly PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[threaded] PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[fork] PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[spawnworker] PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[WorkHorse] PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[] PASSED
tests/workers/test_worker_process_model.py::test_unknown_or_empty_override_rejected[None] PASSED
tests/workers/test_worker_process_model.py::test_override_is_case_and_whitespace_insensitive PASSED
tests/workers/test_worker_process_model.py::test_darwin_never_defaults_to_the_forking_worker PASSED
tests/workers/test_worker_process_model.py::test_real_rq_linux_default_matches_installed_worker_class PASSED
tests/workers/test_worker_process_model.py::test_main_unknown_override_exits_nonzero PASSED
tests/workers/test_worker_process_model.py::test_module_import_does_not_pull_in_redis_or_rq PASSED
============================== 20 passed in 0.15s ==============================
```

Unknown override, live (exits 2, before any redis contact):

```
$ CASEVAULT_WORKER_CLASS=bogus .venv/bin/python -m workers.run_worker; echo exit=$?
[casevault-worker] ERROR: unknown CASEVAULT_WORKER_CLASS='bogus'; expected one of worker, spawn, simple
exit=2
```

### (2) Full wave gate, fresh DB — green

```
$ bash scripts/verify_all.sh
==> Database              fresh casevault_test created
==> Migrations            upgrade 0001..0004 -> downgrade base -> upgrade head (all logged)
==> pytest (real Postgres) 116 passed, 3 warnings in 7.92s   (96 baseline + 20 new)
==> ruff                  All checks passed!
==> web: lint / typecheck / build   (next lint + tsc + next build, 19 routes)
GATE GREEN — python, migrations, lint and web all pass.
```

### (3) Linux spawn-path E2E — green (PYTHONPATH unset, real queued jobs)

Worker (`env -u PYTHONPATH CASEVAULT_WORKER_CLASS=spawn … .venv/bin/python -m workers.run_worker`,
scratch DB `casevault_e2e_w2w` migrated to 0004, redis on 16379):

```
[casevault-worker] connecting to redis://127.0.0.1:16379/0
[casevault-worker] listening on queues: ingest, ocr, extract, embed, analysis, connectors, exports
[casevault-worker] worker class: rq.SpawnWorker (platform=linux, CASEVAULT_WORKER_CLASS=spawn; explicit CASEVAULT_WORKER_CLASS='spawn')
17:23:32 Worker b78901e…: started with PID 2676, version 2.12.0
17:23:32 *** Listening on ingest, ocr, extract, embed, analysis, connectors, exports...
```

`scripts/intake_smoke.py --require-intake` (queued generation through the
spawn worker — the spawned interpreter imports `app` via the untouched
`_ensure_app_importable()`); then job payloads read back from redis
(FINISHED alone is not proof — the payloads are):

```
  PASS: queued job produced 3 proposals in 2.1s (statuses=[<JobStatus.FINISHED>])
  PASS: re-run job finished with no new proposals (idempotent, 1.5s, 2 jobs)
SMOKE GREEN — all intake steps passed; deviations: none
generation mode: queued (jobs=[ecae552c…, 4f61d9b1…]; waits=[2.1, 1.5, 2.0]; job results unreadable=none)

ecae552c FINISHED result={'job': 'generate_fact_proposals', 'status': 'complete', 'created': 3, 'skipped': 0, 'reason': None}
4f61d9b1 FINISHED result={'job': 'generate_fact_proposals', 'status': 'complete', 'created': 0, 'skipped': 3, 'reason': None}
ac988269 FINISHED result={'job': 'generate_fact_proposals', 'status': 'complete', 'created': 2, 'skipped': 1, 'reason': None}   # max_proposals=2 reached the spawned worker
```

`INTAKE_E2E_QUEUED=1` pytest wrapper:

```
$ INTAKE_REQUIRE=1 INTAKE_E2E_QUEUED=1 .venv/bin/python -m pytest tests/integration/test_intake_e2e.py -q
1 passed, 5 warnings in 7.15s
```

`POST /sources/{id}/reprocess` → 202 → spawn-worker job completes, **two
sequential jobs on the same worker**, real payloads and committed state:

```
PROVE upload: 201 id=b7f1aeda-7551-4d9e-8e71-2cf43fa18d7b
PROVE reprocess: 202 {'queued': True, 'job_id': '8f8bd2f9-cb85-43c6-9cc1-b16d90da340b', 'reason': None}
PROVE job 8f8bd2f9 status=JobStatus.FINISHED
PROVE job result: {'job': 'ocr_source', 'source_id': 'b7f1aeda-…', 'status': 'complete', 'ocr_status': 'complete', 'page_count': 1}
PROVE source row after job: ocr_status=complete processing_status=complete page_count=1
PROVE reprocess#2: 202 {'queued': True, 'job_id': 'f785a0bd-ed95-41c3-ad89-0e2dd4393359', 'reason': None}
PROVE job#2 f785a0bd status=JobStatus.FINISHED result={'job': 'ingest_source', 'source_id': 'b7f1aeda-…', 'status': 'complete', 'ocr_status': 'complete', 'page_count': 1}
PROVE final row: ocr_status=complete processing_status=complete page_count=1
PROVE committed page text: 'On March 12 2026 (3debbf92) the tenant photographed the replacement lock cylinder.'
REPROCESS-FLOW GREEN (two sequential jobs, real payloads)
```

Harness error encountered and corrected during (3): my first probe run pointed
the API at `LOCAL_STORAGE_ROOT=/tmp/w2w-storage` but started the worker without
it — the job honestly returned `status: failed` (file not found) *inside an
RQ-FINISHED job*, and the row showed `processing_status=failed`. That is a
client-env mismatch in my throwaway driver (worker and API must share
`LOCAL_STORAGE_ROOT`, exactly like they share `DATABASE_URL`), not a product
defect — after aligning the worker env the flow above is green. It is also a
nice live confirmation of why "RQ FINISHED alone is not proof" is the brief's
rule.

### (4) Same smoke, no override — green (Linux default unchanged)

```
$ env -u PYTHONPATH -u CASEVAULT_WORKER_CLASS … .venv/bin/python -m workers.run_worker
[casevault-worker] worker class: rq.Worker (platform=linux, CASEVAULT_WORKER_CLASS=unset; platform default for 'linux' (Linux/process model verified by W2-J))

  PASS: queued job produced 3 proposals in 2.0s
  PASS: re-run job finished with no new proposals (idempotent, 1.5s)
  PASS: queued cap job: created=2 skipped=1 in 2.0s
SMOKE GREEN — all intake steps passed; deviations: none
generation mode: queued (jobs=[316034a8…, f825def2…]; waits=[2.0, 1.5, 2.0]; job results unreadable=none)

316034a8 FINISHED result={… 'status': 'complete', 'created': 3, 'skipped': 0, …}
f825def2 FINISHED result={… 'status': 'complete', 'created': 0, 'skipped': 3, …}

PROVE default-worker reprocess: 202 {'queued': True, 'job_id': 'f9feb5a1-…', 'reason': None}
PROVE job result: {'job': 'ocr_source', …, 'status': 'complete', 'ocr_status': 'complete', 'page_count': 1}
PROVE row after: ocr_status=complete processing_status=complete
DEFAULT-WORKER REPROCESS GREEN
```

### (5) macOS local-proof block for the local tester — **BLOCKING for closure**

This sandbox has no Darwin kernel, so the actual SIGABRT-absence proof must run
on the reporter's Mac (Homebrew Python 3.14.7, macOS 26.6.2 ARM-64 — the machine
from dev-logs `79ca457`). A green Linux gate does **not** prove macOS.

```bash
# --- on the local tester's Mac, in the casevault checkout ---
git fetch origin && git checkout <merged-SHA-of-this-PR>
git rev-parse HEAD                       # paste it
python3 -V                               # paste it (expect 3.14.7 Homebrew)
source .venv/bin/activate 2>/dev/null || python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pip freeze | grep -iE '^(rq|redis|psycopg)'   # paste it; need rq>=2.2.0 for SpawnWorker

make infra-up                            # docker: postgres + redis (their normal ports)

# 1. default startup on darwin MUST log SpawnWorker:
python -m workers.run_worker             # = make worker
# expect stdout:
#   [casevault-worker] worker class: rq.SpawnWorker (platform=darwin, CASEVAULT_WORKER_CLASS=unset; macOS default: …)
# paste the full worker stdout/stderr from startup through the jobs below

# 2. negative control for env plumbing (paste output; expect exit=2):
CASEVAULT_WORKER_CLASS=bogus python -m workers.run_worker; echo exit=$?

# 3. in the UI (make api + make web): upload one real PDF evidence file,
#    then Evidence → the source → "Reprocess OCR" — the exact flow that
#    SIGABRT'd before. Watch the worker: it must stay alive and log
#    `ocr: workers.pipeline.jobs.ocr_source(…)` then `Job OK`.
# 4. repeat for a second source (two sequential jobs on the same worker).
# 5. paste the RQ job payloads (FINISHED alone is not proof):
python - <<'EOF'
import os, redis
from rq.registry import FinishedJobRegistry
from rq.job import Job
conn = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
for q in ("ocr", "ingest", "extract"):
    for jid in FinishedJobRegistry(q, connection=conn).get_job_ids()[-5:]:
        print(q, jid[:8], Job.fetch(jid, connection=conn).get_status(refresh=True),
              Job.fetch(jid, connection=conn).result)
EOF
# 6. paste the committed output: the source page in the UI shows the
#    reprocessed text (or the OCR-stub "skipped" reason for pdf), and
#    GET /api/v1/sources/{id} shows ocr_status/processing_status=complete
#    (pdf pages stay the documented stub until the OCR engine sprint — the
#    crash being fixed here killed the worker before that stub could run).
# 7. no-crash evidence: worker still running after both jobs; no
#    "Termination Reason: Namespace OBJC" / "crashed on child side of fork
#    pre-exec" in any new report under
#    ~/Library/Logs/DiagnosticReports/ (paste `ls -lt` of that dir filtered to
#    the window of the test, or state none were created).
```

Closure requires: both reprocess jobs return payloads with `status: complete`
(or `skipped` with the documented OCR-stub reason), committed rows show
`complete`, **and no SIGABRT/ObjC crash report is produced**.

Optional reproduction of the old crash (do this in a scratch shell, then
unset): `CASEVAULT_WORKER_CLASS=worker python -m workers.run_worker` — prints a
loud SIGABRT warning and, on the affected machine, should crash on the first
DB-touching job exactly like dev-logs `79ca457`. This is the escape hatch, kept
deliberately for bisection; it is never a default.

### (6) PGGSSENCMODE propagation, unset vs disable — proven through the spawn worker

Probe: enqueue the RQ-callable `os.environ.get('PGGSSENCMODE')` via a spawn
worker started (a) with the variable removed and (b) with `PGGSSENCMODE=disable`:

```
spawn worker (env -u PGGSSENCMODE …):   extract: os.environ.get('PGGSSENCMODE') (0f2e272f-…)
WORKER-ENV-PROBE (PGGSSENCMODE unset in worker): job sees PGGSSENCMODE=None
UNSET-PROBE OK

spawn worker (PGGSSENCMODE=disable …):  extract: os.environ.get('PGGSSENCMODE') (bee4c72b-…)
WORKER-ENV-PROBE (PGGSSENCMODE=disable in worker): job sees PGGSSENCMODE='disable'
DISABLE-PROBE OK — env propagates into the spawned job interpreter
```

Conclusion: worker env vars reach the spawned job interpreter deterministically
in both states, so the earlier macOS diagnostic (`PGGSSENCMODE=disable` scoped
to the invocation) really did reach the fork child — and still SIGABRT'd
(crash report table). That re-confirms the reviewed root cause: the illegality
is the fork itself, not the GSS probe content; the fix is the process model,
and no env-var workaround belongs in the product.

## Dependency decision (needs integrator action — file is outside my write set)

`workers/requirements.txt` currently pins `rq>=1.16,<3`, which *permits* an
install (1.16–2.1.x) where darwin cannot have `SpawnWorker`. The code handles
both floors correctly (loud `SimpleWorker` fallback, never the forking Worker),
so the pin is not a correctness bug — but the intended macOS fix is SpawnWorker,
not the degraded in-process path (no job isolation, worker blocks during jobs).
`apps/api/requirements.txt` does not reference rq/redis at all (verified by
grep) and needs no change.

**Requested change (integrator-owned files):** `workers/requirements.txt`:
`rq>=1.16,<3` → `rq>=2.2,<3`. Zero new dependencies, zero new upper bounds;
bottom limit raised within the existing range. Gate + all proofs above were run
with rq 2.12.0, matching the reporter's Mac. AGENT_POLICY §5 rule 5 (no
mandatory-dependency change without an approved note) is honoured by *not*
editing the file myself.

## Contract gaps

None. No schema, endpoint, queue-name, status-vocabulary, or job-payload change;
the RQ job callables keep their names/arguments, only the executing worker class
differs per platform. Wave 2 contract v1.0 untouched.

## Risks / follow-ups

- **macOS is not proven in this sandbox.** The Darwin selection logic is pinned
  by unit tests (fake + real rq) and the Linux spawn path is proven end-to-end,
  but the actual no-SIGABRT claim needs the local-tester block above — closure
  of the KNOWN_ISSUES entry stays blocked on it.
- If the Mac runs rq < 2.2.0, the worker starts with the loud `SimpleWorker`
  banner — fork-free and safe, but single-job-at-a-time. The requirements bump
  prevents that state.
- `SimpleWorker` runs jobs in the worker process: on macOS a poisoned job could
  now take the worker down with it (acceptable locally; revisit if macOS becomes
  a server target).
- `CASEVAULT_WORKER_CLASS=worker` on darwin is honoured (crash-reproduction
  escape hatch) with a loud warning; it is documented only in this note and the
  startup banner — do not put it in README/TESTING without the context.
- rq deprecation observed in passing (2.12.0): `job.result` → `job.return_value`
  in the verifier scripts. Cosmetic warning today; integrator may want a wave-3
  sweep. Also `fastapi.testclient` prints a StarletteDeprecationWarning
  (pre-existing, unrelated).
- Scratch resources used for proof: redis binary in `/tmp/redisbin` (deleted),
  scratch DB `casevault_e2e_w2w` (dropped), uploads under `/tmp/w2w-storage`
  (deleted). Nothing under `data/` was touched by the probes; no real case data
  involved anywhere (all fixtures synthetic, uid-suffixed).

## What the next agent must know

- **Do not weaken `_ensure_app_importable()`** in `workers/pipeline/jobs.py`:
  it is what lets a *spawned* interpreter locate `apps/api` without PYTHONPATH.
  The spawn path depends on it; the E2E above (PYTHONPATH unset) is the proof.
- Worker bootstrap env surface now includes `CASEVAULT_WORKER_CLASS`
  (worker|spawn|simple; unknown → exit 2). Selection rule of thumb: darwin never
  forks; Linux always forks (W2-J-verified) unless overridden.
- If you touch `workers/run_worker.py`, keep the module importable without
  redis/rq (`test_module_import_does_not_pull_in_redis_or_rq` guards it) and keep
  `select_worker_class` pure (inject `rq_module`; no env reads inside).
- Running the full worker stack in a Docker-less sandbox: `scripts/agent_pg.py`
  for Postgres; redis binary from the `redislite` wheel extracted to /tmp on
  port 16379 (W2-J recipe); worker and API must share `DATABASE_URL` **and**
  `LOCAL_STORAGE_ROOT`.
- The macOS crash entry in `handoff/KNOWN_ISSUES.md` should only be marked
  resolved by the integrator after the local-tester block in §(5) is pasted
  back green.

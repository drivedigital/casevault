# EU-V — independent evidence browser acceptance (tooling, guards, acceptance specs)

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 FROZEN, including the
**2026-09-11 authorized integration amendment**
Branch: `arena/01a08ce3-casevault` · base: **7ed39b1** `Integrator: review evidence
closure PRs and request lifecycle/tooling fixes`
Final SHA: reported on PR #19 and in the handoff reply — a note cannot contain
its own commit SHA; verify with
`git rev-parse origin/arena/01a08ce3-casevault`.

**Status: tooling corrections complete; final integrated acceptance IN
PROGRESS against the integrator's checkpoint.**

* Product under test: **a040e9f739ec3741cd28ee99756d256ea8b78d43** (EU-D
  `c8c7d27` + EU-L `14f4491`). EU-V checkpoint **0212370** contains that
  product tree plus the acceptance tooling/results note.
* Measured on that integrated tree: **tooling + guards 15/15 pass**;
  **list 14 passed / 6 failed**; initial **detail 10 passed / 11 failed** and
  **OCR 10 passed / 3 failed**. After selector/capability/timing reconciliation,
  bounded detail batches measured **5 passed / 1 failed** and **4 passed / 2
  failed**, while the corrected OCR batch measured **3/3 passed**. These bounded
  reruns are partial measurements, not whole-suite pass claims.
* Nothing is declared accepted until remaining failures are triaged and the
  corrected specs receive bounded reruns.

## What changed

All paths are inside the EU-V write set (`tests/browser/eu-acceptance-*`,
`scripts/eu_browser_*`, `handoff/notes/EU-V.md`). **No product code, shared hub,
manifest, lockfile, CI or Makefile change.** Base moved from `ab0ee23` to
`7ed39b1` by replaying the EU-V commit (files byte-identical to `a434ae1`).

### Review-blocker fixes (1–6)

| Blocker | Fix | Guarded by |
|---|---|---|
| 1. `.mjs` resolver threw `ReferenceError: require()`; Linux-only candidates; `playwright-download` did nothing | New committed `scripts/eu_browser_resolve_browser.mjs` (pure ESM, no bare `require`): explicit `EU_V_CHROMIUM_EXECUTABLE` → Playwright-managed browser discovered per-OS (`ms-playwright` under `~/Library/Caches` on macOS, `~/.cache` on Linux, `%LOCALAPPDATA%` on Windows), full Chromium preferred over `headless_shell` → npm-shipped build **Linux x64 only** (refused elsewhere with instructions). Launch verification moved to `scripts/eu_browser_verify_browser.cjs` (CJS, so `NODE_PATH` applies). `playwright-download` runs `playwright install chromium` and then **requires** a managed browser — it never falls back to the Linux binary (exit 1 with instructions) | G1–G3 + the mode matrix below |
| 2. Startup not transactional (created DB left behind after a failed migration; `stop` could not recover) | `scripts/eu_browser_stack.py` rewritten: every owned resource (database, storage, socket, each PID + its process group) is written to `state.json` (mode 0600) as soon as it exists; migration/readiness failure rolls back what it created and writes `status=failed` + recovery steps; cleanup kills recorded groups **and** child trees found via `/proc` (never by port, which could hit another run); `stop` validates ownership (DB-name prefix, storage inside the run's artifacts dir, marker-matched PIDs), exits non-zero and keeps recovery state when cleanup is incomplete | G4, G5, G9 |
| 3. `rm -rf tests/browser/node_modules` | Removed. Only an EU-V managed symlink (target = the tools directory) is replaced; a foreign symlink or a real directory is preserved with a warning. Resolution uses `NODE_PATH`, so no link is needed at all | G1, G2, G3 |
| 4. Full DSNs printed; unquoted/unrequested env | `redact()` hides userinfo and credential-bearing query parameters everywhere (startup, errors, status); the state file (which must hold real URLs to clean up) is 0600; env output is opt-in (`env` / `env --json`) and `shlex.quote`d | G6, G7 |
| 5. Servers not preview-reachable; wrong printed invocation | API and web bind `0.0.0.0` (`EU_V_API_HOST` / `EU_V_WEB_HOST` to restrict); the browser still talks to the API through the relative `/api/v1/*` rewrite; printed invocation corrected to `.venv/bin/python scripts/eu_browser_stack.py …` | G8 |
| 6. No failure-path regressions | New `tests/browser/eu-acceptance-tooling-guards.spec.ts` (G1–G9) | G1–G9 |

### New this round

* `scripts/eu_browser_resolve_browser.mjs`, `scripts/eu_browser_verify_browser.cjs`
* `tests/browser/eu-acceptance-tooling-guards.spec.ts` (G1–G9)
* `tests/browser/eu-acceptance-detail.spec.ts` (D1.x–D4.x, D6.x),
  `eu-acceptance-list.spec.ts` (L1.x–L5.x),
  `eu-acceptance-ocr.spec.ts` (D5.1–D5.13, incl. REAL_WORKER)
* Harness additions: `redisJob()` / `waitForJobResult()` (RQ result payload),
  `sourceState()` (committed DB state), `apiGet()`, `seedSource()`,
  `queryDatabaseUrl()`
* Checklist §4a (guards) and §7 (case → file map); README rewritten

## Proof

### Regression evidence (unchanged product tree)

```
$ .venv/bin/python -m ruff check apps workers scripts tests      All checks passed!
$ npm run typecheck --workspace=web                              clean
$ npm run lint --workspace=web     only the pre-existing <img> warning in
                                   app/evidence/[id]/page.tsx (EU-D's file, untouched)
$ .venv/bin/python -m pytest -q    118 passed, 1 skipped   (evidence integration test;
                                   no redis-server on PATH — same as the baseline)
```

### Browser resolution modes (all executed this round)

```
$ bash scripts/eu_browser_setup.sh                 # auto
    Browser: /tmp/chromium (source: npm:@sparticuz/chromium)
    Verified launch: 152.0.7977.0 | platform=linux | pdfViewerEnabled=false | plugins=0
    exit=0
$ bash scripts/eu_browser_setup.sh managed         # exit=1, instructions:
    npx playwright install chromium / EU_V_CHROMIUM_EXECUTABLE=…
$ bash scripts/eu_browser_setup.sh playwright-download
    installs into PLAYWRIGHT_BROWSERS_PATH=<scratch>/browsers; CDN blocked here
    → exit=1, "no managed browser … Checked …"; no Linux fallback
$ EU_V_CHROMIUM_EXECUTABLE=/tmp/chromium EU_V_CHROMIUM_LIB_DIR=/tmp/al2023/lib \
      bash scripts/eu_browser_setup.sh             # exit=0, source=override:…
$ EU_V_CHROMIUM_EXECUTABLE=/tmp/nope bash scripts/eu_browser_setup.sh   # exit=1
```

### Tooling self-check + guards against the real stack (real browser, real API)

```
$ .venv/bin/python scripts/eu_browser_stack.py start
    database  casevault_euv_… (throwaway)   redis  …/redis.sock (unix, no persistence)
    ready: redis → ready: api (/health) → ready: web (/evidence)
    web  http://127.0.0.1:3101 (bound to 0.0.0.0 for previews)

$ bash scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts eu-acceptance-tooling.spec.ts
  15 passed (46.4s)
    G1 pre-existing directory preserved · G2 foreign symlink preserved
    G3 managed symlink replaced · G4 unreachable admin DB (no DB, recovery kept,
       credentials redacted) · G5 failed migration rolled back (state 0600)
    G6 redact() hides userinfo/password · G7 env opt-in + sh-quoted round-trip
    G8 /evidence, /health and /api/v1/… answer on a non-loopback address
    G9 blocked DROP DATABASE → stop exits 1, status=failed-cleanup + recovery;
       after the blocker is gone the same state stops cleanly (exit 0)
    T1 list page loads against the real API · T2 browser upload persists a source
       (SQL read: sha256 matches) · T3 real download event, bytes verified
    T4 injected 500 reaches the page · T5 PDF capability reported · T6 artifacts
```

### Product acceptance specs against the integrated checkpoint a040e9f

Environment: `.venv/bin/python scripts/eu_browser_stack.py start` → throwaway
database `casevault_euv_…`, Unix-socket Redis, real `uvicorn`, real RQ worker,
real `next dev` bound to `0.0.0.0`. Raw output was written outside Git under
`/home/user/eu-v-runs/`; those scratch logs did not survive the session reset.
The exact measured counts below were checkpointed before that reset. JUnit and
traces use the git-ignored `data/diagnostics/eu-browser/` path.

```
$ bash scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts eu-acceptance-tooling.spec.ts
  15 passed (42.9s)                      # G1-G9 + T1-T6 on the integrated tree

$ bash scripts/eu_browser_run.sh eu-acceptance-list.spec.ts
  14 passed / 6 failed (7.0m)

$ bash scripts/eu_browser_run.sh eu-acceptance-detail.spec.ts
  10 passed / 11 failed (11.4m)             # initial full integrated run

$ bash scripts/eu_browser_run.sh eu-acceptance-detail.spec.ts -g '<bounded reconciled cases>'
  5 passed / 1 failed                       # D2.x/D2.5/D3.1-D3.6 batch
  4 passed / 2 failed                       # D1.4/D1.8/D4.1/D4.4/D4.6 batch
                                             # remaining failures: D1.8, D4.6

$ bash scripts/eu_browser_run.sh eu-acceptance-ocr.spec.ts
  10 passed / 3 failed (4.3m)               # initial full integrated run

$ bash scripts/eu_browser_run.sh eu-acceptance-ocr.spec.ts -g 'D5.3|D5.4|D5.6'
  3 passed (3.3m)                           # corrected bounded rerun
```

Detail D1.8/D4.6 remain candidate findings: with an injected 1.2s PATCH delay,
two direct Save activations produced **2 PATCH requests** 2654ms apart. That gap
does not establish that the requests overlapped; dispatch and completion timing
must be captured before classification. During the first request the control was
not disabled and had no `aria-busy` state. EU-V did not edit the page.

The initial OCR failures D5.3/D5.4-D5.5/D5.6 were reconciled to the shipped
burst/tick and timeout states without weakening the contract; their corrected
bounded rerun passed 3/3. Real-worker RQ records reached `finished` with literal
`result=None`; this is recorded verbatim and is not claimed as a payload-present
pass.

### Bounded L1.5 correction — 2026-09-12

Revisions preserved: product **a040e9f739ec3741cd28ee99756d256ea8b78d43**;
verifier base **2c360a19dce9a03bc1c16dbeeae630715658cd42**; review intake
**0788cccc91e777afa83bbd40b59e16cd57d8be98**. Integration review was read,
not merged or replayed. Setup used only disposable/ignored paths (`.venv`, root
`node_modules`, `data/temp`, `data/diagnostics`, `/home/user/eu-v-runs`) and made
no product, manifest, lockfile, CI, or local-ops patch.

```text
$ timeout 900 bash -c 'set -euo pipefail; python3 -m venv .venv;
  .venv/bin/pip install --quiet --upgrade pip;
  .venv/bin/pip install --quiet -r requirements-dev.txt pgserver redislite;
  npm ci --ignore-scripts --no-audit --no-fund;
  .venv/bin/python scripts/agent_pg.py start; bash scripts/eu_browser_setup.sh;
  .venv/bin/python scripts/eu_browser_stack.py start'
  exit 0; Chromium 152.0.7977.0; disposable DB/Redis/API/worker/web ready

$ bash scripts/eu_browser_run.sh --grep '^T1 ' ... eu-acceptance-tooling.spec.ts
$ bash scripts/eu_browser_run.sh --grep 'T1 list page' ... eu-acceptance-tooling.spec.ts
  first two selector attempts: exit 1, no tests found (no test executed)
  corrected title selector: exit 0, T1 1 passed (1.9s)

$ bash scripts/eu_browser_run.sh --grep 'L1.5 retained' --retries=0 --workers=1 \
    --reporter=line eu-acceptance-list.spec.ts
  focus-trigger draft: exit 1, L1.5 0/1; no GET /sources observed in 20s
  corrected mutation-triggered background refetch: exit 0, L1.5 1 passed (4.1s)
```

The accepted L1.5 spec first proves the exact synthetic source row is loaded,
injects failure only for `GET /api/v1/sources`, then performs a successful Include
mutation. The product's query invalidation triggers an observed background GET
without navigation/reload. The test requires that same ID-linked row to remain
visible, a list error with out-of-date feedback, and the row-local
`Saved result — may be out of date` chip. Assertions were not weakened. Raw logs
remain outside Git under `/home/user/eu-v-runs/`.

### Bounded L2.5 and L3.2–L3.4 batch — 2026-09-12

Current coordination was read from integration `handoff/STATUS.md` at
**2b7381e59ac187eda038c8bb1b458798f5a3f534**. Revisions were held at product
**a040e9f739ec3741cd28ee99756d256ea8b78d43** and verifier base
**3c405cf76ada6651cd0f4204bb5316aa32a77d76**. After another metadata/workspace
reset, a temporary checkpoint index proved the working files byte-identical to
`3c405cf`; the branch ref/index were reconstructed without checkout/reset. The
isolated dependencies and stack were then rebuilt under a 900-second cap because
no healthy process or prior raw output remained:

```text
$ timeout 900 bash -c 'set -euo pipefail; python3 -m venv .venv;
  .venv/bin/pip install --quiet --upgrade pip;
  .venv/bin/pip install --quiet -r requirements-dev.txt pgserver redislite;
  npm ci --ignore-scripts --no-audit --no-fund;
  .venv/bin/python scripts/agent_pg.py start; bash scripts/eu_browser_setup.sh;
  .venv/bin/python scripts/eu_browser_stack.py start'
  exit 0
```

Exact execution command (single 25-second batch, one worker, no retries, one
maximum failure; each case also has `test.setTimeout(60_000)`):

```text
$ timeout 300 bash scripts/eu_browser_run.sh \
    --grep 'L2.5|L3.2/L3.3/L3.4' --retries=0 --workers=1 \
    --max-failures=1 --reporter=line eu-acceptance-list.spec.ts
  exit 1; 1 passed / 1 failed (24.5s)
```

Raw synthetic log: `/home/user/eu-v-runs/v-list-20260912T232437Z/cases.log`.
Setup and cleanup logs are alongside it; none are committed.

* **L2.5 — PASS (fixture/spec defect corrected).** A uniquely named synthetic
  TXT was correlated to the actual POST response ID. The exact ID-linked row
  matched both title search and source-type filter. One injected PATCH failed and
  produced row feedback; after removing the fault, explicit Retry sent exactly
  one further PATCH, reached `Included`, and preserved both control values.
* **L3.2/L3.3/L3.4 — FAIL (product candidate).** Exact-row error and accessible
  Retry were present. Redacted excerpt: `Couldn’t load linked matters … Traceback
  … File … SELECT * … Retry`; raw traceback/SQL was exposed, violating L3.3.
  A soft security assertion allowed cleanup/recovery proof to continue: after
  fault removal Retry recovered that exact ID's badge to the confirmed-empty `No
  linked matters for …` state and removed its error node. The assertion remained
  failed; no product edit or weakening was made.

`seedSource()` now creates a unique synthetic filename and obtains the source ID
from the upload response before locating the row. All detail, list, OCR and
browser-tooling cases that call this shared helper are impacted; only L2.5 and
the L3.2–L3.4 group were rerun under this authorization.

Cleanup: disposable stack stop **exit 0**, PostgreSQL stop **exit 0**; database
and storage removed. No EU-V-owned test/API/worker/database process remains.

List failures on the initial integrated-tree run — L1.5 and L2.5 now pass their
bounded reruns; L3.2–L3.4 is a scoped product candidate; others remain pending:

| Case | Mode | Observed |
|---|---|---|
| L1.2 empty state (fresh workspace) | REAL_API | Empty-state copy/params under review |
| L1.5 retained stale rows labelled | INJECTED_FAULT | Initial reload-based spec invalid; corrected real background-refetch case passed 1/1 |
| L2.5 retry preserves query/filters | INJECTED_FAULT | Corrected exact-ID failure/retry case passed 1/1; both controls preserved |
| L3.2/L3.3/L3.4 row badge failure | INJECTED_FAULT | Accessible scoped failure and recovery worked, but raw traceback/SQL leaked: product candidate |
| L4.7 duplicate warnings retained | REAL_API | Duplicate banner locator not matched |
| L4.8 original navigation preserved | REAL_API | `toHaveURL(/\/evidence\/<id>/)` did not match |

Each of these is either a genuine EU-L product finding or a spec-side
selector/copy mismatch against the integrated UI; I reconcile the label/role
first (never weakening the assertion) and report whatever remains as a finding
through the integrator.

Earlier, **pre-merge baseline** measurements (product 7ed39b1, no D+L) are kept
only as history: list 10 passed / 10 failed, detail 1 passed / 20 failed, OCR
11 passed / 2 failed. They are **not** acceptance evidence.

### Bounded real-worker OCR proof — 2026-09-12

Revisions: product **a040e9f739ec3741cd28ee99756d256ea8b78d43**;
verifier base **e7fe31ec14ba0c99625057646769440dbb0ac1cd**. Only TXT and
PDF D5.10/D5.11 explicit reprocessing ran. The RQ reader now uses
`Job.return_value()` with `latest_result()` fallback in a bounded Python child;
Node awaits `execFile` asynchronously instead of synchronously busy-spinning.
All call sites now await it; D5.12 was updated for type/async correctness but was
not run.

```text
$ timeout 300 bash scripts/eu_browser_run.sh \
    --grep 'real worker run for (text|pdf)' --retries=0 --workers=1 \
    --max-failures=1 --reporter=line eu-acceptance-ocr.spec.ts
  exit 1; TXT passed, PDF failed attempt 1 because the spec expected page_count=0
  but the shipped stub returns page_count=null; 1 passed / 1 failed (11.3s)

$ timeout 240 bash scripts/eu_browser_run.sh \
    --grep 'real worker run for pdf' --retries=0 --workers=1 \
    --max-failures=1 --reporter=line eu-acceptance-ocr.spec.ts
  exit 0; PDF passed (7.6s)
```

Classification: the first PDF failure was a **spec expectation defect**, corrected
to the shipped stub contract without claiming extraction. Final bounded proof:
TXT **1/1 pass** (two sequential explicit clicks/jobs); corrected PDF **1/1
pass** (two sequential explicit clicks/jobs). Each test required the clicked
Reprocess response job ID, decoded `job=ocr_source`, exact `source_id`,
`status=complete`, expected OCR outcome, committed SQL state/pages and visible UI
terminal label. TXT additionally required one committed page containing
`CASEVAULT SYNTHETIC FIXTURE`; PDF required `ocr_status=skipped`, null page_count
and zero pages—successful orchestration, explicitly **not extraction**.

Redacted exact correlations retained outside Git:

* TXT source `5a659e85-…`: jobs `1f12694c-…`, `32a43735-…`; both RQ FINISHED,
  payload complete/`ocr_status=complete`/page_count 1; SQL complete/1 page; UI
  `OCR complete`.
* Corrected PDF source `8d7393c0-…`: jobs `30426e4c-…`, `e57a1aed-…`; both RQ
  FINISHED, payload complete/`ocr_status=skipped`/page_count null; SQL skipped/0
  pages; UI `OCR skipped`.
* The failed first PDF attempt used source `a13c4b71-…`, job `81c9a2e7-…`; its
  payload and SQL also showed skipped/null/0 before the incorrect assertion.

Raw logs and correlation output:
`/home/user/eu-v-runs/ocr-20260912T233939Z/` (outside Git). Cleanup: stack and
PostgreSQL stop both exit 0; disposable database/storage removed; no owned
service remains. Image, D5.12, other OCR cases, full OCR/list/detail suites and
shared-helper regression were **not run**.

### Correction-only OCR checkpoint — 2026-09-12

No browser or worker case was rerun in this checkpoint. The prior measured TXT
and PDF results remain attributed to verifier **5e925be** and product
**a040e9f739ec3741cd28ee99756d256ea8b78d43**. Corrections after integrator
review:

1. Restored `image` to the D5.10/D5.11 parameterized acceptance definition;
   future bounded TXT/PDF selection must use CLI `--grep`. Image remains **NOT
   RUN**.
2. The RQ child receives its Redis URL only through `EU_V_RQ_REDIS_URL` in its
   environment, never argv. Child failures are rethrown using only job ID,
   error name/code and killed state; command, URL, stdout and stderr are omitted.
3. `sourceState().page_count` is typed `number | null` in both public and SQL-row
   shapes.
4. Retired stale wording that called the corrected result reader unresolved;
   `result=None` remains only as historical evidence at `0212370`.
5. D5.10/D5.11 now waits for the exact upload ID to reach its expected terminal
   OCR state before opening Status and clicking Reprocess, preventing initial
   ingest/explicit OCR overlap.
6. Every result-reader child has an `AbortController`; the real-worker describe
   cancels outstanding owned children in `afterEach`, while each child also has
   a bounded process timeout shorter than the case cap.
7. Other OCR cases, image, full suites and shared-helper regression remain
   explicitly **NOT RUN**.

Static validation only (no browser/worker execution):

```text
$ git diff --check
  exit 0
$ node "$EU_V_PLAYWRIGHT_CLI" test --list \
    --config tests/browser/eu-acceptance-playwright.config.ts \
    --grep 'real worker run for (text|pdf|image)' eu-acceptance-ocr.spec.ts
  exit 0; 3 tests listed: text, pdf, image
```

### Real-worker proof shape (contract §Proof and safety)

`REAL_WORKER` cases require **all three**: the RQ job record reaches `finished`
with its structured payload read through the supported RQ result API, the
**committed** `sources.ocr_status` and `source_pages` rows read independently
through SQL, and the UI's terminal state. The raw-reader `result=None` observation
belongs only to the earlier `0212370` measurement; the supported reader was
corrected and decoded structured payloads at `5e925be`.
Two sequential Reprocess requests per fixture type. Upload-time processing is
proved separately from explicit reprocess (D5.12).

### Cleanup

```
$ .venv/bin/python scripts/eu_browser_stack.py stop
==> stopping redis/api/worker/web · dropped database casevault_euv_…
==> removed scratch storage (logs kept as git-ignored diagnostics)
```

## Contract gaps / requests

1. **Tooling approval** was granted in principle ("no manifest/CI changes") and
   is honoured: the runner still installs only into `data/temp/eu-browser-tools`
   and resolves via `NODE_PATH`. No CI file, manifest or lockfile is touched; the
   existing five CI jobs are untouched. An additive `evidence-ui` job remains a
   separate, later approval.
2. **Native PDF rendering is not established here:** sandbox Chromium reports
   `pdfViewerEnabled=false`. The owner has issued a **limited synthetic preview
   release**, not full acceptance; current integration instructions govern that
   separately.
3. **Keyboard upload remains not run correctly.** Exercising the hidden
   `input[type=file]` does not establish whether the visible upload button works
   by keyboard. A future authorized case must focus and activate that visible
   control and assert the exact focus/chooser path.

## Risks / follow-ups

* Product checkpoint `a040e9f739ec3741cd28ee99756d256ea8b78d43` is already
  supplied. Remaining cases require separate bounded authorization; no merged
  SHA request or aggregate acceptance claim remains.
* The acceptance run is serial and long: `eu-acceptance-detail.spec.ts` took
  ~19 min on the failing baseline (many 20 s expectation timeouts); the OCR
  timeout case alone costs ~135 s. Fine post-merge, slow while red.
* Re-running the suite against the same stack re-uploads fixtures; duplicates are
  expected (the product flags, never deletes), so assertions check presence and
  integrity rather than uniqueness.
* The Next dev server occasionally logs `ChunkLoadError` / RSC 404 when it
  recompiles between navigations; restarting the stack clears it. Product specs
  separate that dev-server noise from real console errors and annotate it.
* `playwright-download` cannot succeed in this sandbox (all browser CDNs except
  npm are unreachable). Owner preview activity is limited to the separately
  authorized synthetic preview; this is not full EU-V acceptance.

## What the next agent must know

* **Integrator:** product checkpoint `a040e9f739ec3741cd28ee99756d256ea8b78d43`
  is supplied and preserved. Issue the next bounded scope before any remaining
  list, detail, or OCR execution; this batch is not final acceptance.
* **EU-D / EU-L:** the specs live only in `tests/browser/eu-acceptance-*`.
  Failures will be reported to you through the integrator with case ID, steps,
  observed vs expected and a trace excerpt; I will not edit your pages or your
  tests (`tests/browser/eu-d-*`, `eu-list-*`).
* **Owner preview:** only the limited synthetic preview in current integration
  instructions is released. It does not establish full acceptance, real-data
  safety, extraction, or the incorrectly targeted keyboard case.
* **Anyone running the guards:** `EU_V_ALLOW_NO_STACK=1 bash
  scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts` (they start
  their own throwaway stack on ephemeral ports). They need a reachable admin
  database (`EU_V_ADMIN_DATABASE_URL`, or start `scripts/agent_pg.py start` /
  `make infra-up`) and fail loudly, never skip, when it is missing.

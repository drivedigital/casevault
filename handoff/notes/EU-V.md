# EU-V — independent evidence browser acceptance (tooling, guards, acceptance specs)

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 FROZEN, including the
**2026-09-11 authorized integration amendment**
Branch: `arena/01a08ce3-casevault` · base: **7ed39b1** `Integrator: review evidence
closure PRs and request lifecycle/tooling fixes`
Final SHA: reported on PR #19 and in the handoff reply — a note cannot contain
its own commit SHA; verify with
`git rev-parse origin/arena/01a08ce3-casevault`.

**Status: tooling preparation + acceptance specs complete; NOT final UI
acceptance.** The six review blockers are fixed and guarded by regressions.
The product acceptance specs (`detail` / `list` / `ocr`) are written and run —
they are **red against the current tree by design**, because EU-D and EU-L are
not integrated. Final acceptance waits for the integrator's corrected D+L merged
SHA.

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

### Product acceptance specs against the *current* tree (pre-D+L, expected red)

```
$ bash scripts/eu_browser_run.sh eu-acceptance-list.spec.ts      →  N passed / M failed
$ bash scripts/eu_browser_run.sh eu-acceptance-detail.spec.ts    →  1 passed / 20 failed
$ bash scripts/eu_browser_run.sh eu-acceptance-ocr.spec.ts       →  11 passed / 2 failed
```

* **OCR (11/13 green)**: D5.1 (202 = accepted, never "complete"), D5.2, D5.4,
  D5.5, D5.6 (120 s timeout stops polling, unconfirmed + manual refresh), D5.8,
  D5.9, D5.13 and **all three REAL_WORKER cases** pass on the baseline. Two fail,
  both genuine pre-EU-D gaps: **D5.3** (no ~2 s polling exists) and **D5.7**
  (nothing to cancel on navigation).
* **Detail (1/20)**: the baseline has no per-type download control, no opt-in
  PDF preview, no distinct source/pages/matters error states and no pending
  protection — exactly the EU-D scope.
* **List**: per-row failure surfacing, pending protection, stale labelling,
  keyboard-operable upload and badge-failure feedback are missing — the EU-L
  scope. Two failures found in the first full run were **spec-side** and were
  fixed (a race in L5.1's refetch count; Next dev-server `ChunkLoadError`/RSC
  noise in L4.8, now separated from product console errors and annotated).
* Two spec-side issues found and fixed in OCR: the 202 assertion raced React's
  render (now auto-retrying), and `pages > 0` was required for PDF/image where
  the contract's known engine stubs legitimately end in `skipped` without page
  rows.

### Real-worker proof shape (contract §Proof and safety)

`REAL_WORKER` cases assert **all three**: the RQ job record reaches `finished`
with the payload recorded verbatim (`eu-v-job-payload` annotation: the OCR job's
`result` field is the literal `None` — the worker returns nothing, so the payload
is recorded, not assumed), the **committed** `sources.ocr_status` and
`source_pages` rows read independently through SQL, and the UI's terminal state.
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
2. **Native PDF rendering** stays with EU-M: the sandbox Chromium reports
   `pdfViewerEnabled=false`. D3.1–D3.7 still run here (no auto-download, opt-in
   gating, object-URL lifecycle, labels, fallback, unchanged attachment
   headers). On a Mac, `bash scripts/eu_browser_setup.sh playwright-download`
   installs a full managed Chromium **with** the PDF viewer.
3. **EU-L §3 baseline finding (unchanged, now machine-checked)**: on the current
   tree `L4.1 upload works by keyboard only` fails — the hidden
   `input[type=file]` opens no chooser from keyboard focus. The integrator's own
   review reached the same conclusion for a different pending-upload path; this
   is the keyboard finding, reported not worked around.

## Risks / follow-ups

* Selectors/copy in the product specs are behaviour-first (roles and labels) and
  were written before seeing the EU-D/EU-L UI. After the D+L merge I will
  reconcile labels and, if a required control genuinely does not exist, report it
  as a finding against the owning clause — never weaken the assertion.
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
  npm are unreachable); the Mac path is therefore unverified here and must be
  confirmed by EU-M.

## What the next agent must know

* **Integrator:** please supply the corrected D+L merged SHA. On that tip I will
  run `bash scripts/eu_browser_setup.sh` →
  `.venv/bin/python scripts/eu_browser_stack.py start` →
  `bash scripts/eu_browser_run.sh`, and report every checklist case as
  pass/fail/blocked with its proof mode, then
  `.venv/bin/python scripts/eu_browser_stack.py stop` (fixture cleanup).
* **EU-D / EU-L:** the specs live only in `tests/browser/eu-acceptance-*`.
  Failures will be reported to you through the integrator with case ID, steps,
  observed vs expected and a trace excerpt; I will not edit your pages or your
  tests (`tests/browser/eu-d-*`, `eu-list-*`).
* **EU-M (local Mac):** `bash scripts/eu_browser_setup.sh playwright-download`
  installs a managed Chromium; then the same stack/run commands work with
  `make infra-up` Postgres and a system `redis-server`. Please cover native PDF
  preview rendering, the keyboard upload chooser (L4.1) and Safari downloads.
* **Anyone running the guards:** `EU_V_ALLOW_NO_STACK=1 bash
  scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts` (they start
  their own throwaway stack on ephemeral ports). They need a reachable admin
  database (`EU_V_ADMIN_DATABASE_URL`, or start `scripts/agent_pg.py start` /
  `make infra-up`) and fail loudly, never skip, when it is missing.

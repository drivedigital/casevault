# EU-V browser acceptance — reproducible setup and run

Owner: **EU-V** (independent browser verifier).
Write set: `tests/browser/eu-acceptance-*`, `scripts/eu_browser_*`.
Nothing in this folder changes product code, dependency manifests, lockfiles or
CI. Setup installs into a **git-ignored** scratch prefix and is version-pinned.

## 1. Install the runner (once per machine/sandbox)

```bash
bash scripts/eu_browser_setup.sh                      # auto: managed first
bash scripts/eu_browser_setup.sh playwright-download  # install + use a managed browser
bash scripts/eu_browser_setup.sh managed              # managed browser only
bash scripts/eu_browser_setup.sh npm-linux            # npm-shipped build (Linux x64 only)
EU_V_CHROMIUM_EXECUTABLE=/path/to/Chrome bash scripts/eu_browser_setup.sh
source data/temp/eu-browser-tools/env.sh              # exports EU_V_* variables
```

Pinned: `@playwright/test` **1.63.0**; Linux fallback `@sparticuz/chromium`
**152.0.0** (Chromium 152.0.7977.0). The script

1. installs into `data/temp/eu-browser-tools` (ignored via `data/*`) and
   exports `EU_V_NODE_PATH`, so specs resolve `@playwright/test` without a new
   manifest and without any tracked file inside `tests/browser`,
2. never deletes a path another owner may have created: an EU-V managed symlink
   (pointing at the tools directory) is replaced, a foreign symlink or a real
   directory is **preserved** with a warning,
3. resolves a Chromium executable platform-aware — explicit
   `EU_V_CHROMIUM_EXECUTABLE`, then a Playwright-managed browser found in the
   per-OS `ms-playwright` directory (full Chromium preferred over
   `headless_shell`, because only the full build ships the PDF viewer), then the
   npm-shipped build **on Linux x64 only** (refused on macOS/Windows with an
   actionable message),
4. verifies the browser actually launches and prints `version`, `platform`,
   `pdfViewerEnabled`, `plugins` — setup fails rather than claiming success.

`playwright-download` runs `playwright install chromium` (into
`PLAYWRIGHT_BROWSERS_PATH`, defaulting to the scratch prefix) and then uses that
managed browser; on failure it exits non-zero and **never** falls back to the
Linux binary.

## 2. Start the isolated stack

```bash
bash scripts/setup_local.sh                        # venv + deps (idempotent)
.venv/bin/pip install pgserver redislite           # sandboxes without Docker/Redis
.venv/bin/python scripts/agent_pg.py start         # or: make infra-up (docker compose)
.venv/bin/python scripts/eu_browser_stack.py start
```

`eu_browser_stack.py start` creates and migrates a **throwaway** database
(`casevault_euv_<random>`), starts a private Redis on a Unix socket (no TCP
port, no persistence), then runs real `uvicorn`, a real
`python -m workers.run_worker` and a real `next dev`, waiting for each to be
ready. Every owned resource is recorded incrementally in
`data/temp/eu-browser-stack/state.json` (mode 0600); if migrations or any
readiness probe fail, everything already created is rolled back and an
actionable recovery state is kept.

Browser-facing servers bind `0.0.0.0` so Arena previews can reach them; the web
app still calls the API through the relative `/api/v1/*` rewrite, so no browser
code hard-codes an API host. Restrict with `EU_V_API_HOST` / `EU_V_WEB_HOST`.

```bash
.venv/bin/python scripts/eu_browser_stack.py status          # redacted summary
eval "$(.venv/bin/python scripts/eu_browser_stack.py env)"   # opt-in, shlex-quoted
```

## 3. Run the suite

```bash
bash scripts/eu_browser_run.sh                       # everything
bash scripts/eu_browser_run.sh --grep "EU-D/D5"      # one checklist group
bash scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts
EU_V_ALLOW_NO_STACK=1 bash scripts/eu_browser_run.sh # guard runs that start their own stack
EU_V_HEADED=1 bash scripts/eu_browser_run.sh         # watch it locally
```

Artifacts (JUnit XML, traces, screenshots) → `data/diagnostics/eu-browser/`
(git-ignored). Every test carries an `eu-v-proof-mode` annotation
(`REAL_API` / `REAL_WORKER` / `INJECTED_FAULT` / `TRANSPORT` / `TOOLING`).

## 4. Stop and clean up

```bash
.venv/bin/python scripts/eu_browser_stack.py stop     # terminates the tree, drops the
                                                      # throwaway DB, removes scratch
                                                      # storage; logs kept as diagnostics
```

`stop` validates that each target really belongs to this run (database-name
prefix, storage inside the artifacts directory, recorded process groups and
child trees). If something cannot be removed it exits non-zero and keeps
`state.json` with `status=failed-cleanup` and recovery steps — never a silent
success.

## 5. Files

| Path | Purpose |
|---|---|
| `eu-acceptance-CHECKLIST.md` | The acceptance plan: every contract clause → case ID, mode, steps, pass criterion, traceability, guard cases |
| `eu-acceptance-playwright.config.ts` | Single Chromium project, one worker, artifact paths, browser env |
| `eu-acceptance-harness.ts` | Fixtures, request/error recording, object-URL instrumentation, keyboard upload, download byte-equality, fault injection, independent SQL/Redis reads |
| `eu-acceptance-tooling.spec.ts` | T1–T6: proves the harness + real stack before product cases are judged |
| `eu-acceptance-tooling-guards.spec.ts` | G1–G9: tooling guard regressions (path preservation, startup rollback, redaction, quoted env, `0.0.0.0` binding, incomplete-cleanup reporting) |
| `eu-acceptance-detail.spec.ts` | EU-D acceptance: D1.x, D2.x, D3.x, D4.x, D6.x |
| `eu-acceptance-list.spec.ts` | EU-L acceptance: L1.x–L5.x |
| `eu-acceptance-ocr.spec.ts` | EU-D OCR: D5.1–D5.13, including REAL_WORKER completion |
| `scripts/eu_browser_setup.sh` | Pinned install + platform-aware browser resolution + launch verification |
| `scripts/eu_browser_resolve_browser.mjs` | The resolver (ESM, no bare `require`) |
| `scripts/eu_browser_verify_browser.cjs` | Launch verification (CJS, so `NODE_PATH` applies) |
| `scripts/eu_browser_stack.py` | Isolated stack lifecycle (start/stop/status/env) |
| `scripts/eu_browser_run.sh` | Runs Playwright with the resolved env |
| `scripts/eu_browser_fixtures.py` | Synthetic TXT/PDF/PNG fixtures (reuses the wave-standard generator) |

**Product specs are expected RED against the current tree**: EU-D and EU-L have
not been integrated yet. Final acceptance runs only against the corrected D+L
merged SHA supplied by the integrator.

## 6. Verified environment (this sandbox, 2026-09-12)

* Node 22.22.3 · `@playwright/test` 1.63.0 · Chromium
  `HeadlessChrome/152.0.7977.0` from `npm:@sparticuz/chromium@152.0.0`
* PostgreSQL 16 via `pgserver` 0.1.4 · Redis 6.2.14 (`redislite` wheel binary) ·
  RQ 2.12.0 worker · Next.js 14.2.15 dev server bound to `0.0.0.0`
* `navigator.pdfViewerEnabled === false` in this build → native PDF rendering is
  **not** verifiable here; those checks are handed to EU-M (checklist §5).
  On a Mac, `bash scripts/eu_browser_setup.sh playwright-download` installs a
  full managed Chromium **with** the PDF viewer.

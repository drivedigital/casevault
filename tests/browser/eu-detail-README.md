# EU-D detail-page tests — fixtures, HTTP probe, browser spec

Owner: **EU-D** (detail-page implementer) · Contract:
`docs/contracts/evidence_ui_closure.md` **v1.0** · Write set:
`tests/browser/eu-detail-*`.

These artifacts live in `tests/browser/` but **pytest does not collect them**
(plain `.mjs`, no Python) and **the web build does not depend on them**. The
closure contract reserves browser-test *tooling installation* for EU-V, so
nothing here adds a repository dependency; the Playwright install below is
**isolated and uncommitted**, with a pinned, reproducible version.

## Files

| File | What it is | Evidence class |
|---|---|---|
| `eu-detail-fixtures.mjs` | Synthetic TXT/PDF/PNG fixtures (byte-identical ports of `scripts/pipeline_smoke.py::synthetic_fixtures` — verified by sha256 against the Python originals). Requires Node ≥ 20.15 (`zlib.crc32`). | — |
| `eu-detail-http-probe.mjs` | HTTP-only probe against a real running API: file endpoint `Content-Disposition: attachment` + original filename, **byte-equality (sha256) of downloads for every type**, reprocess 202 `{queued, job_id, reason}` shape and honest `queued:false` reason when no Redis is reachable. | HTTP-only (no browser) |
| `eu-detail.spec.mjs` | Playwright browser spec for the detail page: downloads without page-load download, opt-in PDF blob preview, drafts lifecycle, distinct error surfaces, link/unlink flows, OCR `queued:false` (no polling), `queued:true` → complete/skipped terminal refresh, visible poll network errors, 120s poll budget timeout. | Browser interactions; real API, or injected 503/transport/sequence — **labeled per test in its title** |

## Isolated tooling install (uncommitted; EU-V owns the final decision)

Exactly what EU-D ran on 2026-09-10 (Node 22.22.3; see
`handoff/notes/EU-D.md` for observed results). Nothing below touches the
repository's `package.json`/lockfile; the only repo-side artifact is a
symlink inside the git-ignored `node_modules/` so the spec's
`import "@playwright/test"` resolves.

```bash
# 1. Isolated tooling dir (outside the repo)
mkdir -p /tmp/eu-d-browser-tools && cd /tmp/eu-d-browser-tools
npm init -y
npm install --no-save @playwright/test@1.63.0 playwright-core@1.63.0

# 2. Browser binary. NOTE: the Playwright CDN (cdn.playwright.dev /
#    playwright.azureedge.net) is BLOCKED from this sandbox, so
#    `npx playwright install chromium` cannot download anything.
#    Workaround used: @sparticuz/chromium@152.0.0 ships Chromium
#    152.0.7977.0 inside its npm tarball, plus an AL2023 lib bundle that
#    contains the libnss3/libnspr4/libnssutil3 the binary needs on Debian.
npm install --no-save @sparticuz/chromium@152.0.0
node -e "require('@sparticuz/chromium').default.executablePath()" # -> /tmp/chromium
mkdir -p /tmp/nss-libs && tar xf <(node -e "
  const {brotliDecompressSync}=require('zlib');const fs=require('fs');
  fs.writeFileSync('/dev/stdout', brotliDecompressSync(fs.readFileSync(
  'node_modules/@sparticuz/chromium/bin/al2023.tar.br')))") -C /tmp/nss-libs

# 3. Make the spec's "@playwright/test" import resolve from the repo
#    (node_modules/ is git-ignored, so this stays out of the diff):
cd /home/user/casevault
mkdir -p node_modules/@playwright
ln -sfn /tmp/eu-d-browser-tools/node_modules/@playwright/test node_modules/@playwright/test
ln -sfn /tmp/eu-d-browser-tools/node_modules/playwright-core node_modules/playwright-core

# 4. Runner config (kept outside the repo too) — the key part is
#    launchOptions.executablePath=/tmp/chromium plus
#    env.LD_LIBRARY_PATH=/tmp/nss-libs/lib, workers=1. Full file used:
#    see "Config file contents" at the bottom of this README.
```

## Config file contents (`/tmp/eu-d-browser-tools/eu-detail.playwright.config.mjs`)

```js
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "/home/user/casevault/tests/browser",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    launchOptions: {
      executablePath: "/tmp/chromium",
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      env: { ...process.env, LD_LIBRARY_PATH: "/tmp/nss-libs/lib" },
    },
  },
});
```

## Running the stack (disposable DB + synthetic storage only)

```bash
# Postgres without Docker (agent harness; see scripts/agent_pg.py)
python scripts/agent_pg.py start
eval "$(python scripts/agent_pg.py env)"
export DATABASE_URL="$TEST_DATABASE_URL"        # scratch DB, never real case data
export LOCAL_STORAGE_ROOT=/tmp/eu-d-storage     # never the repo's data/ tree
python -m alembic -c apps/api/alembic.ini upgrade head

# API (terminal 2)
python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port 8100

# Web (terminal 3) — proxies /api/v1/* to the API (next.config.mjs)
npm run dev --workspace=web -- --port 3000

# Worker mode (optional; enables the queued:true OCR paths)
redis-server --port 6379 --daemonize yes
python -m workers.run_worker
```

Both modes are covered: **without** Redis/worker (reprocess reports
`queued:false`, OCR tests for the not-queued path run) and **with** them
(`queued:true`, terminal complete/skipped tests run). The spec auto-detects
the mode and skips the unreachable half with an explicit reason.

## Running the tests

```bash
# HTTP probe (API must be up; no browser involved)
API_BASE_URL=http://localhost:8100 node tests/browser/eu-detail-http-probe.mjs

# Browser spec (web + API must be up; add redis + worker for the queued:true half)
node /tmp/eu-d-browser-tools/node_modules/@playwright/test/cli.js test \
  -c /tmp/eu-d-browser-tools/eu-detail.playwright.config.mjs \
  eu-detail.spec.mjs --reporter=list
```

The spec auto-detects the mode (real reprocess probe): without Redis/worker
the `queued:true` tests skip with an explicit reason; with Redis + a running
RQ worker the `queued:false` test skips (that response is unreachable when
Redis is up). Run BOTH modes for full coverage — EU-D's recorded results are
in `handoff/notes/EU-D.md`.

The timeout test (`ocr watch: bounded polling stops after the 120s budget…`)
takes ~2.5 minutes by design — the budget it verifies is the contract's 120s.

## Honest limitations (EU-D observed, 2026-09-10)

- **The sandbox browser cannot render PDFs inline**: headless Chromium
  152.0.7977.0 reports `navigator.pdfViewerEnabled === false`, and pointing
  an iframe at a blob: PDF **downloads it instead of rendering it**. The UI
  therefore feature-detects and shows the labeled fallback (no preview
  button, no fetch, explicit explanation + Download original) in such
  browsers — asserted by the spec. The blob-iframe inline-rendering path
  (and the "Preview failed [injected 503]" test) needs a PDF-capable
  browser and was NOT executed here: **transferred to EU-V** together with
  this checklist.
- `[injected …]` tests are deterministic negative-path proof; they do not
  replace real-worker or real-browser acceptance, which EU-V/EU-M own.
  Real-worker paths (queued:true → complete on text; → skipped on PDF) WERE
  executed here against a real Redis + RQ worker.
- Browser byte-equality is proven for TXT/PDF/PNG synthetic fixtures via the
  Playwright download event + `saveAs` + sha256 comparison.
- Client-side param-change draft reset (`useSourceDrafts` reacting to
  `source.id` change without remount) is implemented and reasoned about in
  the code, but no in-app link navigates detail→detail today, so the browser
  spec covers full navigation reset only.

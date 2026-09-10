# EU-L browser regression suites — evidence list page

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 §EU-L.

| File | What it proves | Network |
|---|---|---|
| `eu-list.spec.ts` | Keyboard-operable upload adds a source and refreshes the list; include/exclude are exclusive real-API transitions; duplicate warnings stay visible; empty vs filtered-empty are distinct; matter filter works | **Real** — real Chromium → real Next dev server → real FastAPI + Postgres. Nothing mocked. |
| `eu-list-failures.spec.ts` | Failed list request never renders as empty; retry works; stale rows are labelled “saved”; search input survives failure/retry; upload failure names the file and retries; row mutation failure is visible+attributed+retryable; pending rows can't be double-submitted; matter-filter and row-badge failures are announced with retry | **INJECTED** — Playwright route interception aborts/stubs specific calls (labelled per test) or adds latency in front of the real API. App code and browser are real; only the network outcome is forced. |

All fixtures are synthetic `.txt` files generated at runtime into the OS temp
dir — no real evidence, no identifying filenames or hashes.

## Reproducible setup (versioned)

Verified with `@playwright/test` **1.63.0** and its matching Chromium on
Node 22 / Debian 12. Any Playwright ≥1.49 should behave the same; if you use a
different major, re-run `npx playwright install chromium` to keep the browser
matched to the library version.

1. **Disposable stack** (never point these tests at real case data or the
   user's shared Postgres/Redis):
   ```bash
   # Either docker compose:
   make infra-up && make test-db
   # or, on machines without Docker, the embedded Postgres harness:
   python scripts/agent_pg.py start
   eval "$(python scripts/agent_pg.py env)"      # exports DATABASE_URL
   .venv/bin/python -m alembic -c apps/api/alembic.ini upgrade head
   ```
2. **API** (scratch storage root — never the user's `data/`):
   ```bash
   LOCAL_STORAGE_ROOT=/tmp/cv-eu-l-storage DATABASE_URL="$DATABASE_URL" \
     .venv/bin/python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port 8100
   ```
3. **Web** (dev server proxies `/api/v1/*` to the API):
   ```bash
   API_BASE_URL=http://localhost:8100 npm run dev --workspace=web
   ```
4. **Playwright** — installed as an *isolated tool* (per contract, no
   mandatory dependency/CI change; EU-V owns the runner-tooling proposal):
   ```bash
   mkdir -p ../eu-l-pw-harness && cd ../eu-l-pw-harness
   npm init -y && npm i -D @playwright/test@1.63.0
   npx playwright install chromium
   ```
   with a `playwright.config.ts` in that scratch dir pointing
   `testDir` at `<repo>/tests/browser`, `use.baseURL` at the web server
   (default `http://localhost:3000`), `workers: 1`, `retries: 0`.
5. **Run**:
   ```bash
   cd ../eu-l-pw-harness
   EU_WEB_BASE=http://localhost:3000 EU_API_BASE=http://localhost:8100/api/v1 \
     npx playwright test --config=playwright.config.ts
   ```

Env vars: `EU_WEB_BASE` (default `http://localhost:3000`), `EU_API_BASE`
(default `http://localhost:8100/api/v1`) — the API base is only used by the
Node-side seeding/assertion fetches; the browser always talks to the web
origin.

## Sandbox note (uncommitted isolated tooling)

The proof run for this wave ran inside a network-restricted sandbox where the
Playwright CDN and apt are blocked but the npm registry is reachable. The
browser was obtained **entirely from npm** with
`npm i -D @sparticuz/chromium` (its bundled Chromium + Amazon-Linux-2023
library tar, extracted manually) and launched by Playwright via
`executablePath` + `LD_LIBRARY_PATH` pointing at the extracted libs
(`libnspr4/libnss3/libnssutil3` etc.). `chromium --version` for that binary:
Chrome for Testing 153.0.8010.12 (Playwright chromium v1243 channel
equivalent). No repo file depends on that path; on an unblocked machine the
standard `npx playwright install chromium` from step 4 is equivalent.

## Not covered here (owned elsewhere / later)

- Detail page (EU-D), real-worker OCR behaviour, and integrated positive-path
  acceptance on the merged tree (EU-V, §Proof and safety).
- The suite does not assert the exact server-side filter semantics beyond
  `q`/`matter_id` reaching `GET /sources` — filter parity is a BACKLOG item.

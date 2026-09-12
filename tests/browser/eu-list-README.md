# EU-L browser regression suites — evidence list page

Contract: `docs/contracts/evidence_ui_closure.md` v1.0 (including the
2026-09-11 authorized integration amendment).

| File | What it proves | Network |
|---|---|---|
| `eu-list.spec.ts` (5 tests) | Keyboard-operable upload (single activation) adds a source and refreshes the list; include/exclude are exclusive real-API transitions; duplicate warnings stay visible; empty vs filtered-empty are distinct; matter filter sends `matter_id` to `GET /sources` and filtered-empty shows for a fresh matter | **Real** — real Chromium → real Next dev server → real FastAPI + Postgres. Nothing mocked. |
| `eu-list-failures.spec.ts` (11 tests) | Failed list request never renders as empty; retry works; stale rows are labelled "saved"; search input survives failure/retry; upload response loss names the file, reports the outcome as unknown, offers refresh-before-retry, retry succeeds; 4xx upload rejection states the proven outcome; **held first upload response + second drop/picker activation cannot start a second upload (single-flight guard, 2026-09-11 review)**; row mutation response loss is honestly uncertain with refresh-first reconciliation; 4xx row rejection says "row unchanged"; slow row PATCH disables that row's buttons (one PATCH); matter-filter and row-badge failures are announced with retry | **INJECTED** — Playwright route interception aborts/stubs/delays/holds specific calls (labelled per test). App code and browser are real; only the network outcome is forced. |

All fixtures are synthetic in-memory TXT content (constructed as in-page
`File` objects) — no real evidence, no identifying filenames or hashes.

## Keyboard-upload proof — single activation (2026-09-11 review finding 5)

The suites open the file picker with the keyboard **once** — no repeated
presses, no silent fallbacks. Diagnosis behind the earlier three-attempt
helper (measured in this sandbox, Chromium via CDP, 2026-09-12):

- A genuine (CDP) Enter press **always** activated the upload button and
  **always** invoked the product's `input.click()` — 20/20 in every measured
  variant. The product's keyboard affordance is correct.
- An Enter pressed *immediately* after Playwright's injected `locator.focus()`
  loses the activation (2–4 of 8 single-activation successes, **with and
  without route interception** — routes are not the cause); ≥50 ms of settle
  between focus and press makes it reliable (8/8 at 50 ms, 12/12 at 250 ms
  with routes). Residual misses were always the CDP `filechooser` event not
  surfacing (14–19 of 20 at 500 ms) while the in-page `click` on the input
  still fired 20/20 — i.e. a test-harness interception artefact, not product
  behaviour.
- The committed helpers therefore: focus → 500 ms settle → **one** Enter →
  assert the picker opened via an in-page click listener on the file input
  (deterministic product proof) → hand the synthetic file to the input at the
  DOM boundary (`input.files` + `change` event), which drives the same
  downstream React flow as the native dialog (Playwright's `setFiles()`
  bypasses the OS dialog in exactly the same way).
- If the single activation ever fails to open the picker, the test **fails
  loudly** (see the `message:` on the `expect.poll`). Reliability across this
  revision's runs: 16/16 tests × 5 consecutive full-suite runs plus 3
  positive-suite runs — 80+ single keyboard activations, zero misses.

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
(`libnspr4/libnss3/libnssutil3` etc.). No repo file depends on that path; on
an unblocked machine the standard `npx playwright install chromium` from step
4 is equivalent.

## Not covered here (owned elsewhere / later)

- Detail page (EU-D), real-worker OCR behaviour, and integrated positive-path
  acceptance on the merged tree (EU-V, §Proof and safety).
- The suite does not assert the exact server-side filter semantics beyond
  `q`/`matter_id` reaching `GET /sources` — filter parity is a BACKLOG item.

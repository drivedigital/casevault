# EU-V — independent evidence browser acceptance checklist

**Contract:** `docs/contracts/evidence_ui_closure.md` v1.0 FROZEN (2026-09-10)
**Assignment:** EU-V (independent browser verifier) — write set
`tests/browser/eu-acceptance-*`, `scripts/eu_browser_*`, `handoff/notes/EU-V.md`
**Status:** checklist, tooling and tooling guards are green; the product
acceptance specs (`eu-acceptance-detail/list/ocr.spec.ts`) are written and are
**expected RED until the integrator supplies the corrected D+L merged SHA**.
Final acceptance runs only against that integrated tip.

This checklist is the acceptance plan, not the result. It maps every clause of
the frozen contract to a browser-executed case with a declared proof mode, an
observable pass criterion and the evidence captured. Nothing here is satisfied
by `next build`, lint, typecheck, curl or source inspection; the contract
forbids substitutes for click-through/keyboard proof and EU-V does not weaken
a case to make a page pass — product bugs are reported to EU-D / EU-L through
the integrator.

---

## 0. Proof modes (declared on every case, printed in the JUnit report)

| Mode | Meaning | May it stand in for another? |
|---|---|---|
| `REAL_API` | Real browser against the integrated real API, real Postgres, real Next dev server. No stubs, no TestClient, no fixture overrides. | Baseline for positive paths |
| `REAL_WORKER` | `REAL_API` **plus** a real RQ worker run: requires the job **result payload AND committed DB state**, not merely `202 accepted` or RQ `FINISHED`. | Required for OCR completion cases |
| `INJECTED_FAULT` | Deterministic transport failure / status sequence injected with Playwright `page.route` (status codes, aborts, delays, scripted OCR status sequences). Always labelled. | **Never** replaces `REAL_WORKER` |
| `TRANSPORT` | Browser-context HTTP probe of a shipped endpoint (headers, byte equality of a navigation-triggered download). Supports, never replaces, a click-through case. | Support only |
| `TOOLING` | Guard regression for the acceptance tooling itself (path preservation, startup rollback, redaction, bind address, cleanup reporting). No product claim. | Guards the runner |

## 1. Environment preconditions (recorded before any case runs)

- [ ] **E1** Exact merge SHA under test (`git rev-parse HEAD` of the integrated
      tip after D+L), branch, and base SHA recorded in the report.
- [ ] **E2** Browser + runtime versions printed by the run
      (`browser.version()`, Node, Playwright version, Chromium source and
      resolution mode). Resolution is platform-aware: explicit
      `EU_V_CHROMIUM_EXECUTABLE` → Playwright-managed browser (per-OS cache
      path, full Chromium preferred over `headless_shell` because only the full
      build ships the PDF viewer) → the npm-shipped build **on Linux x64 only**
      (refused on macOS/Windows). This sandbox reports
      `HeadlessChrome/152.0.7977.0`, Node 22.22.3, `@playwright/test` 1.63.0,
      source `npm:@sparticuz/chromium`.
- [ ] **E3** Real stack, isolated: disposable database created and dropped by
      `scripts/eu_browser_stack.py`, private Redis on a Unix socket with no
      persistence, scratch `LOCAL_STORAGE_ROOT`, real `uvicorn` API, real
      `python -m workers.run_worker`, real `next dev`.
- [ ] **E4** Synthetic fixtures only (TXT / PDF / PNG produced by
      `scripts/eu_browser_fixtures.py`, which reuses the wave-standard
      generator). No real evidence, no identifying filenames or hashes in
      commits, artifacts or reports.
- [ ] **E5** Tooling self-check green first: `bash scripts/eu_browser_run.sh`
      with `eu-acceptance-tooling.spec.ts` (T1–T6) proves the browser can
      upload through the real stack, download original bytes and receive
      injected faults **before** any product case is judged.
- [ ] **E6** Tooling guards green before the acceptance run: G1–G9 in
      `eu-acceptance-tooling-guards.spec.ts` (path preservation, startup
      rollback, redaction, quoted env, `0.0.0.0` binding, incomplete-cleanup
      reporting). See §4a.

## 2. EU-D — detail page (`apps/web/app/evidence/[id]/page.tsx`)

### D1 — Status tab initialization, dirty drafts, save behaviour (contract §EU-D.1)

| ID | Case | Mode | Browser steps | Pass criterion |
|---|---|---|---|---|
| D1.1 | Direct entry initializes from server | REAL_API | Open `/evidence/{id}` for a source with a known title/status; click the **Status** tab; wait for the source query to settle | Title input value equals the server title; status select equals the server `source_status`; neither is empty/placeholder at any observed frame |
| D1.2 | Entry via **Edit** initializes from server | REAL_API | Open the detail page, click **Edit**, inspect the same fields | Same as D1.1 — initialization is identical for both entry paths |
| D1.3 | Never submit an uninitialized/invalid status | REAL_API | Load → immediately click **Save**; capture the PATCH body | PATCH payload contains `source_status` equal to a valid vocabulary value; no `""`, `null`, `undefined` or placeholder is ever submitted |
| D1.4 | Background refetch must not erase a dirty draft | REAL_API | Type a new title; trigger a refetch (query invalidation from a save elsewhere / window refocus); wait ≥ 2 poll intervals | Typed value is still in the input after the refetch completes; no PATCH was fired by the refetch |
| D1.5 | Navigating to another source resets drafts | REAL_API | Dirty the title → navigate to a different source → return | Fields show server values for that source; the previous draft is not restored |
| D1.6 | Save success reconciles drafts and caches | REAL_API | Change title → Save (200) → assert detail UI, then navigate to `/evidence` | Success feedback shown; detail shows saved value; the list row shows the new title without a manual reload |
| D1.7 | Save failure retains input and offers retry | INJECTED_FAULT | Type a new title; inject `PATCH /sources/{id}` → 500; click Save | Typed text still in the input after the failure; an error with a retry affordance is visible and announced; no false success state |
| D1.7b | Retry after failure succeeds | INJECTED_FAULT | Continue D1.7: remove the injection, click Retry | New value saves; error clears; cache reconciles |
| D1.8 | Concurrent save/reprocess does not duplicate or clobber | REAL_API | Double-click **Save** rapidly with an injected delay; then start **Reprocess OCR** and save an edit while it is pending | Exactly one PATCH per intended save (request log); the later edit is the value that persists; no duplicate reprocess POSTs; no stale response overwrites newer state |

### D2 — Download original (contract §EU-D.2)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| D2.1 | Explicit download for **text** | REAL_API | Open detail for the synthetic TXT; click the download control | A `download` event fires; `suggestedFilename()` equals the original filename; the saved file's SHA-256 equals the fixture SHA-256 |
| D2.2 | Explicit download for **PDF** | REAL_API | Same, synthetic PDF | As D2.1 (bytes identical) |
| D2.3 | Explicit download for **image** | REAL_API | Same, synthetic PNG | As D2.1 (bytes identical) |
| D2.4 | Same-origin shipped file endpoint | REAL_API | Record the request that the click triggers | URL is the same-origin `/api/v1/sources/{id}/file`; no third-party/remote host; no rewritten attachment URL |
| D2.5 | Fetch-backed download failure is visible | INJECTED_FAULT | Abort/fail the file-endpoint request, click download | An error is shown; the control returns from pending; no silent success, no infinite spinner |
| D2.6 | Preview alone is not counted as proof | — | Metarule | D2.1–D2.3 require a real `download` event and byte comparison; an embedded preview or a 200 response never satisfies this case |

### D3 — PDF preview safety (contract §EU-D.3)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| D3.1 | No attachment download invoked on page load | REAL_API | Open the PDF detail page; watch downloads and top-level/script-initiated navigation for 10 s | No download or navigation to the file endpoint is initiated by the page itself; a preview may only be fetched when the user opts in (D3.2). *(In a browser without PDFium an `<iframe>` pointing at the endpoint will download — see §5: that is recorded as a product finding, not silently tolerated.)* |
| D3.2 | Preview is opt-in / not eagerly buffered | REAL_API | Load the page and wait; count requests to the file endpoint | Zero requests to the file endpoint until the user activates the preview |
| D3.3 | Object-URL lifecycle | REAL_API | Activate preview (instrument `URL.createObjectURL` / `revokeObjectURL`), then change source and unmount | An object URL is created for the preview and **revoked** on source change and on unmount |
| D3.4 | Loading and error labels | INJECTED_FAULT | Delay the preview fetch (loading label), then inject 500 (error label) | Distinct loading and error states are visible; the error state offers the download fallback |
| D3.5 | Download fallback works | REAL_API | From the error/labelled state, click the fallback | Download event + byte equality (as D2.1) |
| D3.6 | No untrusted HTML injection | REAL_API | Load previews for every type; inspect the DOM | No `innerHTML`-built nodes from file content, no injected `<script>`; text is rendered as text |
| D3.7 | Attachment/security headers unchanged | TRANSPORT | Read the file-endpoint response headers in the browser context | `Content-Disposition: attachment` and existing security headers are unchanged by the UI work; no remote viewer/provider host is contacted |

### D4 — Distinct errors, retries, pending state (contract §EU-D.4)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| D4.1 | Missing/unavailable source is not a healthy empty view | INJECTED_FAULT | Inject 404, then 500, then abort on `GET /sources/{id}` | Distinct error state each time; never an empty "healthy" detail; retry works |
| D4.2 | Pages failure is distinct and retryable | INJECTED_FAULT | Fail `GET /sources/{id}/pages` | Pages error is visible and distinguishable from the source error; values entered elsewhere are preserved; retry reloads pages |
| D4.3 | Matter-list failure ≠ "no linked matters" | INJECTED_FAULT | Fail `GET /sources/{id}/matters` | Error (not "Not linked to any matter") with retry; after retry the list renders |
| D4.4 | Link / unlink failures are attributable | INJECTED_FAULT | Fail `POST /matters/{id}/sources`, then `DELETE /source-matter-links/{id}` | Failure is attributed to link/unlink specifically; the selected matter and other entered values survive; retry works |
| D4.5 | Update failure retains input | INJECTED_FAULT | As D1.7 for the status/title controls | Input retained, error + retry, no optimistic flip of badges |
| D4.6 | Pending state protects actions | REAL_API | Click Save/Link/Unlink twice with an injected delay | Exactly one request per action; the control is disabled or visibly pending while in flight; no double submit |

### D5 — OCR enqueue feedback, polling, terminal states (contract §EU-D.5)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| D5.1 | `202` means accepted, not completed | REAL_API | Click **Reprocess OCR**; capture the 202 body | UI says accepted/queued; it does **not** claim extraction success or completion |
| D5.2 | `queued:false` shows the reason and does not poll | INJECTED_FAULT | Fulfil `POST /reprocess` with `{queued:false, job_id:null, reason:"…"}` | The reason is displayed; no completion polling loop starts (≤ expected source refetches, zero poll repetition over 10 s); no success claim |
| D5.3 | `queued:true` polls bounded at ~2 s | INJECTED_FAULT | Scripted status sequence: `processing` for N polls then `complete` | Poll requests to the existing source endpoint occur at ≈2 s intervals (tolerance for scheduling); no faster hammering; loops never overlap |
| D5.4 | Terminal `complete` refreshes pages/source/caches | INJECTED_FAULT | Sequence ending in `complete` | Polling stops within one interval; pages and source queries refetch; the list cache reflects the new state; success is shown |
| D5.5 | `skipped` / `failed` are distinct from success | INJECTED_FAULT | Sequences ending in `skipped`, then in `failed` | Each terminal state is labelled distinctly and is not presented as successful extraction; polling stops |
| D5.6 | Timeout stops polling and offers manual refresh | INJECTED_FAULT | Scripted `processing` that never terminates; observe up to the 120 s cap | Automatic polling stops at ~120 s; the UI shows an unconfirmed/still-processing state with a manual refresh; it does **not** claim the job failed |
| D5.7 | Cancellation on navigation / source change | INJECTED_FAULT | Start polling, then navigate away and switch sources | No poll requests for the abandoned source after navigation; no overlapping loops; no state update after unmount (no React leak warnings in the console log) |
| D5.8 | Network errors are visible | INJECTED_FAULT | Abort the poll request | A visible error; polling does not silently disappear without feedback |
| D5.9 | No fabricated job-status endpoint | REAL_API + INJECTED_FAULT | Record every URL requested while polling | Only existing endpoints (`GET /sources/{id}`, `GET /sources/{id}/pages`) are polled; no new `/jobs/*` or invented status route |
| D5.10 | **Real worker** success, text fixture | REAL_WORKER | Upload TXT through the UI; run two sequential **Reprocess OCR** clicks with the real RQ worker | Job result payload observed **and** committed DB state (`ocr_status`, page rows) verified by an independent SQL read; both runs idempotent |
| D5.11 | **Real worker** success, PDF and image | REAL_WORKER | Same for PDF and PNG | Result payload + committed state; known engine stubs produce a valid **`skipped`** outcome that is labelled as such, never as success |
| D5.12 | Reprocess is not conflated with upload | REAL_WORKER | Separate cases for upload-time processing vs explicit reprocess | Each case asserts only its own job's payload and state; no claim is carried over between them |

### D6 — Cache consistency (contract §EU-D.6)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| D6.1 | Source list/detail caches reconcile after success | REAL_API | Save on detail → navigate to `/evidence` | Updated value visible without a manual reload |
| D6.2 | Unrelated ledger/intake queries are not invalidated | REAL_API | Record requests during evidence saves/links | No refetch of `/api/v1/ledger*` or intake endpoints as a side effect of evidence mutations |

## 3. EU-L — list page (`apps/web/app/evidence/page.tsx`)

### L1 — Distinct list states (contract §EU-L.1)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| L1.1 | Loading state | INJECTED_FAULT | Delay `GET /sources` | A loading indicator distinct from empty/error; not an error flash |
| L1.2 | Empty state | REAL_API | Fresh isolated DB, no sources | Empty copy shown; no error styling |
| L1.3 | Filtered-empty state | REAL_API | Sources exist; apply a filter matching none | Copy differs from the true empty state and says the *filters* matched nothing |
| L1.4 | Request failure is not "empty" | INJECTED_FAULT | Inject 500 on `GET /sources` | Error state with an actionable retry; the table is not presented as an empty result set |
| L1.5 | Retained stale data is labelled | INJECTED_FAULT | Load successfully, then fail a refetch while rows are mounted | If rows remain, they are labelled stale; otherwise the error state is shown — never a silent "healthy" list |

### L2 — Row mutation feedback and pending protection (contract §EU-L.2)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| L2.1 | Include failure is visible and attributable | INJECTED_FAULT | Fail `PATCH /sources/{id}` for one row's Include | Error tied to that row/source; the row's badges do **not** flip; no false success |
| L2.2 | Exclude failure is visible and attributable | INJECTED_FAULT | Same for Exclude | As L2.1 |
| L2.3 | Pending protection prevents duplicates | REAL_API | Double-click Include with an injected delay | Exactly one PATCH; the control is disabled/pending while in flight |
| L2.4 | Exclusive transitions send **both** flags | REAL_API | Click Include, then Exclude; capture PATCH bodies | Each payload contains both `included_flag` and `excluded_flag` with the opposite flag explicitly cleared |
| L2.5 | Retries preserve query/filter values | INJECTED_FAULT | Set search + filters, fail the mutation, retry | Search text and every filter keep their values through the failure and the retry |

### L3 — Matter filter / row badge failures (contract §EU-L.3)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| L3.1 | Matter filter failure ≠ "no linked matters" | INJECTED_FAULT | Fail the matters query used by the filter, then retry | Visible, accessible feedback with retry; the filter is not rendered as an empty result |
| L3.2 | Row badge failure is per-row | INJECTED_FAULT | Fail `GET /sources/{id}/matters` for one row | That row shows feedback (not a bare `—` implying no matters); other rows unaffected |
| L3.3 | No raw server traces leaked | INJECTED_FAULT | Return a 500 with a traceback/SQL body | The rendered message contains no traceback, SQL, stack or raw detail dump |
| L3.4 | Feedback is accessible | INJECTED_FAULT | Inspect the error nodes during L3.1/L3.2 | Error region is announced (`role="alert"` / `aria-live`) and reachable by keyboard; retry is focusable |

### L4 — Upload, filters and parity (contract §EU-L.3–5)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| L4.1 | Upload works by **keyboard only** | REAL_API | Tab to the upload control, press Enter/Space; the browser opens the file chooser; select a synthetic file | A real `filechooser` event opens from a keyboard activation; the upload completes and the row appears. *(Baseline finding at `ab0ee23`: the hidden input did **not** open a chooser — recorded as `eu-v-baseline-gap`; after EU-L this case must pass strictly, no `setInputFiles` fallback.)* |
| L4.2 | Drag/pointer path still works | REAL_API | Set files on the input (pointer/drop equivalent) | Upload completes; row appears |
| L4.3 | Upload failure is visible and attributable | INJECTED_FAULT | Fail `POST /sources` | Error attributed to the upload; pending state cleared; retry possible |
| L4.4 | Server-supported filters preserved | REAL_API | Apply search/matter/type/review filters; capture the query string | Only `q`, `matter_id`, `source_type`, `evidence_review_status` are sent; no new server params, no envelope/pagination params |
| L4.5 | Client-side filter parity retained | REAL_API | Filter by source status, OCR status, included/excluded | Existing client-side filtering still narrows the rows |
| L4.6 | Sources response stays a bare array | TRANSPORT | Read `GET /sources` from the browser context | JSON is an array (no new envelope) and the UI renders it |
| L4.7 | Duplicate warnings retained | REAL_API | Upload the same synthetic file twice | Duplicate flag/banner shown on the row and detail; nothing is deleted |
| L4.8 | Existing navigation preserved | REAL_API | Click a row title; visit `/ledger`, `/ai-review` | Row links to `/evidence/{id}`; ledger and intake screens still function |

### L5 — Cache refresh scope (contract §EU-L.5)

| ID | Case | Mode | Steps | Pass criterion |
|---|---|---|---|---|
| L5.1 | Success refreshes the source-list query | REAL_API | Complete an upload / include / exclude | The sources query is refetched and the new state is rendered |
| L5.2 | Unrelated queries untouched | REAL_API | Record requests during L5.1 | No ledger/intake refetch triggered by list mutations |

## 4. Cross-cutting execution rules

- [ ] **X1** Every spec declares its mode via `declareMode(...)`; the JUnit
      report carries `eu-v-proof-mode` per test so injected faults can never be
      mistaken for real API/worker proof.
- [ ] **X2** Positive paths run against the integrated real API; injected
      failures are used only for negative cases and are separately labelled in
      the report and the handoff note.
- [ ] **X3** Real-worker cases assert the **result payload AND committed state**
      (independent SQL read of `sources` / `source_pages`); a queued job or an
      RQ `FINISHED` status alone fails the case.
- [ ] **X4** Fixtures are synthetic and generated (TXT/PDF/PNG); uploads, DB
      rows, storage and artifacts are removed by `eu_browser_stack.py stop`
      (throwaway database dropped, scratch storage deleted, logs kept as
      git-ignored diagnostics).
- [ ] **X5** No writes to the user's shared Redis or database: private Unix
      socket with no persistence, disposable database, scratch storage root.
- [ ] **X6** Artifacts (traces, screenshots, console logs, JUnit XML) land in
      git-ignored `data/diagnostics/eu-browser/`; only redacted summaries are
      pasted into the handoff note.
- [ ] **X7** Failures are reported to the owning workstream (EU-D / EU-L)
      through the integrator with: case ID, exact steps, observed vs expected,
      console/trace excerpt. EU-V does **not** fix product code and does not
      edit the implementers' tests (`tests/browser/eu-d-*`, `eu-list-*`).
- [ ] **X8** Selector/copy differences after merge are adapted, never the
      assertion: if a case cannot be expressed because the UI does not expose
      the behaviour, it is reported as a finding against the owning clause.

## 4a. Tooling guard regressions (G1–G9, `eu-acceptance-tooling-guards.spec.ts`)

These guard the acceptance tooling itself and must be green before any product
case is judged. They run the real scripts with stubbed inputs (throwaway
artifacts directories, an unreachable admin URL, a missing alembic config) and
never touch a shared database or queue.

| ID | Guard | Mode | Pass criterion |
|---|---|---|---|
| G1 | A pre-existing **directory** at the module-link path is preserved | TOOLING | Sentinel file survives; setup warns and exits 0 |
| G2 | A **foreign symlink** is preserved | TOOLING | Link target unchanged; sentinel survives |
| G3 | Only an EU-V managed symlink is replaced | TOOLING | Managed link removed; the install it pointed at is untouched |
| G4 | Unreachable admin database | TOOLING | Start exits non-zero; no database created; recovery state retained; **no credentials in the output** |
| G5 | Failed migration rolls back | TOOLING | Start exits non-zero; `status=failed`, `step=migrate`; the database created during startup is dropped; state file is `0600`; the admin database is untouched |
| G6 | `redact()` hides userinfo and credential parameters | TOOLING | Passwords and `password=` absent; host/db still readable |
| G7 | Env emission is opt-in and shell-quoted | TOOLING | `start` prints no `export`; every `env` line round-trips through `sh` unchanged; metacharacter values are quoted |
| G8 | Browser-facing servers bind `0.0.0.0` | REAL_API | `/evidence`, `/health` and the proxied `/api/v1/...` answer on a non-loopback interface |
| G9 | Incomplete cleanup is reported | TOOLING | With `DROP DATABASE` blocked: `stop` exits non-zero, keeps `status=failed-cleanup` + recovery steps and the database; once the blocker is gone the same state stops cleanly |

## 5. Known environment limitations (declared, not hidden)

| Limitation | Impact | Handling |
|---|---|---|
| The sandbox Chromium (`npm:@sparticuz/chromium`, headless shell) reports `navigator.pdfViewerEnabled === false` and 0 plugins; navigating directly to a PDF downloads it | Native PDF **rendering** cannot be verified here | D3.1–D3.7 still run (no auto-download, opt-in gating, object-URL lifecycle, labels, fallback, headers). Native render + Safari/Chrome viewer behaviour is handed to **EU-M** on the local Mac, where `bash scripts/eu_browser_setup.sh playwright-download` installs a full managed Chromium **with** the PDF viewer; the report states which cases were run where |
| Only one browser family is available (`cdn.playwright.dev`, Chrome-for-Testing and Debian mirrors are unreachable from this sandbox) | No cross-browser matrix here | Single Chromium project on purpose (contract: no parallel frameworks). On a normal machine the same specs run against any browser Playwright manages; EU-M covers Safari/Chrome locally. `playwright-download` installs and uses a managed browser and **fails loudly** instead of falling back to the Linux binary |
| Headless shell instead of headed Chrome | Layout/visual regressions are not judged | Cases assert observable behaviour and accessible names, not pixels |

## 6. Traceability — contract clause → checklist IDs

| Contract clause | Cases |
|---|---|
| EU-D.1 (Status init, dirty refetch, reset, save/failure, concurrency) | D1.1–D1.8 |
| EU-D.2 (explicit download, bytes, failure) | D2.1–D2.6 |
| EU-D.3 (PDF preview safety, opt-in, lifecycle, labels, fallback) | D3.1–D3.7 |
| EU-D.4 (distinct errors, retries, pending) | D4.1–D4.6 |
| EU-D.5 (OCR 202, queued false, polling, terminal, timeout, cancel, network) | D5.1–D5.12 |
| EU-D.6 (cache consistency) | D6.1–D6.2 |
| EU-L.1 (loading/empty/filtered-empty/error) | L1.1–L1.5 |
| EU-L.2 (row failures, pending, both flags, preserved inputs) | L2.1–L2.5 |
| EU-L.3 (matter filter/badge failures, accessible feedback, keyboard upload) | L3.1–L3.4, L4.1–L4.3 |
| EU-L.4 (filters, bare array, parity) | L4.4–L4.8 |
| EU-L.5 (cache refresh scope, duplicates, navigation) | L5.1–L5.2, L4.7–L4.8 |
| Proof and safety (fixtures, isolation, labeling, artifacts) | X1–X8, E1–E6 |

## 7. Where each case lives

| Spec file | Cases |
|---|---|
| `eu-acceptance-tooling.spec.ts` | T1–T6 (tooling self-check against the real stack) |
| `eu-acceptance-tooling-guards.spec.ts` | G1–G9 (tooling guard regressions) |
| `eu-acceptance-detail.spec.ts` | D1.1–D1.8, D2.x, D2.5, D3.1–D3.7, D4.1–D4.6, D6.1–D6.2 |
| `eu-acceptance-list.spec.ts` | L1.1–L1.5, L2.1–L2.5, L3.1–L3.4, L4.1–L4.8, L5.1–L5.2 |
| `eu-acceptance-ocr.spec.ts` | D5.1–D5.13 (injected sequences and REAL_WORKER completion) |

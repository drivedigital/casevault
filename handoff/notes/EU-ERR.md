# EU-ERR — narrow list error-disclosure fix

Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L (1)–(3)
Brief: handoff/kickoff/EU-ERR.md · Branch: `arena/01a097fd-casevault`
Base: `8f311a4` (product code identical to checkpoint `a040e9f` — verified:
`git diff a040e9f 8f311a4 -- apps workers scripts packages tests` is empty).
Verifier checkpoint `e7fe31ec14ba0c99625057646769440dbb0ac1cd` (EU-V PR #19)
confirmed fetchable read-only; EU-V files untouched.

## What changed

Product (write set respected — zero other paths touched):

- `apps/web/lib/evidence-list-errors.ts` (NEW, pure helper):
  `mapListError()` implements the deliberate disclosure boundary:
  - Allowlisted known server validation outcomes (`422` "Uploaded file is
    empty.", `413` "File exceeds the N MB upload limit." — both from
    `apps/api/app/services/source_service.py`) map to UI copy authored in the
    helper; server text itself is never rendered (the size-limit pattern's
    only free part is a `\d{1,4}` digit run used as an allowlist shape check;
    no free text captured or rendered).
  - Unknown/arbitrary 4xx `detail` → generic "The server rejected this
    request (HTTP <status>)." (status integer only — outcome stays proven).
  - 5xx/unknown-status → generic server-error message; no body text.
  - `TypeError` (connection-level) → honest network message; raw "Failed to
    fetch" is not shown. `AbortError`/`TimeoutError` → timeout message.
  - Anything else (unexpected Error shapes, non-Error throws) → generic
    fallback. Total function; never throws; never echoes `String(error)`.
- `apps/web/components/evidence-list-states.tsx`: `describeError()` now
  delegates to `mapListError()` (same signature, all four list surfaces —
  page ListStateRow, matter filter, row include/exclude + badge, upload —
  fixed at the source with no caller edits). `errorStatus()`/`outcomeKnown()`
  are byte-identical, so the 4xx-proven vs 5xx/response-loss uncertainty copy
  is unchanged. The wrong header comment claiming the API only sends curated
  `detail` ("raw server traces can never reach the UI") was corrected to
  describe the actual boundary and why.

Tests (NEW files only; no existing assertion edited):

- `tests/browser/eu-error-disclosure.spec.ts` (4 tests): labelled INJECTED
  traceback/SQL 500 on (1) row matter badge, (2) list load — generic reason,
  no leak, failure distinct from empty, accessible retry recovers to the real
  state; (3) connection-abort badge failure — honest network copy, no
  "Failed to fetch", retry recovers; (4) row include 500 + matter-filter 500
  — attribution, honest uncertainty ("not known whether…", "Refresh the list
  first") and generic reasons on both surfaces, retries recover.
- `tests/browser/eu-error-validation.spec.ts` (3 tests): REAL-API empty-file
  upload keeps curated validation feedback with proven-outcome copy; INJECTED
  arbitrary 4xx detail (upload 422, row 400) is NOT rendered and reduces to
  the generic status-attributed rejection while proven-outcome copy holds.

## Proof

Environment: disposable embedded Postgres (`scripts/agent_pg.py`, git-ignored
`data/pgdata`), migrations 0001→0004 up, API on :8100 with
`LOCAL_STORAGE_ROOT=/tmp/cv-eu-err-storage`, Next dev on :3000, Playwright
1.63.0 + npm-fallback Chromium in an out-of-repo harness (per
`tests/browser/eu-list-README.md`). Synthetic in-memory TXT fixtures only;
no real evidence; raw logs in `/tmp` outside Git.

Web gate:

```
npm run web:lint      ✔ No ESLint warnings or errors
npm run web:typecheck ✔ (tsc --noEmit, clean)
npm run web:build     ✔ (production build succeeded)
```

Reproduction BEFORE the fix (same spec files, unfixed tree; `npx playwright
test eu-error-disclosure`): **4 failed** — captured UI text showed the
disclosure on four surfaces, e.g. badge: `Couldn't load linked matters
Traceback (most recent call last): File "app/api/app.py", line 42, in boom;
SELECT * FROM sources Retry`; list: `Reason: Traceback … SELECT * FROM
sources.`; filter: `— Traceback … SELECT * FROM sources.`; network case
rendered raw `Failed to fetch`. Exit 1. (Log: /tmp/eu-err-repro-before.log)

AFTER the fix (both spec files, one run):

```
npx playwright test --config=playwright.config.ts
  7 passed (7.6s)          # repeat run: 7 passed (7.5s)
```

EU-L suite impact (READ-ONLY run of their `eu-list-failures.spec.ts` against
the fixed tree; no edits by me): **10 passed / 3 failed (1.3m)**. The 3
failures are exactly and only the assertions that require raw injected
`detail` text to render — the old blanket-trust behaviour this fix removes:

| Line | Test | Failing assertion | UI now shows (behaviour preserved) |
|---|---|---|---|
| 273 | INJECTED 4xx upload rejection… | `toContainText("synthetic injected rejection")` | attribution + `The server rejected this request (HTTP 422).` + "was not added…" |
| 373 | INJECTED row mutation response loss… | `toContainText("synthetic injected row-update failure")` | attribution + generic server message + "not known whether…"/"Refresh the list first" + successful retry |
| 422 | INJECTED 4xx row rejection… | `toContainText("synthetic injected rejection")` | attribution + `(HTTP 400)` + "The row is unchanged" |

Suggested minimal resolution (file owner/integrator decision, not done by
me): replace each raw-detail expectation with the corresponding safe-text
expectation above. Their protected semantics (proven outcome, uncertainty
copy, single-flight, retry recovery) all still pass — see the 10 passing.

Positive-path `eu-list.spec.ts` unaffected: no error path is exercised; by
inspection `describeError` renders nothing on those success flows.

## Contract gaps

- No contract version issue: §EU-L (3) already mandates "without leaking raw
  server traces"; this fix enforces it. However the safe-mapping depends on
  exact curated `detail` sentences (`source_service.py`). If backend wording
  changes, those cases degrade safely to the generic message (fail-closed)
  but lose tailored copy. Minimum robust change for a future contract bump:
  add a machine-readable `code` alongside `detail` on validation errors, and
  key the trusted mapping on codes instead of sentences. Recorded as
  follow-up, not implemented here (backend is read-only for EU-ERR).
- `tests/web/` is still a placeholder; pure-helper unit coverage lives inside
  the browser specs for now (no new test framework introduced, per brief).

## Risks / follow-ups

- EU-L's three raw-detail assertions above will fail on the integrated tree
  until their owner/integrator updates them (exact lines listed). EU-V is
  already asked (STATUS.md) to rerun its L3.2–L3.4 badge case post-merge; its
  `not.toContainText(/traceback|select \*|file [\"']/i)` gate should now pass
  alongside its other preserved assertions.
- The trusted allowlist is deliberately tiny (two sentences, upload surface).
  Other legit 4xx feedback on these surfaces (e.g. 404/409 on row PATCH) now
  shows the generic status-attributed message — safe but less specific. If
  the integrator wants curated copy there, extend the allowlist deliberately;
  do not revert to passthrough.
- Bundled-Chromium note: with `@sparticuz/chromium` defaults, closing a test
  context tears down the `--single-process` browser and the next launch can
  hang (observed 2026-09-12). The scratch harness drops that flag (config
  comment documents it); after that, runs were stable (7/7 twice + 13-test
  EU-L run). Harness-only; no repo impact.
- Detail-page surfaces use `lib/evidence-detail-errors.ts` (EU-D), which
  still passes `ApiError.message`/`Error.message` through — the same class of
  disclosure exists there. Out of EU-ERR's write set; flagged for the
  integrator as the natural next narrow fix (helper is structurally similar).

## What the next agent must know

- The boundary lives in one pure function (`mapListError`); list-surface copy
  changes belong there, not in components. `describeError` in
  `evidence-list-states.tsx` is a thin delegate kept for caller compatibility.
- Do not "fix" failing EU-L assertions by restoring `Error.message`
  passthrough; update the three assertions to the safe expectations (§Proof
  table) via the file owner.
- The scratch Playwright harness (this sandbox) is at
  `/home/user/eu-err-pw-harness` with `LD_LIBRARY_PATH=/tmp/al2023/lib`,
  `executablePath=/tmp/chromium`, `--single-process` filtered out; specs run
  with `workers:1 retries:0`, full eu-error set ≈ 8s. Disposable stack:
  `scripts/agent_pg.py` + uvicorn :8100 + `npm run dev` :3000.
- Raw logs kept outside Git: `/tmp/eu-err-repro-before.log`,
  `/tmp/eu-err-after-*.log`, `/tmp/eu-err-final-both.log`,
  `/tmp/eu-err-eul-impact.log`.

---

# Review amendment — 2026-09-12, PR21 comment5649550926 + fcaef0e

Integrator approved a narrow write-set extension and requested corrections on
this same PR. All completed; detail-page scope remains out (separately tracked).

## What changed (revision)

- `apps/web/lib/evidence-list-errors.ts`: NETWORK_MESSAGE no longer claims the
  server "could not be reached" — a failed fetch can also mean response loss
  after the server received (and possibly committed) a mutation. New copy:
  "The request failed before a usable answer arrived — the server may not have
  been reached, or its response may have been lost. Check the connection and
  try again." Callers' outcome-uncertainty wording untouched. Header/interface
  comments made consistent: exactly ONE server-derived substring may be echoed
  (the digit-only `\d{1,4}` limit run from the anchored 413 pattern, as the MB
  limit); all prior "no free text captured/rendered" phrasing now says the
  same thing instead of contradicting the digit echo. TypeError comment states
  the response-loss case explicitly.
- `tests/browser/eu-list-failures.spec.ts` (AUTHORIZED extension — only the
  three expectations named in my note; no other assertion/fixture touched):
  - L273 (upload 422): raw-detail expectation →
    `The server rejected this request (HTTP 422).` + explicit
    `not.toContainText("synthetic injected rejection")`.
  - L373 (row PATCH 500): raw-detail expectation →
    `The server had a problem with this request` + explicit no-echo of the
    injected text; attribution/uncertainty/refresh-first/retry assertions
    below it unchanged.
  - L422 (row 400): raw-detail expectation →
    `The server rejected this request (HTTP 400).` + explicit no-echo;
    "The row is unchanged" + read-back unchanged.
- `tests/browser/eu-error-disclosure.spec.ts` (my file): network assertion
  updated to the corrected copy substring.
- Branch additionally merged integration `fcaef0e` (docs-only authorization
  commit) per AGENT_POLICY §3.2; no conflicts, no other files changed.

## Proof (revision)

```
npm run web:lint      ✔ No ESLint warnings or errors
npm run web:typecheck ✔ clean
npm run web:build     ✔ succeeded

npx playwright test --config=playwright.config.ts          # eu-error specs
  7 passed (8.8s)                                          # 0 failed, 0 skipped
npx playwright test --config=playwright.eu-list.config.ts  # eu-list + failures
  18 passed (25.5s)                                        # 0 failed, 0 skipped
```

Exact counts: 25 passed / 0 failed / 0 skipped (7 eu-error + 5 eu-list
positive + 13 eu-list negative incl. the three amended expectations).
Remaining failures: none. Environment identical to the first round
(disposable embedded Postgres, uvicorn :8100 scratch storage, Next dev :3000,
isolated npm-Chromium harness). Raw logs: `/tmp/eu-err-rev-euerror.log`,
`/tmp/eu-err-rev-eulist.log`.

## What the next agent must know (revision)

- The digit-echo exception is the allowlist's ONLY server-derived output; keep
  it that way. The network message must stay outcome-uncertain (response-loss
  is possible after commit) — do not reintroduce "server unreachable" claims.
- The three eu-list-failures expectations now pin the SAFE behaviour; if the
  mapping copy ever changes, those three strings (`The server rejected this
  request (HTTP 4xx).` / `The server had a problem with this request`) must be
  updated together with `lib/evidence-list-errors.ts`.

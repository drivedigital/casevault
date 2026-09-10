# WS-D — Sprint 3 evidence verification and CI
Contract: `docs/contracts/sprint3_evidence.md` v1.0 with its 2026-09-10 **as-shipped override**, plus merged `docs/contracts/wave2_intake_core.md` v1.0 §6 (reprocess).

## Status on `e36caae` — evidence flow VERIFIED GREEN; successor PR open; one repo-wide CI job remains red on PR events

**Tested integration SHA: `e36caae46d95ca125848336f8993af6f4d1814f0`** (`arena/01a0899f-casevault` — includes W2-J's intake verifier + `intake` CI job and, transitively, the Evidence UI recovery `5da141c`). **No product change is authorized or present in this workstream.**

**Successor PR:** https://github.com/drivedigital/casevault/pull/14 (draft, `arena/01a08a04-casevault` → `arena/01a0899f-casevault`), linked from PR #10. #10's head stays frozen on `arena/01a089cf-casevault` @ `de18118`; nothing in this session pushed to another session's branch.

| What | Result on `e36caae` |
|---|---|
| `scripts/pipeline_smoke.py` (Redis **and** no-Redis in one run) | **exit 0 — `EVIDENCE GREEN (as-shipped): 25 checks; 8 original-v1 gaps; 0 scenarios skipped`** |
| `EVIDENCE_REQUIRE_DEPS=1` pytest wrapper | **3 passed, 0 skipped** (14.25 s) |
| `POST /sources/{id}/reprocess` | **202 required and returned in both modes**; no 404 fallback anywhere |
| Full gate `EVIDENCE_REQUIRE_DEPS=1 bash scripts/verify_all.sh` | **GATE GREEN** — migrations `→0004 → base → 0004`, **`96 passed, 0 skipped, 3 warnings`** (repo suite now includes W2-J's intake tests), `ruff: All checks passed!`, web lint + typecheck + `next build` (17 routes; `○ /evidence`, `ƒ /evidence/[id]`) |
| `--strict-v1` | exit **1** — `original Sprint 3 v1.0 has 8 observed contract gaps` |
| Redis binary absent | CLI exit **2**; strict pytest exit **1**; non-strict pytest **1 skipped with the explicit reason** |
| WS-C route guard in the verifier | **PASS** (`/evidence`, `/evidence/{id}` entrypoints present) |
| Route-shell (production `next start`) | `/evidence` **200**, `/evidence/<uuid>` **200**, control `/evidence-bogus-route` **404** |
| UI API parity (through the web origin) | **26/26 passed** |
| Browser interaction | **none performed** (no browser in this sandbox) — no browser claim made |
| GitHub CI, PR #14 run `34448888151` | `python ✓ web ✓ intake ✓ evidence ✓`, **`secrets ✗ (8 s)`** |
| GitHub CI, push run `34448822284` (same SHA) | **all five jobs ✓ including `secrets` and `intake`** |

## Rebase onto the latest integration tip, and the `ci.yml` conflict resolution
`git rebase --onto origin/arena/01a0899f-casevault 78cc8d5 arena/01a08a04-casevault` (stayed on the assigned branch; no branch created or switched, no other session's branch touched).

* One expected conflict, in `.github/workflows/ci.yml`, because W2-J's `intake` job and WS-D's `evidence` job both append at the same anchor (end of `jobs:`, immediately after the `gitleaks` step).
* Resolution verified mechanically, not by eye: final jobs = `python`, `web`, `secrets`, `intake`, `evidence`; the `intake` job text is **byte-identical to the merged W2-J job** (`INTAKE_REQUIRE`/`INTAKE_ALLOW_APP_DB`, guard-rail step, both intake pytest commands, `intake_smoke.py --require-intake`); the `evidence` job is **byte-identical to the WS-D job** (`POSTGRES_DB: casevault_evidence_ci`, `EVIDENCE_REQUIRE_DEPS=1`, Redis install, console/JUnit-only artifact upload); the `python`/`web`/`secrets` portion equals upstream **plus only** the authorized `GITHUB_TOKEN` env block. Nothing reordered, no `permissions:` key added, no new secret, no personal token.
* **Both CI jobs preserved — neither replaced.** CI then confirmed the merged result works: `intake ✓` and `evidence ✓` in the same run on this tip, on both events.
* Verifier/tests untouched by the rebase: `git diff f9f1838 HEAD -- scripts/pipeline_smoke.py tests/integration` → **0 lines**, so no assertion, expectation or skip policy was weakened and no obsolete `/reprocess` 404 expectation was reintroduced.
* Branch commits: `b1756fd 8e03d7b 0311dda 5f3fde5 5b53bcc` (replayed WS-D chain) → `a838d2e` (authorized CI change) → this note.

## Environment and exact commands
Python 3.11.2 · embedded PostgreSQL **16.2** (`scripts/agent_pg.py` + on-demand `pgserver`) · real `redis-server` **6.2.14** supplied via `REDIS_SERVER` from a sandbox-only `redislite` wheel (binary never committed; `requirements-dev.txt` untouched) · Node 22.22.3 / npm 10.9.8 · no Docker. CI independently re-ran the same suite on Python 3.12 / `postgres:16` / apt Redis and passed (`evidence` job green on both events).

```bash
bash scripts/setup_local.sh
.venv/bin/pip install pgserver redislite          # sandboxes only; not repo dependencies
.venv/bin/python scripts/agent_pg.py start
eval "$(.venv/bin/python scripts/agent_pg.py env)"
export REDIS_SERVER=$PWD/.venv/lib/python3.11/site-packages/redislite/bin/redis-server

.venv/bin/python scripts/pipeline_smoke.py                                   # exit 0
EVIDENCE_REQUIRE_DEPS=1 .venv/bin/python -m pytest -q -rA -s tests/integration/test_evidence_e2e.py   # 3 passed
.venv/bin/python scripts/pipeline_smoke.py --strict-v1                        # exit 1 (8 gaps)
EVIDENCE_REQUIRE_DEPS=1 bash scripts/verify_all.sh                             # GATE GREEN, 96 passed
env -u REDIS_SERVER PATH="/usr/bin:/bin:/usr/local/bin" .venv/bin/python scripts/pipeline_smoke.py   # exit 2
```

Verifier output tail for the run (both scenarios; the 8 `GAP` blocks are interleaved and unchanged in content):

```text
PASS redis: repeat direct/RQ ingest is idempotent
PASS redis: /reprocess 202, both/single/default stages, completion + repeat safety
PASS redis: all 4 originals byte-equal after processing, patches and unlink
PASS API/worker/Redis processes stopped; only the generated DB schema removed
PASS WS-C evidence index/detail route entrypoints exist (static guard, not a browser walk)
EVIDENCE GREEN (as-shipped): 25 checks; 8 original-v1 gaps; 0 scenarios skipped.
```

Verified flow, in **both** `no-redis:` and `redis:` modes: upload → `GET /sources` list + supported filters → `GET /sources/{id}` detail → original-byte retrieval (`/file`, byte-for-byte, MIME, `attachment; filename=`) → matter link/unlink (duplicate 409, both views, committed rows) → duplicate provenance (`duplicate_of`, independent copy, original untouched) → include/exclude exclusivity + 409 rollback → reprocess.

## Reprocess (WS-EV) — shipped 202 only
`POST /api/v1/sources/{id}/reprocess` must return **202 `{queued, job_id, reason}`**; a missing route, 404 or 500 fails the run (no detection/fallback path exists in the verifier). Checked: both stages, each stage alone, the no-body default; `processing_status`/`ocr_status` → `queued` pre-worker; offline `queued=false` + `job_id=null` + non-empty actionable `reason`; online `queued=true` with a `job_id` proven to be one of the actually queued RQ jobs, every stage job's target/args/status/result checked, both queues drained with zero failed jobs; identity fields, flags, `duplicate_of` and original bytes preserved; repeats idempotent; cross-workspace → 404.

## Recovered `/evidence` and `/evidence/{id}` — three distinct layers (no browser)
1. **Route-shell** — `.next/app-path-routes-manifest.json` lists `/evidence/page → /evidence` and `/evidence/[id]/page → /evidence/[id]`; production server (`npx next start`, loopback only, `API_BASE_URL=http://127.0.0.1:8100`): `GET /` 200, `GET /evidence` **200** (15,960 B, `<h1>Evidence</h1>`, drop-zone markup, nav `href="/evidence"`), `GET /evidence/<uuid>` **200**, `GET /evidence-bogus-route` **404** (negative control: the 200s are not a catch-all). No JS executes in this layer.
2. **API** — (a) the smoke's full contract suite over real HTTP + PostgreSQL + direct/RQ workers, 25 checks × 2 modes; (b) an ad-hoc probe driving every `api.*` method the two pages call, issued **through the web origin** so the request path equals the browser's relative `/api/v1/*` + rewrite proxy: **26/26** (201 upload, all four supported filters, detail/pages/matters, link 201 → unlink 204 → both views empty, include 200 / both-flags **409 with `detail`** / explicit exclude, **reprocess 202 with exactly `{queued, job_id, reason}`**, `/file` byte-equal via web *and* direct API, duplicate provenance). API access log corroborates the sequence.
3. **Browser — NONE.** No browser binary exists in this sandbox (`chromium`, `google-chrome`, `firefox`, `headless_shell` absent; `~/.cache/ms-playwright` empty) and Playwright's CDN is TLS-blocked (`cdn.playwright.dev` → `SSL_ERROR_SYSCALL`), so no hydration, click, drag-drop upload, tab switch, form submit or download click was exercised. **No browser coverage is claimed at any point in this note or the PR.**

Out-of-scope observation for the evidence-UI owner (derived from source + response headers, **not** from a browser run): `apps/web/app/evidence/[id]/page.tsx:92` previews PDFs with `<iframe src={api.sourceFileUrl(id)}>` while `/sources/{id}/file` serves `Content-Disposition: attachment`, so a browser will most likely download rather than render inline. `next lint` also reports the pre-existing `@next/next/no-img-element` warning at `[id]/page.tsx:94:11` (warning, not error). Evidence-UI follow-ups are being handled separately; this session changed no UI code.

## Authorized CI change, and the remaining PR-event failure (cause still unknown — reported, not guessed)
The only workflow edit is `a838d2e` (was `e29e3ad`): a step-scoped addition on the existing gitleaks step, nothing else.

```yaml
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Measured effect, before vs after, on `pull_request` events:

| PR | Token on the step? | `secrets` result | gitleaks annotations published |
|---|---|---|---|
| #11 (merged, WS-C recovery) | no | fail (8 s) | Node-20 notice + `🛑 GITHUB_TOKEN is now required to scan pull requests` |
| #3 (W2-J) | no | fail (9 s) | same two annotations |
| #10 (this chain, pre-fix head) | no | fail (6 s) | same two annotations |
| **#14 (this chain, fixed)** | **yes** | **fail (8 s)** | **only the Node-20 notice — the token-required annotation is gone** |

* So the authorized change removes the documented error class, and `secrets` is **green on `push`** events (`34448822284`, `34446758198`), but the step still fails on `pull_request` events for a **second cause whose message exists only in the job log**.
* **Log capture attempts (all failed from this sandbox, exact errors):** `gh api repos/.../actions/jobs/102779751544/logs` → connection to `productionresultssa17.blob.core.windows.net` ends in `EOF` (twice, retried); `gh run view --job 102779751544 --log-failed` → `https://results-receiver.actions.githubusercontent.com/rest/runs/8329af6e-…/logs?filename=logs_93319713302.zip` → `EOF`, and a direct probe of that host fails with `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL … :443` (TLS reset). Even the CI **artifact** (`evidence-verification`, 2,104 B, listed by the API) cannot be downloaded for the same reason, so the `evidence` job's own console/JUnit proof is available in the Actions UI but not here. gitleaks' release-asset host is likewise TLS-blocked (`release-assets.githubusercontent.com` → `SSL_ERROR_SYSCALL`), so the action could not be reproduced locally. **The integrator must read the job log in the browser UI:** <https://github.com/drivedigital/casevault/actions/runs/34448888151/job/102779751544>.
* What is ruled out: **not a detected secret.** No gitleaks finding/annotation was published, the `push` run over the identical commit range passes, and an independent local scan of every added line in the branch range finds only comments, the `${{ secrets.GITHUB_TOKEN }}` reference itself, and the pre-existing `POSTGRES_PASSWORD: postgres` CI service credential already on `main`.
* Scale/context: `secrets` currently fails on **every** PR in this repository (#1–#14, 6–9 s each, including seven merged PRs). It is a long-standing repo-level CI configuration condition, not a WS-D, W2-J or rebase regression.
* **No permissions broadening applied** — deliberately. `permissions:` additions (or repo default-workflow-permission changes) are the integrator/CI owner's call; `GET /repos/.../actions/permissions` returns 403 for this session's token, so the effective scope of the automatic token cannot even be read from here. I am not inferring a fix from an unreadable setting.

## Verification hygiene and cleanup — confirmed
Synthetic fixtures only (generated TXT, valid two-page PDF with real xref offsets, CRC-valid RGB PNG); one fresh UUID-named PostgreSQL schema per run with `PGOPTIONS=-csearch_path=<schema>` (no `public` fallback) dropped in `finally`; private Redis on a Unix socket only (`--port 0 --save '' --appendonly no`), asserted empty at start and terminated with its whole process group; the offline scenario targets a deliberately nonexistent socket, so a developer/shared Redis is never reachable; storage confined to ignored `data/temp/evidence-smoke-*` (CLI) and pytest's own `tmp_path` — `LOCAL_STORAGE_ROOT` and the app `data/uploads` tree were never used. The UI layers used a separate throwaway database `casevault_ui_wsd` (migrated to `0004`) plus `data/temp/ui-verify/`, with loopback-only API and Next servers.

Post-run audit: `pg_namespace LIKE 'evidence_smoke%'` → **0 rows**; `casevault_ui_wsd` → **0 rows** (dropped); `data/uploads` → **0 files**; `data/temp` → empty; no `uvicorn` / `redis-server` / `next` / `postgres` processes left (embedded harness stopped via `scripts/agent_pg.py stop`); `/tmp/bin` Redis shim removed; working tree clean apart from the intended commits; nothing committed outside the write set; no ignore rule relaxed (`data/` protection intact, `!apps/web/app/evidence/**` from the recovery preserved).

## Contract gaps — original-v1 differences (unchanged on this tip; all 8 still observed)

### Original-v1 issue text — accepted or under-documented as-shipped differences

These are not silently treated as original-v1 conformance. The integrator explicitly superseded v1.0; most are accepted backlog/delta items. Pointer, auto-clear and detail/page shape details need the integrator to make the documentation unambiguous. `--strict-v1` rejects all observed original-v1 gaps; the default run on this tip is green because the separate UI blocker no longer exists (it was reported, and fixed, at the previous tip).

| Code / section | Endpoint | Original v1 expected | Observed | Minimum action / owner |
|---|---|---|---|---|
| `storage-key-layout` §4.2 | `POST /api/v1/sources` → `storage_path` | `uploads/{workspace}/{source}/original{ext}` | `uploads/{workspace}/{YYYY}/{MM}/{uuid}__{filename}` | Already approved delta; retain it (integrator). |
| `duplicate-pointer` §3.1 | `POST /api/v1/sources` → `duplicate_of` | `{id,title}` | `{source_id,title,sha256}`; own file/source retained, original unchanged | Clarify the delta's “same pointer” wording; do not break the shipped client (integrator/WS-A). |
| `binary-ocr-deferred` §5 | pipeline + `GET /api/v1/sources/{id}/pages` | PDF counting/text and optional OCR with engines | `processing=complete`, `ocr=skipped`, `page_count=null`, no pages; persisted `ocr.engine=stub` + nonempty reason | Approved backlog; route actual engine integration to pipeline owner. Test asserts the stub, not a skip or real OCR. |
| `flag-conflict-status` §3.2 | `PATCH /api/v1/sources/{id}` with both flags true | 422 | 409; entire attempted update rolled back | Already approved delta; client must expect 409. |
| `flag-auto-clear` §3.2 | same PATCH, opposite flag already true | 200 and clear opposite flag automatically | 409; callers must explicitly send the opposite flag=false | Clarify delta or schedule service/UI change; WS-D does not fix it (integrator/WS-A). |
| `matter-link-route` §3.2 | `POST/GET /sources/{id}/matter-links` | source-centric route | POST `/matters/{id}/sources`, GET `/sources/{id}/matters`; unlink remains `/source-matter-links/{id}` | Already approved equivalent route shape; round-trip verified. |
| `list-envelope-filters` §3.2 | `GET /api/v1/sources?source_status=primary` | paginated envelope, only primary sources | plain array; unsupported filter ignored, all 4 rows returned despite one primary source | Already approved reduced filters/pagination backlog; supported filters separately verified. |
| `detail-page-shapes` §3.2 | `GET /api/v1/sources/{id}` and `/pages` | detail wrapper/metadata + paginated pages with `layout_json/has_text` | flat SourceOut; page array without those fields | Clarify as-shipped detail/page shapes; future additions through integrator. |

No gap changed at `e36caae` and none is a UI route issue. `--strict-v1` rejects all eight; the default run reports them explicitly instead of claiming original-v1 conformance. The earlier **blocking** issue (missing `/evidence` + `/evidence/{id}` pages, 404 from the production build, ignore-rule tracking hazard) was resolved by the WS-C recovery integrated as `5da141c`.

## Risks / follow-ups
1. **CI owner / integrator:** the `secrets` job on `pull_request` events — cause unconfirmed because the job log is unreachable from this sandbox; the minimal next step is reading that log and then deciding on workflow permissions. Do **not** merge on the assumption that the token line alone was insufficient-but-understood: it fixed one documented error class and left one unknown.
2. **Integrator:** PR #14 is the successor to #10 for the WS-D artifacts (same content, rebased, plus the CI line and both jobs). PR #10 remains draft and now links forward.
3. **Version sensitivity:** this note tests `e36caae` only. The newly open **PR #13** ("Fix proposal generation in normal RQ workers without PYTHONPATH", the escalated worker import defect) is **not** included here; re-run both commands after it lands — the smoke spawns real `workers.*` subprocesses, so a worker-import regression would surface as an `evidence` job failure, not a silent pass.
4. **Evidence UI owner:** browser-level verification of `/evidence` and `/evidence/{id}` plus the iframe/`Content-Disposition` observation. Not performed and not claimed here.
5. W2-J's `intake` job coexists cleanly (verified in CI on this branch). No shared state: distinct `POSTGRES_DB` per job; the intake tests emit their own `TEST_DATABASE_URL == DATABASE_URL` advisory warning under `INTAKE_ALLOW_APP_DB`, which is theirs, not an evidence-side failure.

## History — earlier tips (kept for the record)
* `e62daae` (pre-recovery): 24 API/DB/worker checks green in both Redis modes; the only failure was the fatal route guard — `/evidence` and `/evidence/{id}` absent from the tree and the production route manifest (HTTP 404 vs control `GET /` 200), with `.gitignore:13 evidence/` matching both page paths; full gate **1 failed, 36 passed**.
* `78cc8d5` (post-recovery): first green re-run — 25 checks, 8 gaps, gate **37 passed, 0 skipped**, both evidence routes in the manifest, production probe 200/200/404; CI `secrets` fixed on push events and still red on PR events.
* `e36caae` (this record): all of the above re-confirmed together with W2-J's intake suite (gate 96 passed), and the `ci.yml` append-point conflict actually resolved with both jobs preserved.

## What the next agent must know
* Do **not** restore any `/reprocess` 404 expectation, and do not "fix" the `secrets` PR-event failure by adding permissions from inside WS-D — report the log content once readable.
* The verifier must keep failing closed: `EVIDENCE_REQUIRE_DEPS=1` in CI turns a missing Redis/storage prerequisite into a failure; only that pair of prerequisites may ever skip, and never in the `evidence` job.
* `ci.yml` is a shared file (WS-D `evidence`, W2-J `intake`, and now this step-scoped env block all touch the same tail region). Rebase with the mechanical equality checks recorded above rather than regenerating the file.
* Session branch stays `arena/01a08a04-casevault`; PR #14 targets `arena/01a0899f-casevault`; product code is not this workstream's to change.

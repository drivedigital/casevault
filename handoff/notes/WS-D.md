# WS-D — Sprint 3 evidence verification and CI
Contract: `docs/contracts/sprint3_evidence.md` v1.0 with its 2026-09-10 **as-shipped override**, plus merged `docs/contracts/wave2_intake_core.md` v1.0 §6 (reprocess).

## Status on the recovered tip — VERIFIED GREEN (evidence flow), with one CI blocker left for the integrator

**Tested integration tip: `78cc8d5660e75354fc616572e2e9a52aee305d78`** (`arena/01a0899f-casevault`, which integrates the Evidence UI recovery `5da141c`). No newer integration tip existed at run time.

| What | Result |
|---|---|
| `scripts/pipeline_smoke.py` (with **and** without Redis, same run) | **GREEN — 25 checks, 8 original-v1 GAPs, 0 scenarios skipped**, exit 0 |
| `pytest tests/integration/test_evidence_e2e.py` with `EVIDENCE_REQUIRE_DEPS=1` | **3 passed, 0 skipped**, exit 0 |
| WS-C route-entrypoint guard (`/evidence`, `/evidence/{id}`) | **PASS** (was the only failure at `e62daae`) |
| `POST /sources/{id}/reprocess` | **202 required and returned in both Redis modes**; no 404 fallback exists anywhere |
| Full gate `bash scripts/verify_all.sh` | **GATE GREEN** — migrations up/down/up, `37 passed, 0 skipped`, ruff clean, web lint/typecheck/build (17 routes, both evidence routes present) |
| Recovered routes — route-shell (production server) | `GET /evidence` **200**, `GET /evidence/{uuid}` **200**, control `/evidence-bogus-route` **404** |
| Recovered routes — browser interaction | **not performed; no browser exists in this sandbox** (see “Verification levels”) |
| CI gitleaks token change | Fixes the documented error; `secrets` **passes on push events**, still **fails on pull_request events** — exact remaining failure reported below |

**Final branch SHA (this session):** `arena/01a08a04-casevault`. Rebased chain + CI change are recorded at the bottom; the note is the last commit, so read `git log -1 --format=%H arena/01a08a04-casevault` on the remote for the tip.

## Rebase / preservation
`arena/01a08a04-casevault` was already **exactly** the integration tip (`78cc8d5`) with a clean tree, so there was no divergent local work to preserve in this session's branch; the WS-D deliverable lived on the PR #10 head branch `arena/01a089cf-casevault` (`de18118`, based on the superseded tip `e62daae`, which is **not** an ancestor of the new tip — the integration branch is a squashed import).

The work was therefore preserved by replaying it onto the new tip on the assigned Arena branch (no other branch created, switched to, or pushed):

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git cherry-pick e62daae..de18118        # 5 commits: f7f3a01 8026909 043ad35 1d2a144 de18118
```

* Zero conflicts (the only integration-side files overlapping the write-set path `apps/web/app/evidence/**` are the recovered pages themselves, which WS-D never edited).
* **Nothing was weakened during the rebase:** `git diff a64e253 origin/arena/01a089cf-casevault -- scripts/pipeline_smoke.py tests/integration` → **0 lines** (byte-identical verifier and tests). The obsolete `/reprocess` 404 expectation does not exist in this chain; 404 is a hard failure.
* Rebased commits: `7867170 → 97099b9 → 36413db → 95ce13a → a64e253`, then the authorized CI commit `e29e3ad`.

## What changed
- `scripts/pipeline_smoke.py`: real HTTP/Uvicorn, independently queried PostgreSQL rows, actual direct/RQ stage jobs, private online/offline Redis; valid synthetic TXT/two-page PDF/PNG; hashes, pages, duplicates, lifecycle rollback, links, scoping and download byte equality; fatal WS-C route-entrypoint guard; strict-original-v1 mode.
- `tests/integration/test_evidence_e2e.py`: same flow plus fixture-structure and strict-policy tests. No API fixture overrides, `create_all`, mocked DB/storage/queue or xfails. Only absent Redis binary/unavailable scratch storage may explicitly skip; `EVIDENCE_REQUIRE_DEPS=1` turns those into failures.
- `tests/integration/__init__.py`, `tests/integration/README.md`: package marker + prerequisites/isolation/skip policy.
- `.github/workflows/ci.yml`: **append-only** WS-D `evidence` job (unchanged), **plus the explicitly authorized CI change** on this branch — `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the existing gitleaks step (see below).
- No product file, migration, dependency manifest or ignore rule changed. The `.gitignore` `!apps/web/app/evidence/**` re-inclusion came from the integrator's recovery, is preserved here, and was re-verified (`git ls-files apps/web/app/evidence` → both pages tracked; `git check-ignore` on a real-evidence path still ignores it).

## Environment and exact commands
Python 3.11.2, embedded PostgreSQL **16.2** (`scripts/agent_pg.py`, `pgserver` installed on demand — not a product dependency), real `redis-server` **6.2.14** supplied via `REDIS_SERVER` from a sandbox-only `redislite` wheel (binary never committed; `requirements-dev.txt` untouched), Node 22.22.3 / npm 10.9.8, Ubuntu sandbox, no Docker. CI declares Python 3.12 / `postgres:16` and installs apt `redis-server` (a different, real Redis — the CI `evidence` job passed there too).

```bash
bash scripts/setup_local.sh                      # venv + requirements-dev.txt + npm install
.venv/bin/pip install pgserver redislite          # sandbox harnesses only (not repo dependencies)
.venv/bin/python scripts/agent_pg.py start
eval "$(.venv/bin/python scripts/agent_pg.py env)"
export REDIS_SERVER=$PWD/.venv/lib/python3.11/site-packages/redislite/bin/redis-server

.venv/bin/python scripts/pipeline_smoke.py                          # -> exit 0, EVIDENCE GREEN
.venv/bin/python -m pytest -q -rA -s tests/integration/test_evidence_e2e.py   # EVIDENCE_REQUIRE_DEPS=1 -> 3 passed
.venv/bin/python scripts/pipeline_smoke.py --strict-v1              # -> exit 1, "8 observed contract gaps"
EVIDENCE_REQUIRE_DEPS=1 bash scripts/verify_all.sh                   # -> GATE GREEN
```

`pipeline_smoke.py` output (full run, both Redis modes; PASS/GAP interleaving omitted for brevity — 25 PASS lines, 8 GAP blocks):

```text
Synthetic artifacts and diagnostic logs: /home/user/casevault/data/temp/evidence-smoke-9vna1kyl
Evidence smoke: as-shipped contract; synthetic fixtures; original-v1 GAPs are explicit.
PASS PostgreSQL 16.2; migrations through 0004 in a disposable schema
PASS no-redis: HTTP bootstrap + isolated workspace
PASS no-redis: valid TXT/PDF/PNG upload, SQL rows, sha256, size, storage bytes
PASS no-redis: duplicate warning + independent copy; original unchanged
PASS no-redis: real worker completion; exact text page; explicit PDF/image stub reasons
PASS no-redis: include/exclude exclusivity, explicit transitions, rollback
PASS no-redis: matter link/unlink, duplicate 409, both views + committed rows
PASS no-redis: list + supported type/review/title/matter filters
PASS no-redis: wrong-workspace detail/file/pages/patch/reprocess return 404
PASS no-redis: repeat direct/RQ ingest is idempotent
PASS no-redis: /reprocess 202, both/single/default stages, completion + repeat safety
PASS no-redis: all 4 originals byte-equal after processing, patches and unlink
PASS redis:  <the same 11 scenario checks, all passing>
PASS API/worker/Redis processes stopped; only the generated DB schema removed
PASS WS-C evidence index/detail route entrypoints exist (static guard, not a browser walk)
EVIDENCE GREEN (as-shipped): 25 checks; 8 original-v1 gaps; 0 scenarios skipped.
```

Requested flow, as covered by that run (each item asserted in **both** no-Redis and real-Redis mode): upload → `GET /sources` list + supported filters → `GET /sources/{id}` detail → original-byte retrieval (`/file`, byte-for-byte + MIME + `attachment; filename=`) → matter link/unlink (+ duplicate-link 409, both views, committed rows) → duplicate provenance (`duplicate_of` pointer, independent copy, original untouched) → include/exclude exclusivity, explicit transitions, 409 rollback → reprocess (see next section).

## Reprocess (WS-EV) — shipped 202 only
`POST /api/v1/sources/{id}/reprocess` must return **202 `{queued, job_id, reason}`**; a missing route, 404 or 500 fails the run. Verified: both stages, each single stage, and the no-body default; `processing_status`/`ocr_status` go to `queued` before the worker; offline (`no-redis`) → `queued=false`, `job_id=null`, non-empty actionable `reason`; online (`redis`) → `queued=true` with a real `job_id` that is proven to be one of the actually queued RQ jobs, every stage job's target/args/status checked, worker drains, queues drained with 0 failed jobs; status, title, flags, `duplicate_of` and original bytes preserved; repeats stay idempotent; cross-workspace reprocess → 404.

## Recovered `/evidence` and `/evidence/{id}` — three separate verification levels
1. **Route-shell (build + HTTP, no JS execution).** Production route manifest lists `/evidence/page → /evidence` (static) and `/evidence/[id]/page → /evidence/[id]` (dynamic), 19 route entries in `.next/app-path-routes-manifest.json`. `npx next start` (127.0.0.1:3100, `API_BASE_URL=http://127.0.0.1:8100`): `GET /` 200, `GET /evidence` **200** (15,960 B, `<h1>Evidence</h1>`, upload/drop-zone markup, nav `href="/evidence"`), `GET /evidence/<uuid>` **200** (11,882 B), `GET /evidence/not-a-uuid` 200 (client-side id), and negative control `GET /evidence-bogus-route` **404** — so the 200s are not a catch-all. Both route chunks exist on disk (index 24,355 B; detail 12,459 B) and contain the recovered UI's own strings (`Reprocess`, `Duplicate of`, `Review status`, `Link to matter`, `OCR text`). This confirms the missing-route regression from `e62daae`/`c7842bb` (404) is closed.
2. **API parity for exactly the calls those pages make** (ad-hoc probe, run through the **web origin** so the path equals the browser's relative `/api/v1/*` + rewrite proxy; not committed, no CI dependency): **26 checks, 0 failures** — `listMatters`, `uploadSource` (multipart, 201), `listSources` incl. all four supported filters, `getSource`, `listSourcePages`, `listSourceMatters`, `linkSourceToMatter`, `deleteSourceMatterLink`, `updateSource` (include 200 / both-flags 409 with `detail` / explicit exclude), `reprocessSource` (**202** with exactly `{queued, job_id, reason}`, offline shape `false/null/<reason>`), `sourceFileUrl` bytes equal via web **and** direct API, duplicate provenance. API access log corroborates the sequence (201/409/202/200).
3. **Browser interaction: NONE performed.** This sandbox has no browser binary and Playwright's CDN is unreachable (`cdn.playwright.dev` → TLS blocked), so no hydration, click, drag-drop upload, tab switch, form submit or download click was exercised, and no browser-level claim is made anywhere above.

**For the evidence UI owner (not a WS-D fix, out of this scope):** the recovered detail page previews PDFs with `<iframe src={api.sourceFileUrl(id)}>` (`apps/web/app/evidence/[id]/page.tsx:92`) while the shipped `/sources/{id}/file` route responds `Content-Disposition: attachment; filename="…"` (asserted here). A browser will therefore most likely *download* instead of rendering the PDF inline. Derived from source + response headers, **not** from a browser run — needs a real browser pass by whoever owns the UI follow-up.

## Authorized CI change and its exact remaining failure
`.github/workflows/ci.yml`, one step-scoped addition and nothing else (no job/env reordering, no new secret, no personal token, no `permissions:` key added, other jobs byte-unchanged — verified by `git show e29e3ad -- .github/workflows/ci.yml` and a YAML parse):

```yaml
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Results (same head SHA `e29e3ad`, two events):

| Event | Run | python | web | secrets | evidence |
|---|---|---|---|---|---|
| `push` (branch) | [34446758198](https://github.com/drivedigital/casevault/actions/runs/34446758198) | pass | pass | **pass** | pass |
| `pull_request` (#12, temp) | [34446922313](https://github.com/drivedigital/casevault/actions/runs/34446922313) | pass | pass | **fail (9 s)** | pass |

* **What the change did fix:** the previous PR-only failure annotation — `🛑 GITHUB_TOKEN is now required to scan pull requests` — is **gone** on the fixed run. It was still present on PR #10's pre-fix run (job [102764063599](https://github.com/drivedigital/casevault/actions/runs/34443782779/job/102764063599)) and is still present on W2-J's PR #3 run, which has no token (job [102772513695](https://github.com/drivedigital/casevault/actions/runs/34446562106/job/102772513695)) → the same authorized line will clear that half for WS-J too.
* **What remains, exactly:** on `pull_request` events the step `Run gitleaks/gitleaks-action@v2` still exits non-zero after ~9 s (job [102773623697](https://github.com/drivedigital/casevault/actions/runs/34446922313/job/102773623697), only failing step). Its annotations list contains **only** the Node-20 deprecation notice — no gitleaks finding was published — and the push run over the identical commit range passed, so this is **not** a detected secret. Independent local scan of the same range: 1,236 added lines, 7 pattern matches (all comments/`${{ secrets.GITHUB_TOKEN }}`/the pre-existing `POSTGRES_PASSWORD: postgres` CI service credential), 1 high-entropy string (`REDIS_SERVER=/absolute/path/to/redis-server`, documentation text).
* **Log limitation:** the step's stderr cannot be retrieved from this sandbox — Actions log download fails with `EOF` against `results-receiver.actions.githubusercontent.com` / `productionresultssa*.blob.core.windows.net` (both `gh run view --log` and the jobs-logs API), and the release-asset host for gitleaks is TLS-blocked, so a local reproduction of the action was not possible either. The integrator must read the tail of the job above.
* **Most probable next cause (hypothesis, deliberately not applied here):** gitleaks-action v2 also needs the token to read PR metadata and write check output; the workflow has no `permissions:` key, so the automatic token inherits the repository default (not readable with this credential: `GET /repos/.../actions/permissions` → 403). The narrow fix would be a job-scoped `permissions: {contents: read, pull-requests: write}` on the `secrets` job — that is a permissions change, explicitly outside this assignment. **Reporting, not fixing.**
* Consequence for merges: `python`, `web` and `evidence` are green on both events; **the full GitHub check set on PR #10 cannot be called all-green** until the integrator lands that permissions decision (or equivalent).

## W2-J / shared-workflow coordination
Both branches append to the same anchor — the end of `jobs:` right after `- uses: gitleaks/gitleaks-action@v2`:
* W2-J (`arena/01a089cd-casevault`, PR #3) adds a `intake` job (+40 lines, no context lines changed).
* WS-D adds an `evidence` job (+54 lines), and this session adds a 5-line `env:` block **on** the gitleaks step that is the last context line of both diffs.

→ **Guaranteed textual conflict** on `pull_request`/merge of #10 (or #12-style rebases) against #3 in `.github/workflows/ci.yml`. Nothing was replaced or reordered here; both jobs are self-contained appends, so the merge is order-independent. Suggested integrator resolution: keep the gitleaks `env:` block, then `evidence:`, then `intake:` (or the reverse job order) — no key collision exists between the two jobs (distinct `POSTGRES_DB`: `casevault_evidence_ci` vs `casevault_ci`; W2-J's job does not set `EVIDENCE_REQUIRE_DEPS`/Redis). Also note W2-J's `intake` job is currently red for the *same* gitleaks reason; my one-line change resolves that too once landed, and its `intake` failure (job 102772513670) is theirs to diagnose.

## Fail-closed / negative controls (re-run on this tip)
* Redis binary absent → `pipeline_smoke.py` exits **2** with `EVIDENCE BLOCKED: redis-server binary absent…`; pytest with `EVIDENCE_REQUIRE_DEPS=1` **fails** (exit 1: `1 failed, 2 passed`); pytest without the flag skips **with the explicit reason** (`2 passed, 1 skipped`). Skipping can never silently green the CI job.
* `--strict-v1` still finishes both scenarios and then exits **1**: `original Sprint 3 v1.0 has 8 observed contract gaps`.
* Missing/unreachable database, migration errors, bad HTTP statuses and worker assertions all **fail** (never skip); the fixture/policy unit tests pass standalone (`test_synthetic_fixtures_are_real_file_structures`, `test_original_contract_gate_fails_closed`).
* The no-Redis API log shows the intended degradation only (`ingest/ocr enqueue skipped … No such file or directory`), and the run asserts that path (`queued=false`, `job_id=null`, non-empty reason) instead of tolerating it silently.

## Verification hygiene and cleanup — confirmed
Synthetic fixtures only (generated TXT / valid two-page PDF / CRC-valid PNG); a fresh UUID-named schema per run with `PGOPTIONS=-csearch_path=<schema>` (no `public` fallback), dropped in `finally`; private Redis on a Unix socket (`--port 0 --save '' --appendonly no`) started empty (`dbsize 0` asserted) and terminated with its process group; the offline scenario targets a deliberately nonexistent socket; scratch storage under ignored `data/temp/evidence-smoke-*` (CLI) and pytest's own `tmp_path` — `LOCAL_STORAGE_ROOT` and the app `data/` tree were never used. UI/API-parity checks used a separate throwaway database `casevault_ui_wsd` (migrated to `0004`, dropped afterwards) plus `data/temp/ui-verify/` scratch storage; the API and Next servers were bound to loopback only and stopped.

Afterwards: `pg_namespace LIKE 'evidence_smoke%'` → **0 rows**; `casevault_ui_wsd` → **0 rows**; `data/uploads` → **0 files**; `data/temp` → empty; no `uvicorn`/`redis-server`/`next`/`postgres` processes left (embedded harness stopped via `scripts/agent_pg.py stop`); `git status` clean apart from the two intended commits; nothing written outside the workspace, no ignore rule relaxed, no artifact committed (only console/JUnit-style text is quoted here).

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

No gap changed at `78cc8d5`, and none of them is a UI route issue. `--strict-v1` still rejects all eight; the default run reports them explicitly instead of claiming original-v1 conformance. The previous tip's **blocking** issue (missing `/evidence` + `/evidence/{id}` pages, 404 from the production build, ignore-rule tracking hazard) is resolved by the WS-C recovery integrated as `5da141c`; see the History section.

## Risks / follow-ups
* **Integrator, CI:** the `secrets` job on `pull_request` events (one job-scoped `permissions:` decision) — nothing else in this PR blocks it. Until then, "all GitHub checks green" is not claimable for #10.
* **Evidence UI owner:** real browser pass for `/evidence` + `/evidence/{id}` (upload, filters, detail tabs, link/unlink, include/exclude, reprocess) — not available in this sandbox; plus the iframe/`Content-Disposition` observation above. These follow-ups are explicitly outside WS-D and were not fixed here.
* **This is verification of `78cc8d5` only.** Evidence UI follow-ups land separately; re-run both commands if the tip changes. The `next build` lint warning at `./app/evidence/[id]/page.tsx:94` (`@next/next/no-img-element`) is pre-existing in the recovered UI and is a warning, not an error.
* No product bug was masked or fixed: no assertion, expectation, fixture or skip policy changed relative to `de18118` (proven by the 0-line diff above).

## History — previous tip `e62daae` (kept for the record)
At that tip the same verifier reported **24 passing API/DB/worker checks in both Redis modes** and failed only on the fatal route guard (`§6 / §7 WS-C: expected Next page entrypoints for /evidence, /evidence/{id}`), with the full gate at **1 failed, 36 passed**; the production probe returned 404 for both evidence URLs while `GET /` was 200, and `.gitignore:13 evidence/` matched both page paths (tracking hazard). Recovery (`5da141c` + `!apps/web/app/evidence/**`) resolves all of that; every item above is the re-run on the recovered tip.

## What the next agent must know
* PR #10 (`arena/01a089cf-casevault` @ `de18118`) remains the **sole WS-D merge candidate**; its head still needs the same replay onto `78cc8d5` (this branch already carries it — `git log --oneline -6 arena/01a08a04-casevault` — and is a valid source for the integrator to fast-forward #10 from, along with the CI commit `e29e3ad`).
* Do **not** restore any `/reprocess` 404 expectation, and do not "fix" the remaining gitleaks PR-event failure inside WS-D — it is an integrator/CI-owner permissions decision.
* Product-code changes belong to their owning workstreams; this assignment changed none.

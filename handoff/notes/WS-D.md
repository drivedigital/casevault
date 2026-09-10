# WS-D — Sprint 3 evidence verification and CI
Contract: `docs/contracts/sprint3_evidence.md` v1.0 with its 2026-09-10 **as-shipped override**, plus merged `docs/contracts/wave2_intake_core.md` v1.0 §6 (reprocess).

## What changed
- `scripts/pipeline_smoke.py`: real HTTP/Uvicorn, independently queried PostgreSQL rows, actual direct/RQ stage jobs, private online/offline Redis; valid synthetic TXT/two-page PDF/PNG; hashes, pages, duplicates, lifecycle rollback, links, scoping and download byte equality; fatal WS-C route-entrypoint guard; strict-original-v1 mode.
- `tests/integration/test_evidence_e2e.py`: same flow plus fixture-structure and strict-policy tests. No API fixture overrides, `create_all`, mocked DB/storage/queue or xfails. Only absent Redis binary/unavailable scratch storage may explicitly skip; CI turns those into failures.
- `tests/integration/README.md`: prerequisites, isolation, failure/skip policy and exact scope.
- `.github/workflows/ci.yml`: **append only** `evidence` job; PostgreSQL 16 migrations; install Redis; run pytest with `EVIDENCE_REQUIRE_DEPS=1`; publish console/JUnit proof only, never uploaded files.
- This note is the explicitly required handoff exception to the code write set. No product files, migration, dependency manifest, ignore rule or existing CI job changed.
- Session: `arena/01a089cf-casevault`. Started/reset clean at `adcb1b8`; rebased without conflicts onto `c7842bb` (WS-EV) and then `e62daae0271bbaf6978b7dcdb3635823178e7082` (current integration tip at proof time). Executable proof revision: `802690938c2a5cb4e963e45214dba812237f48bb`.

## Proof
**Status: BLOCKED, not a conformance sign-off.** Both API/worker scenarios pass all 24 reported checks; the new UI guard correctly fails. Full gate: **1 failed, 36 passed, 0 skipped**; the failure is the missing evidence pages. Do not remove/xfail the assertion to manufacture a green gate.

Environment: Python 3.11, embedded PostgreSQL 16.2, private Redis 7.2.6. CI declares Python 3.12 / `postgres:16`. Mandatory `bash scripts/setup_local.sh`, on-demand `pip install pgserver`, and `python scripts/agent_pg.py start` ran. Apt repositories were inaccessible in this sandbox, so Redis was built from its official GitHub 7.2.6 tag entirely under ignored `data/temp/redis-build/` (no dependency manifests changed):

```bash
source .venv/bin/activate
mkdir -p data/temp/redis-build
curl -fL https://github.com/redis/redis/archive/refs/tags/7.2.6.tar.gz -o data/temp/redis-build/redis.tar.gz
tar -xzf data/temp/redis-build/redis.tar.gz -C data/temp/redis-build
make -C data/temp/redis-build/redis-7.2.6 -j2 redis-server MALLOC=libc BUILD_TLS=no REDIS_CFLAGS= REDIS_LDFLAGS=
export REDIS_SERVER="$PWD/data/temp/redis-build/redis-7.2.6/src/redis-server"
eval "$(python scripts/agent_pg.py env)"
python scripts/pipeline_smoke.py
```

```text
Synthetic artifacts and diagnostic logs: /home/user/casevault/data/temp/evidence-smoke-wcs90_7n
Evidence smoke: as-shipped contract; synthetic fixtures; original-v1 GAPs are explicit.
PASS PostgreSQL 16.2; migrations through 0004 in a disposable schema
PASS no-redis: HTTP bootstrap + isolated workspace
GAP storage-key-layout [§4.2] POST /sources -> storage_path
    original v1 expected: uploads/{workspace_id}/{source_id}/original{ext}
    observed: uploads/{workspace_id}/{YYYY}/{MM}/{uuid}__{filename} (approved override)
PASS no-redis: valid TXT/PDF/PNG upload, SQL rows, sha256, size, storage bytes
GAP duplicate-pointer [§3.1] POST /sources -> duplicate_of
    original v1 expected: {id, title}
    observed: {source_id, title, sha256}; distinct provenance and original preserved
PASS no-redis: duplicate warning + independent copy; original unchanged
GAP binary-ocr-deferred [§5] GET /sources/{id}/pages + pipeline (PDF/image)
    original v1 expected: PDF page count/extraction and optional OCR when engines are installed
    observed: processing=complete, ocr=skipped, page_count=null, no pages; persisted stub reason
PASS no-redis: real worker completion; exact text page; explicit PDF/image stub reasons
GAP flag-conflict-status [§3.2] PATCH /sources/{id} (both flags true)
    original v1 expected: 422 validation error
    observed: 409 constraint error (approved as-shipped override)
GAP flag-auto-clear [§3.2] PATCH /sources/{id} (opposite flag already true)
    original v1 expected: 200; setting one true automatically clears the other
    observed: 409; caller must explicitly send the opposite flag=false
PASS no-redis: include/exclude exclusivity, explicit transitions, rollback
GAP matter-link-route [§3.2] POST/GET /sources/{id}/matter-links
    original v1 expected: source-centric /matter-links routes
    observed: shipped POST /matters/{id}/sources + GET /sources/{id}/matters; same link semantics
PASS no-redis: matter link/unlink, duplicate 409, both views + committed rows
GAP list-envelope-filters [§3.2] GET /sources?source_status=primary
    original v1 expected: {items,total,limit,offset}; only primary sources
    observed: plain array; source_status ignored (all 4 rows), documented reduced filter set
GAP detail-page-shapes [§3.2] GET /sources/{id} and /sources/{id}/pages
    original v1 expected: SourceDetailOut wrapper + paginated pages including layout_json/has_text
    observed: flat SourceOut + page array; no detail metadata envelope or layout_json/has_text
PASS no-redis: list + supported type/review/title/matter filters
PASS no-redis: wrong-workspace detail/file/pages/patch/reprocess return 404
PASS no-redis: repeat direct/RQ ingest is idempotent
PASS no-redis: /reprocess 202, both/single/default stages, completion + repeat safety
PASS no-redis: all 4 originals byte-equal after processing, patches and unlink
PASS redis: HTTP bootstrap + isolated workspace
PASS redis: valid TXT/PDF/PNG upload, SQL rows, sha256, size, storage bytes
PASS redis: duplicate warning + independent copy; original unchanged
PASS redis: real worker completion; exact text page; explicit PDF/image stub reasons
PASS redis: include/exclude exclusivity, explicit transitions, rollback
PASS redis: matter link/unlink, duplicate 409, both views + committed rows
PASS redis: list + supported type/review/title/matter filters
PASS redis: wrong-workspace detail/file/pages/patch/reprocess return 404
PASS redis: repeat direct/RQ ingest is idempotent
PASS redis: /reprocess 202, both/single/default stages, completion + repeat safety
PASS redis: all 4 originals byte-equal after processing, patches and unlink
PASS API/worker/Redis processes stopped; only the generated DB schema removed
EVIDENCE FAILED: §6 / §7 WS-C: expected Next page entrypoints for /evidence, /evidence/{id}; observed missing apps/web/app/evidence pages. Owning UI workstream must restore them.
```

Full gate (unset pre-exported URLs to force the harness's **fresh** embedded test-database path; exported `REDIS_SERVER` retained):

```bash
export EVIDENCE_REQUIRE_DEPS=1
unset DATABASE_URL TEST_DATABASE_URL
bash scripts/verify_all.sh
```

Observed excerpt (full output is included in the PR; local log `data/logs/ws-d-gate-final.log`):

```text
==> Database
    fresh casevault_test created
==> Migrations (upgrade head -> downgrade base -> upgrade head)
0001 -> 0002 -> 0003 -> 0004
0004 -> 0003 -> 0002 -> 0001 -> base
base -> 0001 -> 0002 -> 0003 -> 0004
==> pytest (real Postgres)
FAILED tests/integration/test_evidence_e2e.py::test_evidence_e2e
SmokeFailure: §6 / §7 WS-C: expected Next page entrypoints for /evidence, /evidence/{id}; observed missing apps/web/app/evidence pages. Owning UI workstream must restore them.
1 failed, 36 passed, 2 warnings in 17.49s
```

The gate stops at pytest as designed. Ran the remaining commands separately on the same tip:

```text
python -m ruff check apps workers scripts tests
All checks passed!
npm run lint --workspace=web
✔ No ESLint warnings or errors
npm run typecheck --workspace=web
exit 0
npm run build --workspace=web
✓ Compiled successfully
✓ Generating static pages (16/16)
exit 0; /ledger present, neither evidence route in route manifest
```

Independent production Next HTTP probe (initial `c7842bb` build; missing entrypoints reconfirmed at `e62daae`; server stopped afterwards):

```text
GET /: expected 200; observed 200
GET /evidence: expected 200; observed 404
GET /evidence/00000000-0000-4000-8000-000000000001: expected 200; observed 404
Traceback (most recent call last):
  File "<stdin>", line 10, in <module>
AssertionError: §6 GET /evidence: expected 200; observed 404
§6 GET /evidence/00000000-0000-4000-8000-000000000001: expected 200; observed 404
```

Fail-closed checks also executed (ignored logs `data/logs/ws-d-*.log`):
- Before the new UI guard, `--strict-v1` finished both scenarios and exited **1** with `8 observed contract gaps`. Unit policy assertion still covers this after adding the fatal UI guard.
- Missing Redis binary: CLI **2**; ordinary pytest **1 skipped with explicit reason**; `EVIDENCE_REQUIRE_DEPS=1` pytest **1 failed**, exit **1**.
- Missing database: CLI **1**; pytest **1 failed**, exit **1**, never skipped even without the CI flag.
- Fixture validity / policy unit tests: **2 passed**.
- After failed contract runs: zero `evidence_smoke_%` schemas; no Uvicorn/RQ/Redis/Next processes remained. Only the generated schema is dropped; app/test public schemas are not truncated by this verifier.
- YAML parsed; CI content byte-prefix check confirms all pre-existing jobs are unchanged; `git diff --check` passes. Only `data/README.md` is tracked under `data/`.

## Contract gaps
### Blocking issue text — WS-C: missing evidence index and viewer

- **Contract:** Sprint 3 §6 / §7 and the as-shipped delta's “Web routes: same” row.
- **Endpoints:** `GET /evidence`, `GET /evidence/{id}`.
- **Expected:** index/upload page and source viewer exist and serve 200 from the built app.
- **Observed:** both return **404**; control `GET /` returns 200. Neither page exists in the checkout or production route manifest. The API and TypeScript client helpers exist, but the pages do not.
- **Failing assertion:** `§6 GET /evidence: expected 200; observed 404` (also the UUID detail URL). The new smoke guard fails with `§6 / §7 WS-C: expected Next page entrypoints for /evidence, /evidence/{id}; observed missing apps/web/app/evidence pages`.
- **Additional evidence:** `git check-ignore -v apps/web/app/evidence/page.tsx` and the `[id]` page both match `.gitignore:13:evidence/`. This is a confirmed tracking hazard, not proof of how the pages were lost.
- **Minimum change / owner:** integrator routes restoration/tracking of both Next pages and their dependencies to the evidence UI owner (WS-C/original author). Preserve the real-evidence ignore protections; do not broadly remove them. WS-D has not edited UI or ignore rules. Re-run both proof commands after that patch merges. **Do not merge this verification branch as green before resolving this blocker.**

### Original-v1 issue text — accepted or under-documented as-shipped differences

These are not silently treated as original-v1 conformance. The integrator explicitly superseded v1.0; most are accepted backlog/delta items. Pointer, auto-clear and detail/page shape details need the integrator to make the documentation unambiguous. `--strict-v1` rejects all observed original-v1 gaps; the default also fails on the genuine UI blocker above.

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

The initial `adcb1b8` run also observed `/reprocess` = 404. That is **resolved on this proof tip** by merged WS-EV (`c7842bb`); the final test requires 202 in both modes and contains no missing-route fallback. Stage-specific status/queue semantics follow the additive Wave 2 §6 brief.

## Risks / follow-ups
- **Integrator + evidence UI owner:** fix the blocker first; then rebase/re-run both commands, review the eight original-v1 differences, and only then mark this PR ready. The branch intentionally has a red regression test while the product route is absent.
- CI hub ownership: Wave 2 assigns it to WS-J; coordinate this one additive job with WS-J. Existing jobs were not restructured.
- Old WS-D instructions said tests should use `data/`; newer binding policy §4.3 says scratch storage. CLI uses a fresh ignored `data/temp/` subtree; pytest uses its own isolated scratch root, matching the current policy. Only synthetic content is generated.
- New npm install reported existing **4 high / 1 critical** dependency vulnerabilities; existing Python tests emitted two upstream deprecation warnings. No dependency changes made. Integrator should route dependency remediation separately.
- Static route guard is not browser-interaction coverage. Real PDF/image OCR is still an explicit product stub, not verified OCR output. No real evidence or external AI provider is used.

## What the next agent must know
- This completes the requested verification implementation, **not** a green Sprint 3 sign-off. Do not fix product bugs in this branch or weaken the failing UI assertion.
- `/reprocess` is now mandatory and really runs with/without Redis: both/single/default stages, committed statuses, all queued jobs/results, safe repeats and original bytes preserved. Offline OCR-only calls `ocr_source` directly; the generic `process_source` runner would incorrectly no-op on a complete source.
- Each smoke run applies real migrations in its own UUID schema with no `public` search-path fallback, then cleans up API/workers/Redis/schema even on failure. It does not require a prestarted API or Redis and never consumes shared queues.
- PR must target `arena/01a0899f-casevault`, not main. Session branch remains `arena/01a089cf-casevault`; integrator merges only after owning workstreams resolve the blocker and new proof is green.

# WS-CLAIMS — Wave 3 handoff note

**Workstream:** Legal Claims Matrix & Burden-of-Proof Mapping
**Delivered on:** `arena/01a100f2-casevault` @ repo root `/home/user/casevault` (2026-10-03)
**Planned on:** worktree `../casevault-claims`, branch `feat/claims-matrix`, integrate into `arena/01a0899f-casevault` — **neither existed in this environment** (see Deviations).

---

## 1. What was delivered

### API (`apps/api`)
| File | Purpose |
|---|---|
| `app/routers/claims.py` | Claims router (write-set ✓). Endpoints mirror Tech Spec §9.2 plus matrix/candidate additions (below). |
| `app/services/claim_burden.py` | Burden-of-proof engine: element assessment, claim rollup, warnings/explanations, highest-priority-gap selection, persistence on recompute. |
| `app/models/claim.py` | Claim tables **exactly as Schema Draft §6.7** (templates, template elements, instances, targets, elements, element↔fact links, element↔authority links). |
| `app/schemas/claim.py` | Pydantic v2 request/response contracts (`ChartOut`, `BurdenOut`, `GapOut`, candidates…). |
| `app/db/*`, `app/core/config.py`, `app/main.py`, `app/models/*` | Phase-0 bootstrap scaffold (see Deviations): portable UUID/enum/JSON types → runs on Postgres **and** SQLite (tests/dev need no Docker). |
| `app/routers/health.py`, `app/routers/matters.py` | Health (Phase 0 §9.2) and a **read-only matters stub** so the matter-scoped matrix renders; WS-MATTERS must replace `matters.py`. |
| `alembic/` + `versions/0001_bootstrap.py` | Single frozen bootstrap revision (`create_all`, checkfirst). **Per invariant #3 nothing else may edit `0001`/`env.py`; add `0002+`.** |
| `app/seed_dev.py` | Demo NY matter exercising every burden state. Bootstrap necessity; `scripts/seed_dev_data.py` remains Wave 1's home. |

**Endpoints** (all `/api/v1`): `GET/POST /claim-templates` · `GET /claim-instances?matter_id&burden&status&q&limit&offset` (the matrix) · `POST /claim-instances` (template materialization or blank) · `GET|PATCH|DELETE /claim-instances/{id}` · `GET /claim-instances/{id}/chart` · `POST /claim-instances/{id}/recompute-support` · `POST /claim-instances/{id}/elements` · `PATCH|DELETE /claim-elements/{id}` · `POST/DELETE /claim-elements/{id}/link-fact(/{link_id})` · `POST/DELETE /claim-elements/{id}/link-authority(/{link_id})` · `GET /claim-elements/{id}/support-candidates` (Tech Spec §11.3 element-support search, lexical v1).

### Web (`apps/web`)
- `app/claims/page.tsx` — **claims matrix**: matter selector, burden filters (unsupported/partially/proven/has-gaps) + search, coverage bars, sup/adv fact counts, authority state, top gap per row, “New claim” template dialog.
- `app/claims/[claimId]/page.tsx` — **claim chart workspace** (UX Spec Screen 10): header (code/name/targets/status/theory/authority state/highest gap/burden+explanation), element matrix table, right-pane inspector, gap analysis panel, recompute + delete actions.
- `components/claims/` — `ClaimMatrixTable`, `ElementMatrix`, `ElementInspector` (tabs: support facts w/ evidence anchors + locators, adverse/context, authorities, gap notes; unlink + re-weight actions), `LinkFactDialog` (ranked candidates w/ score reasons), `GapPanel`, `NewClaimDialog`, `BurdenBadge` (badge + support pill + coverage bar), `statusMeta.ts`.
- `lib/api.ts` — `claimsApi` client + all claim types **inside the `WS-CLAIMS` markers**; other workstreams append outside them.
- Phase-0 shell: nav layout, TanStack Query provider, placeholder routes for the other modules (Phase 0 §9.1).

## 2. Invariant compliance

1. **Claims map to facts and evidence.** Chart payload nests `element → support/adverse/context fact links → fact (accepted-only) → fact_support_links → evidence source (+ locator/page)`. `has_primary_anchor` requires a `supports`-typed link to a `primary`/`public_record` source not excluded/privileged/restricted (excluded & privileged anchors don't carry the burden — tested).
2. **Burden-of-proof status.** Derived per element (`unsupported | partially_supported | proven`) and rolled up per claim, plus the stored `claim_support_status_enum` on `claim_elements` which `recompute-support` refreshes (auto-runs after any link mutation, Tech Spec §10.3). Documented, test-pinned rules in `claim_burden.py`'s module docstring. Every badge carries an explanation ("why", UX Spec Screen 10 best-behavior).
3. **Migrations/`alembic/env.py`:** created once as frozen bootstrap (`0001`), never modified afterwards; feature work used metadata models + `create_all` in tests only.
4. **`npm run build --workspace=web`: ✓** (Next 15.5, 14 routes, strict TS).
5. This file ✓.

## 3. Verification results
- `pytest tests/api` → **23 passed** (rollups incl. proven-requires-anchor, conflicted via adverse pts, unaccepted-facts don't count, testimony-only flag, 409 dup links, cross-matter 400, unlink restore, gap panel + attorney gap notes, candidate ranking, template materialization, verification-state transition).
- Build + live smoke through the running stack: `/api/v1/health` ok; seed produces C1 `partially_supported` (E3 conflicted, E4 weak/unanchored), C2 `unsupported` (links point at proposed/uncertain facts → 0 pts), C3 `proven`; matrix filter `?burden=` matches rollups.

## 4. Deviations from the brief (forced by environment)
| Brief assumption | Reality | Resolution |
|---|---|---|
| Worktree `../casevault-claims`, branch `feat/claims-matrix`, target `arena/01a0899f-casevault`, `handoff/AGENT_POLICY.md` | None existed; checkout held only `docs/specs/` (Phase 0 = planning docs) | Implemented on session-pinned branch `arena/01a100f2-casevault`; followed the paste-in prompt's rules literally |
| “Uses existing link tables” / no migrations | No tables existed at all | Bootstrapped scaffold models + frozen `0001` bootstrap migration; **Wave 1/2 should replace `0001` with its proper 001–008 ladder — claim-table DDL here matches Schema Draft §6.7 so models survive the swap** |
| `lib/api.ts` “append only in your section” | File didn't exist | Created with `BOOTSTRAP` + delimited `WS-CLAIMS` sections |
| Matters/facts routers from other waves | Absent | Claims page needs matter select + fact candidates → read-only `matters.py` stub + claims-owned `support-candidates` endpoint (no other write-sets touched) |

## 5. Integration contract for the target branch
When merging this into `arena/01a0899f-casevault` (or when Wave 1/2 lands):
1. **Drop** `apps/api/app/routers/matters.py` in favour of the real matters router (keep path `GET /api/v1/matters` response-compatible: `MatterOut`).
2. **Facts router (Wave 2):** claims read only `fact_assertions.review_state` + `fact_support_links`; no coupling to proposals internals. If schema diverges from §6.5 as modelled, adjust `app/models/fact.py` only.
3. **Migrations:** supersede `alembic/versions/0001_bootstrap.py` with the planned ladder; alembic autogenerate against these models should be near-empty for the claim tables.
4. **`lib/api.ts`:** keep everything outside the WS-CLAIMS markers; rename `listMatters` in the bootstrap section to the shared client once it exists.
5. `app/seed_dev.py` is dev-only; production seeding belongs in `scripts/seed_dev_data.py`.
6. Task creation “from element gap” (UX Screen 10) intentionally deferred — needs the Wave-1 `tasks` table; the gap rows carry stable `element_id` + `code` for one-click task creation later.

## 6. Known limits (v1 scope)
- Candidate ranking is lexical (term overlap + anchor/materiality boosts); semantic re-ranking belongs to Wave 4 search/MCP (§11.3).
- `support_status` manual overrides are stored but overwritten by recompute — by design; audit trail lands with comments/approvals (Wave 1 §6.10).
- No authn/workspace scoping middleware yet (Phase 0 left it to Wave 1); UUID-only paths already resist enumeration.
- Matrix computes rollups in-request (fine at chart scale); add cached columns via Wave 1 migration if matters grow >~100 claims.

## 7. Rebase onto sibling waves (2026-10-03, post-commit)
`origin/arena/01a100f2-casevault` gained `ad2e911` (WS-VERIFY) and `356c5db`
(WS-AI-INTEL) while this workstream ran; WS-CLAIMS was rebased on top and
force-ff pushed as `b15d3d3`. Conflict resolutions:
- `.gitignore` — kept WS-CLAIMS version (superset: Phase-0 header, `*.pyc`).
- `.env.example` — merged: WS-AI-INTEL's AI-provider/search/MCP sections kept
  verbatim; WS-CLAIMS added the SQLite-fallback `DATABASE_URL` comment and
  `DEFAULT_WORKSPACE_*` keys the bootstrap config reads.
- `pytest.ini` — deleted in favour of the sibling's `pyproject.toml`
  `[tool.pytest.ini_options]` (superset: `pythonpath = [".", "apps/api"]`,
  `testpaths = ["tests"]`); no marker registry needed (none used).
- Their `apps/api/app/routers/ai.py` + `services/ai_service.py` coexist with
  the bootstrap; nothing in WS-CLAIMS imports them and `main.py` intentionally
  does not mount them (WS-AI-INTEL owns that wiring).

Verification on the merged tree: `pytest` → **95 passed, 29 skipped, 0 failed**;
`npm run build --workspace=web` → ✓ 14 routes.

**Note for WS-VERIFY:** `tests/integration/test_wave3_e2e.py` switches to
live-API mode whenever *any* API answers on :8000, then hard-asserts the
`/api/v1/sources`, `/api/v1/proposals`, `/api/v1/events` surfaces owned by
unlanded waves (sources/review/chronology) — those 3 fail against a
claims-only server by design (claim-instances probe returns 200 ✓). Suggest
their gate treat per-workstream 404s as `verify_or_skip`, or scope live mode to
merged routers. Not fixed here to stay out of their write-set.


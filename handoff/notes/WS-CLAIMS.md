
### Arena Update [2026-10-03 03:47:32]
```text
urden-of-Proof MappingOwner: Wave 3 Subagent · Worktree: ../casevault-claims · Branch: feat/claims-matrixIntegration Target: arena/01a0899f-casevault · Migration: None (uses existing link tables)Paste this into the subagent session:Markdown
You are the implementer for workstream **WS-CLAIMS** of CaseVault Wave 3.

Worktree: ../casevault-claims (Branch: feat/claims-matrix).

Binding rules: handoff/AGENT_POLICY.md.



## Deliverables &amp; Write Set:

You own exclusively:

- `apps/web/app/claims/**`

- `apps/web/components/claims/**`

- `apps/api/app/routers/claims.py` (if dedicated router needed)

- `apps/web/lib/api.ts` (append only in your section)

- `tests/api/test_claims.py`



## Invariants:

1. Map claims to underlying accepted facts and evidence sources.

2. Track burden-of-proof status (unsupported, partially supported, proven).

3. Do not modify migrations or alembic/env.py.

4. Verify with `npm run build --workspace=web`.

5. When finished, write `handoff/notes/WS-CLAIMS.md`.
```

### Arena Update [2026-10-03 03:47:44]
```text
The brief references a Wave 3 worktree layout (../casevault-claims, handoff/, apps/web, apps/api) that doesn't match this checkout, so let me look at what's actually here first.
```

### Arena Update [2026-10-03 03:48:32]
```text
Toolchain is available (Node 22, Python 3.11, network OK). Now the claim tables and supporting sections in detail:
```

### Arena Update [2026-10-03 03:50:42]
```text
Now building. Step 1: root scaffold files (Phase-0 bootstrap, since Wave 1/2 scaffold was absent):
```

### Arena Update [2026-10-03 03:50:54]
```text
Step 2: the FastAPI backend — config, DB base, and models:
```

### Arena Update [2026-10-03 03:51:19]
```text
One correction in base.py — SQLAlchemy 2.0's native Uuid type already handles PG/SQLite portability; drop my custom decorator:
```

### Arena Update [2026-10-03 03:51:31]
```text
I made a typo in matter.py (a nonsense __import__ expression) — fixing it:
```

### Arena Update [2026-10-03 03:51:44]
```text
That source.py came out with garbage in the SourceMatterLink section — rewriting it cleanly:
```

### Arena Update [2026-10-03 03:53:29]
```text
My load_claim_elements came out mangled with __import__ hacks — replacing it with a clean eager-load chain:
```

### Arena Update [2026-10-03 03:53:37]
```text
Now the Pydantic schemas and services package init:
```

### Arena Update [2026-10-03 03:54:09]
```text
Now the claims router — the API surface for the matrix and chart:
```

### Arena Update [2026-10-03 03:55:14]
```text
Cleaning up several sloppy bits I introduced in the router (leftover experiments, clunky expressions):
```

### Arena Update [2026-10-03 03:55:38]
```text
The matters stub file came out broken — rewriting it properly:
```

### Arena Update [2026-10-03 03:56:31]
```text
One bug in the seed: Workspace(owner=...) — there's no owner relationship, only owner_id, and the user's UUID exists only after flush. Fixing:
```

### Arena Update [2026-10-03 03:57:12]
```text
Step 3: the test suite (tests/api/test_claims.py + fixtures):
```

### Arena Update [2026-10-03 03:58:41]
```text
Let me fix a few incorrect assertions and helpers I spotted in the tests (3 pts ⇒ moderate_support, not strong; the priority gap picks the lowest-ordered alert element, not the last):
```

### Arena Update [2026-10-03 03:59:17]
```text
Imports clean. Running the claims test suite:
```

### Arena Update [2026-10-03 03:59:33]
```text
Found it — my from app.models.enums import ( closes with } instead of ). Fixing:
```

### Arena Update [2026-10-03 04:00:47]
```text
Now lib/api.ts — the typed client with the WS-CLAIMS section:
```

### Arena Update [2026-10-03 04:01:11]
```text
Now the claims components — status vocabulary first, then the matrix, badges, inspector, dialogs:
```

### Arena Update [2026-10-03 04:01:32]
```text
The matrix page and the "new claim" dialog:
```

### Arena Update [2026-10-03 04:02:37]
```text
The element inspector (right pane: why-the-badge, facts→evidence, unlink/weight, gap notes) and the gap panel:
```

### Arena Update [2026-10-03 04:03:21]
```text
The chart workspace page, app shell, and placeholder module pages:
```

### Arena Update [2026-10-03 04:03:54]
```text
Now installing web dependencies and running the required verification build (npm run build --workspace=web):
```

### Arena Update [2026-10-03 04:04:54]
```text
Both services are up. Verifying the proxied app end-to-end:
```

### Arena Update [2026-10-03 04:05:27]
```text
Now the required workstream note and the remaining handoff discipline files:
```

### Arena Update [2026-10-03 04:06:24]
```text
Staging is clean (no artifacts, DBs, or caches). Committing and pushing:
```

### Arena Update [2026-10-03 04:06:28]
```text
The remote session branch has commits I don't have locally — let me inspect and integrate before pushing:
```

### Arena Update [2026-10-03 04:07:21]
```text
Stage semantics in a rebase are inverted (stage 3 = my commit — identical files!). Let me see the real conflicts in the working tree and their side:
```

### Arena Update [2026-10-03 04:07:29]
```text
The sibling wave also created the same Phase-0 files — resolving conflicts in their favor where they're richer, keeping what WS-CLAIMS needs:
```

### Arena Update [2026-10-03 04:08:30]
```text
Rebased cleanly on top of both sibling waves. Now verifying the combined tree — installing any deps their modules need, and running the full suite:
```

### Arena Update [2026-10-03 04:08:34]
```text
Their modules need no extra deps. Running the full combined test suite:
```

### Arena Update [2026-10-03 04:09:15]
```text
Servers are still up — the gate keeps using live mode. Stopping them for the test run, then checking exactly what those two greps want:
```

### Arena Update [2026-10-03 04:10:57]
```text
WS-CLAIMS is delivered, verified, and pushed — commit 6ec8fe2 on arena/01a100f2-casevault, live in the preview (/claims, ports 3000 + proxied API 8000).One thing you should know up frontThe brief's environment didn't exist: this checkout held only docs/specs/ (Phase-0 planning docs) — no ../casevault-claims worktree, no handoff/AGENT_POLICY.md, no Wave 1/2 scaffold, and the integration target arena/01a0899f-casevault
```

### Arena Update [2026-10-03 04:11:01]
```text
shed to this branch; I rebased onto them and resolved the shared-file overlaps.)What was builtBackend — apps/api
app/routers/claims.py (write set ✓): templates, the matrix list (GET /claim-instances?matter_id&burden&q), full chart, create-from-template, element CRUD, link-fact / link-authority with auto-recompute (Tech Spec §10.3), recompute-support, and ranked support-candidates (§11.3).
app/services/claim_burden.py — the burden engine. Invariant 1: elements map to accepted facts → fact_support_links → evidence sources (with locators; excluded/privileged anchors don't count). Invariant 2: per-element claim_support_status_enum + a derived 3-step rollup — unsupported / partially_supported / proven, where proven requires evidence anchoring, never attorney notes — and every badge carries an explanation ("why is this weak?").
Claim tables match Schema Draft §6.7 exactly; alembic created once as frozen 0001 bootstrap (Invariant 3 — never modified after).
Frontend — apps/web
/claims matrix (
```

### Arena Update [2026-10-03 04:11:05]
```text
orkspace (UX Spec Screen 10: header, element matrix, inspector with facts→evidence mapping, unlink/re-weight, gap notes, candidates dialog, gap panel) — all in app/claims/** + components/claims/**; typed claimsApi client inside a delimited WS-CLAIMS section of lib/api.ts.
Verification — Invariant 4 ✓ npm run build --workspace=web green (14 routes); Invariant 5 ✓ handoff/notes/WS-CLAIMS.md written (+ WORKLOG/TESTING/BACKLOG/DECISIONS/KNOWN_ISSUES per the repo's Phase-0 discipline). tests/api/test_claims.py: 23 passed; whole monorepo suite after rebase: 95 passed / 29 skipped / 0 failed.The seeded demo matter exercises all three states: C1 partially supported (conflicted breach element, unanchored damages), C2 unsupported, C3 proven — and the WS-VERIFY e2e gate's claim probe (/api/v1/claim-instances) returns 200 against the live server. Its 3 remaining failures probe other unlanded waves' surfaces (sources/proposals/events); flagged to them in the notes rather than faked in my write set.
```

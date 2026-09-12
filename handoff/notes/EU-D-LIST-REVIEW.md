> Archived reviewer submission, extracted from `dev-logs` commit `54001f0`,
> `EU-D.patch`; author-reported local note commit `d37be07`.
> Preserved as a limitation/baseline report, **not completed checkpoint acceptance**.
> See `handoff/REVIEW_PATCH_INTAKE.md` for integrator corrections, current hold,
> and superseding instructions. Do not execute the original cross-session push
> advice or the uncorrected OCR verification plan below.

# EU-D — independent review of EU-V's list acceptance failures

Review-only assignment (2026-09-12). No product, EU-V, tooling, dependency or
CI files were modified; the only file added is this note.

## Revisions (recorded separately, as instructed)

- **Product checkpoint under review:** `a040e9f739ec3741cd28ee99756d256ea8b78d43`
  (integrated product, provided by the integrator).
- **Verifier checkpoint under review:** `0212370` (EU-V's saved verifier tree,
  provided by the integrator).
- **This reviewer's session branch:** `arena/01a08cdf-casevault`; locally
  based at `ab0ee23` with the session's EU-D revision-2 tree present as
  uncommitted changes (that work is already merged upstream via PR #18).

**Verification limitation (stated up front):** neither checkpoint could be
resolved in this sandbox. Remote GitHub access is closed for this session
(PR #18 merged → session ended), so `git fetch` of `a040e9f…` / `0212370`
was not possible, and neither exists in the local object store (local refs:
`ab0ee23`, stale `origin/main` @ `bfdaf22`). The two checkpoint IDs above are
therefore recorded as given by the integrator, not independently confirmed.

## Evidence accessibility: NOT ACCESSIBLE — no classification offered

Searched the repository and workspace exhaustively. The following evidence
required for the assignment is absent locally:

- **EU-V's list specs** — no `eu-list-*` / verifier spec files exist
  (`tests/browser/` contains only EU-D's `eu-detail-*` files).
- **The L-number definitions** — `handoff/kickoff/EU-V.md` (31 lines, the
  only EU-V-related file present) does not define L1.2, L1.5, L2.5,
  L3.2/L3.3/L3.4, L4.7 or L4.8.
- **The saved 14-passed/6-failed run artifacts** (results, traces, failure
  output) — not present anywhere in the workspace.
- **The integrated list implementation** — `apps/web/app/evidence/page.tsx`
  is byte-identical to base `ab0ee23` in this tree; EU-L's merged code and
  EU-V's merged verifier files are not in it.

Per the assignment's own rule — report inaccessible evidence instead of
guessing — **none of the six failure groups is classified.** A classification
produced without the specs, the run output, or the implementation would be
fabrication. The 14/6 split is likewise not re-derived or confirmed here.

The two permitted individual case runs were not performed: EU-V's specs do
not exist in this sandbox, no browser tooling or stack survives here, and the
assignment forbids provisioning a new framework or restarting another agent's
stack. No stack was started.

## What the integrator's three named checks should answer, per group

Not classifications — the specific questions a re-run with the saved
evidence must answer, using the checks the integrator named:

1. **L1.2 (true empty state):** does the "empty" fixture workspace actually
   contain zero sources (check via API, not via the UI under test)? An
   empty-state assertion against a workspace that has sources is invalid
   setup — but a fixture that IS empty and still fails is a product or
   locator defect.
2. **L1.5 (retained stale rows):** was the failure triggered by a true
   BACKGROUND refetch or by a page RELOAD? A reload rebuilds the query cache
   from scratch and cannot prove retention either way — in this app
   react-query's refetch-on-focus fires on `visibilitychange` (verified in
   EU-D's own work). If the spec used a reload, the test is invalid for this
   requirement; if a genuine background refetch failed to retain rows, that
   is a product defect.
3. **L2.5 (query/filter preserved after failure + retry):** does the
   assertion read the input/filter state (not the URL or a rebuilt page),
   and does the retry path re-fail through the same injected fault? Verify
   the fault actually fired on the retry (request-level proof), not just
   that the input kept its value.
4. **L3.2/L3.3/L3.4 (row badge failure feedback):** does each assertion
   await the specific row's badge/control (scoped locator), or a global one
   that can match the wrong row? Do the badges exist in the integrated
   implementation at all (absent badge = product gap; present but unlocated
   = locator/timing)?
5. **L4.7 (duplicate warnings):** is the warning asserted the per-upload
   duplicate notice (distinct from dedupe/409 handling on the detail page),
   and does the injected duplicate actually produce the API shape the list
   code maps to that notice?
6. **L4.8 (navigation to the original source):** does the assertion await
   navigation completion and the DETAIL page's own markers, and is the link
   target the original source's id (not the duplicate's)? A wrong-target
   link is a product defect; a right-target link with an unawaited
   navigation is a spec timing error.

General principle (per the assignment): a failing test proves neither a
product defect nor a broken spec by itself; each group needs the evidence
above. A broken spec does not make its acceptance requirement pass — the
requirement remains open until a valid spec proves it.

## Deliverable status

- This note is committed to `arena/01a08cdf-casevault` (only authorized
  file: `handoff/notes/EU-D-LIST-REVIEW.md`). All other local changes are
  the session's already-merged EU-D work, preserved untouched.
- **Push and the review-only PR could not be performed:** this session's
  GitHub access is closed (implementation PR #18 merged). The note commit is
  ready to push from a new session; suggested PR: `arena/01a08cdf-casevault`
  → `arena/01a0899f-casevault`, review-only.
- Recommended next step for the integrator: have the reviewer (or EU-V's
  session) re-run with the actual checkpoints — the six groups cannot be
  classified from any tree this session can see.

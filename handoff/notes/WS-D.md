# WS-D — Sprint 3 evidence verification and CI
Contract: docs/contracts/sprint3_evidence.md v1.0 **with the integrator's 2026-09-10 as-shipped override** (original v1.0 is marked superseded)

## What changed
- In progress: `scripts/pipeline_smoke.py`, `tests/integration/**`, append-only `evidence` job in `.github/workflows/ci.yml`.
- Session branch: `arena/01a089cf-casevault`; integration base fetched/reset to `adcb1b837b03b69b4f66fd1850ec8d5aee7e4f26` before edits.
- No product files or dependency manifests will be edited.

## Proof
- Pending implementation and real-Postgres verification. Not yet a conformance claim.
- Required setup ran: `bash scripts/setup_local.sh`; `.venv/bin/pip install pgserver`.

## Contract gaps
- **BLOCKER — §6 / §7 (WS-C), not an approved deviation:** `/evidence` and `/evidence/{id}` have no Next page entrypoints in the merged checkout despite the as-shipped table marking both routes shipped. A production Next server built from `c7842bb` returns **404** for both (control `GET /` = 200). Failing assertion: `§6 GET /evidence: expected 200; observed 404`; same for `/evidence/00000000-0000-4000-8000-000000000001`. New mandatory static route-entrypoint guard makes the smoke/CI fail after both API scenarios finish. Integrator must route restoration of the missing pages to the evidence UI owner; WS-D will not change product files. The earlier full gate passed because `next build` silently omitted the routes.
- The pasted WS-D brief still calls original v1.0 frozen, but the integration-tip contract explicitly supersedes it with an as-shipped delta. Tests will use that override and report original-v1 differences, not disguise them as original-v1 conformance.
- Initial base `adcb1b8` lacked §3.2 / §5 per-source reprocess; the initial run reported its 404 explicitly. During verification the integrator merged WS-EV (`c7842bb`); this branch was rebased onto that tip without conflicts. The final verifier now **requires** `POST /api/v1/sources/{id}/reprocess` and its stage jobs in both Redis modes (Wave 2 contract §6), with no absent-route fallback. New-tip proof is pending.
- §5: PDF/image OCR is an explicit stub even with OCR binaries installed; only text extraction is implemented. Verification must assert the recorded skip reason, not silently skip the test or claim actual PDF/image OCR.

## Risks / follow-ups
- The current Wave 2 policy names WS-J as CI hub owner, while this explicitly requested WS-D follow-up owns an append-only evidence job. Integrator: sequence this additive CI change with WS-J; no existing job will be restructured.
- Storage instructions conflict: the old WS-D brief names ignored `data/`, whereas the newer agent policy forbids tests using the real data tree. Standalone smoke artifacts will use a fresh ignored `data/temp/` subtree; pytest will provide an isolated scratch root, matching `tests/api/conftest.py`. Only generated synthetic content will be used.
- Setup reported existing npm dependency vulnerabilities (4 high, 1 critical). No dependency changes made; integrator should route remediation to the appropriate owner.

## What the next agent must know
- This is the still-open independent Sprint 3 verification follow-up identified in `handoff/PARALLEL_PLAN.md` §10, not a second feature implementation or a Wave 2 intake assignment.
- Proof will be run against the integrated evidence module already present on the session base; no separate A/B/C branches need to be merged here.

<!-- Brief + paste-ready prompt for one parallel agent session.
     Raise changes through the integrator; see handoff/kickoff/README.md. -->

# WS-D — Sprint 3 · end-to-end verification + CI evidence job

**Owner:** one agent session · **Branch:** your session branch, base = `arena/01a0899f-casevault`
**Contract:** `docs/contracts/sprint3_evidence.md` v1.0 (frozen) · **Plan:** `handoff/PARALLEL_PLAN.md`

---

## Paste this into the agent session

```
Part of the parallel Wave 1 build (see `handoff/PARALLEL_PLAN.md`). Contract: **`docs/contracts/sprint3_evidence.md` v1.0 (frozen)** — verification scope per §7.

## Deliverable
Independent verification that WS-A + WS-B + WS-C together satisfy the Sprint 3 contract.

- `scripts/pipeline_smoke.py` — headless end-to-end run against a real API+DB: bootstrap workspace → upload a text file, a PDF and an image → assert source rows, sha256, duplicate warning, page rows + OCR text where expected → patch include/exclude exclusivity → link/unlink a matter → `reprocess` with and without redis → download `/sources/{id}/file` and byte-compare with the uploaded file.
- `tests/integration/test_evidence_e2e.py` — pytest wrapper for the above (skipped-with-reason only if storage/binary deps are absent; never silently skipped on the normal path).
- `.github/workflows/ci.yml` — append an `evidence` job that applies migrations on the postgres:16 service and runs the integration test (do not restructure the existing jobs).
- Report each contract deviation as issue text in the PR: endpoint, expected vs observed, contract section.

## Write set (do not edit anything else)
`tests/integration/**`, `scripts/pipeline_smoke.py`, `.github/workflows/ci.yml` (append job only).

## Proof required in the PR
`python scripts/pipeline_smoke.py` output plus `bash scripts/verify_all.sh` (full gate) on the merged tip of the three workstreams.

## Notes / constraints
- This workstream starts **after** WS-A and WS-B merge (and can begin earlier against the contract for the test scaffolding).
- Do not fix product bugs yourself: report them, with the failing assertion, and let the owning workstream patch.
- Storage/evidence artifacts must be written under the git-ignored `data/` tree; never commit real evidence (use tiny synthetic fixtures committed as text where possible).
- Write `handoff/notes/WS-D.md` and open the PR against `arena/01a0899f-casevault` (not `main`).
```

---

*Read `handoff/kickoff/README.md` first — step 0 (base branch) and the
environment setup are mandatory, and the integrator merges in the order
A → B → C → D.*

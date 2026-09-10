<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-F — Wave 2 — source ledger API, filters, CSV import/export, bulk ops

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** 2nd (parallel with W2-G/H/I) · **Depends on:** W2-E merged

---

## Paste this into the agent session

```
Workstream **W2-F** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. Implement
contract §3 as written.

## Deliverable
Sprint 4's backend: the source ledger as a first-class module (PRD §10.4).

- `app/schemas/ledger.py` — `LedgerEntryCreate/Update/Out`, `LedgerEntryPage`,
  `LedgerBulkRequest`, `LedgerImportResult`.
- `app/services/ledger_service.py` — CRUD scoped to the workspace, all §3.1
  filters, bulk patch (partial success with per-id results), `link-source`.
- `app/services/ledger_csv.py` — export (RFC 4180, UTF-8, ISO dates, `tags`
  joined with `;`) and import (header-matched, per-row validation, row-level
  errors, `dry_run` writes nothing, duplicate `external_ledger_id` handling per
  contract). Pure functions where possible so they are unit-testable.
- `app/routers/ledger.py` — fill W2-E's stub with every §3.1 endpoint, using the
  repo's `resolve_workspace_id` convention and the `{items,total,limit,offset}`
  envelope for lists.
- `tests/api/test_ledger.py` — CRUD, filters, CSV round-trip equality, malformed
  rows, `dry_run` no-write, bulk partial success, workspace scoping (a row from
  another workspace must 404, never leak).

## Write set (nothing else)
`app/schemas/ledger.py`, `app/services/ledger_service.py`,
`app/services/ledger_csv.py`, `app/routers/ledger.py`,
`tests/api/test_ledger.py`.

## Proof required
`bash scripts/verify_all.sh --no-web` plus your ledger test output, and a pasted
CSV export/import round-trip sample (synthetic rows only).

## Notes
- Never write real case data anywhere, including test fixtures — synthetic
  ledger rows only.
- Do not edit `app/main.py`, models, or the migration; if the schema is wrong,
  report a contract gap (AGENT_POLICY §4.1) instead of changing it.
- `DELETE /ledger-entries/{id}` is allowed (user work product); facts/evidence
  are never deleted through your routes.
- Write `handoff/notes/W2-F.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

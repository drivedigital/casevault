# W2-H — /ledger UI
Contract: docs/contracts/wave2_intake_core.md v1.0

## What changed
- `apps/web/app/ledger/page.tsx`: Source ledger screen with paged contract-backed queries, filter state, notifications, CSV export, imports, bulk updates, and create/edit/delete mutations.
- `apps/web/components/ledger-filters.tsx`: matter, source status, confidence, tag, verification-task, and free-text filters.
- `apps/web/components/ledger-table.tsx`: sortable TanStack table with the §5.1 columns and bulk-selection controls.
- `apps/web/components/ledger-drawer.tsx`: full-field create/edit drawer, source-link selector, per-row save, and delete action.
- `apps/web/components/ledger-import-dialog.tsx`: CSV file selection, `dry_run=true` preview, row-level error display, and explicit confirm step.
- `apps/web/components/ledger-bulk-actions.tsx`: selected-row tag, source-status, and confidence updates.
- `apps/web/components/nav.tsx`: Ledger immediately follows Evidence.
- `apps/web/lib/types.ts` and `apps/web/lib/api.ts`: append-only WS-H source-ledger types and `/api/v1/ledger-entries` clients.

## Proof
```text
$ npm run lint --workspace=web
✔ No ESLint warnings or errors

$ npm run typecheck --workspace=web
(exit 0)

$ npm run build --workspace=web
✓ Compiled successfully
✓ Generating static pages (16/16)
Route /ledger generated successfully.

$ bash scripts/verify_all.sh
17 passed, 2 warnings in 1.44s
All checks passed! (ruff)
web lint / typecheck / build all passed
GATE GREEN — python, migrations, lint and web all pass.
```

Walk readiness (implemented against the frozen API contract): create opens a blank detail drawer, validates required short name/statement, saves with `POST /ledger-entries`, and can link the selected source with `POST /ledger-entries/{id}/link-source`. Selecting a table row opens it for edit, changing filters re-queries the table, and the export link builds `/api/v1/ledger-entries/export.csv` from exactly the active filters. CSV import first submits `dry_run=true`; a bad row is shown in the row-level error table and nothing can have been written before the separate confirm action. Selecting rows exposes the bulk bar, where a tag list is submitted to the contract bulk endpoint.

A live API walk was intentionally not run: this branch is based on the required integration tip before WS-F's ledger routes exist. No fixtures or API mocks were added. Re-run the walkthrough after WS-F merges: create → edit → filter → export → choose a CSV with one blank `fact_statement` row and preview only (confirm nothing was written) → bulk tag; also verify the drawer delete action.

## Contract gaps
- None. The WS-F dependency is expected to provide the frozen §3 endpoints after merge.

## Risks / follow-ups
- The API dependency is not present on this contract-only branch, so live mutation/import/export behavior awaits WS-F integration.
- Bulk tag UI intentionally replaces the selected rows' tag arrays, matching the §3 bulk `patch.tags` shape; if additive tagging is desired, it needs an additive contract change.

## What the next agent must know
- `api.ts` and `types.ts` additions are in a clearly marked append-only `Source ledger (Wave 2 / WS-H)` section. Preserve that ordering when integrating WS-I's append-only section.
- The UI uses only relative `/api/v1` paths. Link-source changes use the dedicated endpoint; clearing a source uses the allowed partial PATCH field (`linked_source_id: null`).

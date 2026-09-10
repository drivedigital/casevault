<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-H — Wave 2 — /ledger UI (table, filters, CSV import/export, bulk actions)

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** 2nd (parallel with W2-F/G/I) · **Depends on:** contract only (build against §3; API lands behind you)

---

## Paste this into the agent session

```
Workstream **W2-H** of the CaseVault parallel build. Read
`handoff/AGENT_POLICY.md`, `handoff/PARALLEL_PLAN.md` §4a and
`docs/contracts/wave2_intake_core.md` **v1.0 (frozen)** first. Implement
contract §5.1 exactly; the API you call is specified in §3 and is being built in
parallel — code against the contract, not against a guess.

## Deliverable
The source ledger screen — the spreadsheet-replacement workflow the tester
actually uses (PRD §10.4, UX Screen 4 analogue).

- `/ledger` page: filters (matter, source status, confidence, tag, has
  verification task, q), sortable table (TanStack Table) with the columns in
  §5.1, detail drawer for create/edit/delete, `link-source` control, CSV export
  button (respects filters) and CSV import dialog (file → `dry_run` preview with
  row-level errors → confirm), bulk select → bulk tag/status/confidence.
- `components/ledger-*.tsx` for the pieces; match the existing visual language
  (`Badge`, `Field`, `inputClass`, TanStack Query patterns from `/evidence`).
- `components/nav.tsx`: add `{ href: "/ledger", label: "Ledger" }` immediately
  after the Evidence entry — you own this file this wave.
- `lib/types.ts` + `lib/api.ts`: append the §5.3 ledger types and client
  functions **in your own commented section at the end** (append-only rule,
  AGENT_POLICY §2.4). Do not reorder or reformat existing lines.

## Write set (nothing else)
`apps/web/app/ledger/**`, `apps/web/components/ledger-*.tsx`,
`apps/web/components/nav.tsx`, `apps/web/lib/api.ts` (append-only),
`apps/web/lib/types.ts` (append-only).

## Proof required
`npm run lint --workspace=web && npm run typecheck --workspace=web && npm run
build --workspace=web`, plus a walk description: create → edit → filter → export
→ import with one bad row (preview shows the error, nothing written) → bulk tag.

## Notes
- No mocks may merge. If the API is not ready when you test, say so in the note
  and re-run the walk after W2-F merges; delete any temporary fixture first.
- Relative `/api/v1` paths only (the Next dev server proxies them).
- Write `handoff/notes/W2-H.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*

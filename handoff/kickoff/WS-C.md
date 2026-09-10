<!-- Brief + paste-ready prompt for one parallel agent session.
     Raise changes through the integrator; see handoff/kickoff/README.md. -->

# WS-C — Sprint 3 · evidence repository UI (/evidence + source viewer)

**Owner:** one agent session · **Branch:** your session branch, base = `arena/01a0899f-casevault`
**Contract:** `docs/contracts/sprint3_evidence.md` v1.0 (frozen) · **Plan:** `handoff/PARALLEL_PLAN.md`

---

## Paste this into the agent session

```
Part of the parallel Wave 1 build (see `handoff/PARALLEL_PLAN.md`). Contract: **`docs/contracts/sprint3_evidence.md` v1.0 (frozen)** — implement §3 + §6 as written.

## Deliverable
Evidence module UI (fixes the current `/evidence` 404 logged in KNOWN_ISSUES).

- `/evidence` — Screen 4: filters (q, matter, source type, source status, review status, included/excluded, OCR status), list table (title, filename, matters, type, statuses, pages, OCR, updated), upload panel/drag-drop (multipart), duplicate warning when `SourceOut.duplicate_of` is set.
- `/evidence/[id]` — Screen 5 v1: page navigation, viewer (`<iframe>` for PDF, `<img>` for images, `<pre>` for text/OCR text), inspector tabs Metadata / OCR / Matters / Status, actions (edit fields, include/exclude with the server's exclusive-flag rule, link/unlink matters, reprocess).
- `apps/web/lib/types.ts`: unions + const arrays + `Source`, `SourceDetail`, `SourcePage`, `SourceMatterLink`, `SourceMetadata`, `SourceListPage<T>`.
- `apps/web/lib/api.ts`: `listSources`, `getSource`, `uploadSource` (FormData), `updateSource`, `listSourcePages`, `linkSourceToMatter`, `unlinkSourceFromMatter`, `reprocessSource`, `sourceFileUrl`; and fix `apiFetch` to not force `Content-Type: application/json` on FormData bodies.
- Components under `apps/web/components/source-*.tsx`, styled to match the existing pages (`Badge`, `Field`, `inputClass`, TanStack Query).

## Write set (do not edit anything else)
`apps/web/app/evidence/**`, `apps/web/components/source-*.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/types.ts`.

## Proof required in the PR
`npm run lint --workspace=web && npm run typecheck --workspace=web && npm run build --workspace=web`, plus the walk-through you performed (list, upload, filter, open detail, view OCR text, include/exclude, link matter) and whether it ran against a live WS-A API or only against the frozen contract.

## Notes / constraints
- Build strictly from contract §3; if an endpoint behaves differently, report it as a contract gap rather than adapting silently.
- No mocks may merge: any temporary fixture used before WS-A lands must be deleted before the PR.
- Relative `/api/v1` paths only (Next rewrites to the API) — never hard-code `localhost:8100` in browser code.
- Write `handoff/notes/WS-C.md` and open the PR against `arena/01a0899f-casevault` (not `main`).
```

---

*Read `handoff/kickoff/README.md` first — step 0 (base branch) and the
environment setup are mandatory, and the integrator merges in the order
A → B → C → D.*

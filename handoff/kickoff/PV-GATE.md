# PV-GATE — fresh-session independent owner-preview verification

Authorized 2026-09-12. Fresh Arena session only; do not reuse closed EU-D/L.
Read STATUS.md, AGENT_POLICY.md, RECOVERY.md and OWNER_PREVIEW.md first.
Use only your session's assigned branch; PR into arena/01a0899f-casevault.
Confirm product a040e9f739ec3741cd28ee99756d256ea8b78d43 is accessible BEFORE work.
Current integration adds docs only; identify product SHA vs test/handoff SHA.

## Purpose and bounds
Independent Linux/browser sanity check of the limited owner preview, not full
EU-V acceptance and not a reason to reopen product scope. Work<=45min including
setup<=15min; tests in batches<=5min, retries0, workers1. Save evidence and stop on
first substantive blocker. Do not repeat whole D/L/V suites.

Write set ONLY:
- tests/browser/pv-gate-* (at most three focused tests plus one helper if needed)
- handoff/notes/PV-GATE.md
EU-V scripts/specs, all product/API/worker files, contracts, shared docs, dependency
manifests/lockfiles and CI are read-only. No local-ops patch import. Approved pinned
isolated Playwright1.63 tooling may be reused; no alternate framework. Existing
integrated D/L tests/fixtures may be read or imported without modification.

## Tasks
1. Establish explicitly owned disposable DB/storage/Redis/worker/web, separate
   from any active EU-V stack. No destructive gate or application DB fallback.
   Bind browser-facing services0.0.0.0 and use relative browser API/proxy URLs.
2. Real browser/API: upload unique synthetic TXT/PDF/PNG; capture actual response
   IDs, open detail, verify no unexpected download, explicit original bytes equal
   fixtures. Report native PDF capability honestly; fallback is valid in sandbox.
3. After initial uploads settle, explicitly click Reprocess OCR twice sequentially
   for TXT and PDF. Each click needs returned queued=true/job_id, supported RQ
   decoded result, exact-ID SQL/page state and UI outcome. TXT complete/one page;
   PDF skipped (stub), no extraction claim. Each run bounded; record timeout as
   unconfirmed outcome plus test failure/blocker, never auto-enqueue retry.
4. Minimal Status edit/save and return-to-list smoke on synthetic source. Do not
   investigate all EU-V save-race cases; report a reproducible issue if encountered.

Expected note: exact tested tree, tools, commands/start/end/exit, case table with
real vs injected vs not-run, job/source correlation, compact redacted results,
cleanup state, and preview-safe-with-limitations vs blocked recommendation.
Keep raw synthetic logs outside Git; checkpoint redacted note after each batch.
No native Mac proof or final acceptance claim. Push new focused PR, no self-merge,
force-push, retired branch takeover or product fix. Preview can proceed independently
only under OWNER_PREVIEW.md preflight; your findings may pause it if unsafe.

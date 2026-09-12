# EU-M — local Mac/browser acceptance (report-only)

**Assignee:** new local tester/agent (owner confirmed). Two phases; no product edits.

## Current checkpoint — 2026-09-12

A new local agent is assigned. Integrated D+L checkpoint is now available:
`a040e9f739ec3741cd28ee99756d256ea8b78d43`. Follow
`handoff/EU_M_CHECKPOINT.md` for the current pinned report-only assignment.
This supersedes the earlier timing hold and older phase wording below.
EU-V remains pending; no product/dependency changes authorized.

## Paste-ready assignment

Read `docs/contracts/evidence_ui_closure.md`. Work is report-only; use your
existing local testing workflow and dev-logs reporting branch. Preserve local
changes. Never test with actual case evidence or publish its filenames/hashes.

Phase A, now: complete the exact original Mac reproduction on current integration.
- Record actual SHA (`git rev-parse HEAD`), Python/RQ versions, launcher and worker
  class. Stop only your prior test worker; use disposable DB/storage/queues.
- Normal launcher must choose SpawnWorker on Darwin. No PYTHONPATH, GSS-disable,
  or Objective-C fork-safety workaround for acceptance. Record any overrides.
- Upload a synthetic TXT/PDF fixture, then explicitly CLICK Reprocess OCR twice
  sequentially, waiting for terminal results between requests. Upload jobs alone
  are not this reproduction. Record job IDs, result payloads, persisted OCR state,
  worker survival and absence of new matching SIGABRT reports. Skipped is expected
  for stubbed PDF/image extraction. Verify original bytes unchanged and clean up.
- Python 3.12 proof is scoped to 3.12. Python 3.14 remains unverified unless tested
  in a separate isolated environment; do not replace the working environment.

Phase B, only after integrator supplies D+L merged SHA: run EU-V browser checklist
in the real local browser, including downloads/PDF behavior and OCR UI refresh.
Use synthetic data, disclose browser version and manual vs automated coverage,
and report observed failures rather than repairing product code.

Commit redacted report under dev-logs/local-runs with exact SHA/commands/results,
job IDs, cleanup and remaining limitations. No raw personal crash metadata or
real evidence. Tell integrator the report commit. No worker/dependency changes
without a new scoped assignment.

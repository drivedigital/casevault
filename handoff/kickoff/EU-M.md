# EU-M — local Mac/browser acceptance (report-only)

**Assignee:** existing local tester/agent. Two phases; no product edits.

## Current hold — 2026-09-12

Owner has explicitly deferred EU-M and local environment startup until the
integrator supplies a substantive integrated testing point, exact SHA and
focused checklist. Do not start Phase A or B now. The checklist below is retained
for that later run; this hold supersedes its previous “now” timing.

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

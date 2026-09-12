> **Current owner instruction: ON HOLD.** Do not start local integration tests.
> Earlier release/checklist below is historical until integrator explicitly supplies
> a renewed go-ahead, exact checkpoint and checklist.

# EU-M — integrated local testing checkpoint

Released by integrator 2026-09-12. This supersedes the earlier wait for a
substantive integrated D+L build. EU-V is still pending; this is NOT release
acceptance or authorization for product fixes.

## Paste-ready assignment for the new local agent

You are EU-M, a report-only local Mac/browser tester. Read AGENT_POLICY,
docs/contracts/evidence_ui_closure.md, and this checklist. Preserve all local
changes. Use an isolated testing checkout/workflow; never overwrite a dirty
checkout or change another session's assigned branch.

**Pin the product under test to integrated commit:**
`a040e9f739ec3741cd28ee99756d256ea8b78d43`
(from `arena/01a0899f-casevault`; includes EU-D c8c7d27 and EU-L 14f4491).
Record `git rev-parse HEAD` and any local diff. If that commit is unavailable,
report the blocker rather than silently testing another revision.

Use only disposable DB/storage/queues and synthetic TXT, PDF and PNG fixtures.
No existing case evidence, shared application database, or destructive reset of
the user's environment. Use the supported local startup workflow after verifying
its target DB/Redis/storage paths. EU-V's pending tooling is not yet ratified for
local execution; do not run its setup/cleanup scripts blindly.

### 1. Runtime and exact Mac worker reproduction
- Record macOS/architecture, Python, RQ, browser versions and launcher command.
- Normal launcher must choose SpawnWorker on Darwin; record actual worker class.
  No Objective-C fork-safety, GSS, TLS or PYTHONPATH workaround for acceptance.
  Stop only processes you started/own. Do not replace a working Python install.
- Upload a synthetic TXT and PDF. For EACH fixture explicitly click Reprocess
  OCR twice sequentially, waiting for terminal results between requests.
  Upload-triggered jobs alone do not satisfy this reproduction.
- For each click record job ID, result payload, committed OCR/processing state,
  page count where applicable, UI terminal state, worker survival, and whether
  any new matching SIGABRT report appeared. RQ FINISHED alone is insufficient.
- TXT complete and PDF skipped are the expected shipped-engine outcomes; PDF
  skipped is not full OCR extraction. Check original bytes unchanged afterward.
- Scope claims to Python versions actually tested. Python 3.14 remains unverified
  unless tested separately in an isolated environment; no downgrade-causality claim.

### 2. Real native browser/downloads
- Opening each detail page must not unexpectedly download its original.
- Explicit Download original: TXT/PDF/PNG bytes equal uploaded fixture bytes;
  record synthetic filename, size/hash comparison and suggested download name.
- PDF preview is opt-in. Verify actual native inline rendering where supported,
  and usable explicit download fallback otherwise. Record browser/version and
  whether native PDF viewing is enabled. Do not inject PDF capability here.
- Dismiss/reopen preview, navigate away during load, and return. Report visible
  errors or unexpected downloads; do not claim memory/abort internals from a
  manual observation alone.

### 3. Integrated evidence UI smoke
- Enter Status directly: fields initialized. Dirty edits survive background
  refetch; save persists; navigating to another source resets the fields.
- Keyboard focus plus one Enter/Space activation opens upload picker; upload
  produces one new source and refreshes list. Observe pending protection and
  retry feedback; label any artificial network throttling/failure injection.
- Include/exclude remain mutually exclusive and persist after refresh.
- List distinguishes empty, filtered-empty and failure; filters survive retry.
- Link/unlink matter, confirm refreshed association and actionable errors.
- OCR accepted is not completed. Watch UI reach real terminal state and refresh
  pages; navigating away must not leave a visible phantom watch on return.

### Reporting / boundaries

Record each case as PASS / FAIL / BLOCKED / NOT RUN, with actual SHA, commands,
evidence and manual vs automated vs injected classification. Redact credentials,
personal crash metadata and real-case identifiers. Report bugs with minimal
reproduction; do not edit product code, worker/deps, CI or database schema.

Use the established local report workflow (redacted `dev-logs/local-runs` report,
if available) and return report commit/path. If that workflow is unavailable,
return a redacted report file; do not invent a branch or overwrite local work.
Document cleanup of only owned synthetic fixtures/processes/resources.

Integrator baseline: strict pre/post merge 119 passed/no skips; combined D+L
browser run 43 passed/2 worker-only skipped. D-only prior run separately passed
both real-worker tests; worker paths were NOT rerun on this combined checkpoint.
Native PDF and exact Mac Reprocess reproduction remain for this local run.
EU-V's independent final acceptance is still required in parallel.

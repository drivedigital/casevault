# EU-ERR — narrow list error-disclosure fix (fresh session)

Integrator assignment2026-09-12. Third fresh-agent slot, not launched here. Use
only your new session's assigned branch, never closed EU-L/D branches. Read
STATUS.md/AGENT_POLICY.md/RECOVERY.md and confirm access to producta040e9f and
verifier e7fe31ec14ba0c99625057646769440dbb0ac1cd before work.

Finding: EU-V L3.2–L3.4 injected a500 detail containing traceback/SQL. Correct-row
accessible error and Retry recovery worked, but raw detail rendered. Source review
confirms evidence-list-states.describeError returns arbitrary Error.message.
This is a client disclosure-boundary defect; no claim real case data leaked or
that injected text proves a production backend emits the same payload.

Write set ONLY:
- apps/web/components/evidence-list-states.tsx
- optional apps/web/lib/evidence-list-errors.ts (pure helper)
- tests/browser/eu-error-* (focused regressions only)
- handoff/notes/EU-ERR.md
All other product files, shared api/types, EU-V tests/harness, backend, worker,
CI/dependencies and local-ops are read-only. No global error refactor.

Implement safe user-facing list error mapping: unexpected/server/untrusted error
text gets a generic actionable message, not raw API detail/stack/SQL/internal path.
Preserve legitimate known validation feedback via a deliberate trusted mapping,
not a blanket trust in detail or regex-only promise of universal redaction.
Keep attribution to source/file/operation, accessible retry, pending guard and
honest response-loss uncertainty. Do not turn failure into empty/success. Correct
misleading comments saying arbitrary detail can never contain traces.

First reproduce with labelled injected500 (real browser/app, synthetic fixture),
then show safe feedback, no traceback/SQL and successful retry. Test at least one
known validation error and generic/network error without leaking arbitrary text;
cover other list surfaces using this shared helper where practical. No real case
fixtures. Do not edit EU-V assertions to green the test. Return exact SHA/commands,
before/after evidence, limitations and changed paths. Use approved isolated tooling;
raw logs outside Git, redacted notes checkpointed after bounded batches.

Bound:60min work, per-browser batch<=5min/retries0; if environment unavailable
report blocker rather than improvise a framework. Run web lint/typecheck/build
and applicable focused regressions. Integrator independently gates/merges and asks
EU-V to rerun its original failing case on the merged SHA. Open NEW focused PR
into arena/01a0899f-casevault; no self-merge/force-push or unrelated changes.

## Review amendment — 2026-09-12, PR21 comment5649550926
Additionally authorized: tests/browser/eu-list-failures.spec.ts ONLY for the three
raw injected-detail expectations identified in EU-ERR's note. Assert safe messages
and no raw-detail echo, preserving all other semantics. No other inherited tests
may be modified. Run all eu-error and eu-list cases plus web checks. Correct network
response-loss copy and inconsistent digit comments. Detail errors remain out of scope.

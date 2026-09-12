# Local operations proposal — preliminary review (2026-09-12)

Owner supplied commit `0159466ec05b3826934f92f54e9c7701753ac82c` on
`codex/local-ops-safety`, based on integration `e3e0b76`. Fetched/read without
switching branches or merging. **Not approved or integrated.** No PR yet observed.

This contains code, not just notes: backup/diagnostic tools, a signed webhook
listener, a new destructive-test database guard, shared verify_all.sh/API fixture
changes, and 13 synthetic local-ops tests. Shared gate/fixture changes require
separate integrator approval. EU-M's evidence acceptance assignment remains
report-only; this proposal is not evidence-UI acceptance or permission to expand
that assignment.

## Measured review results
- Copied just the proposed scripts and unit test into an external scratch tree;
  independently ran pytest: **13 passed in 0.05s**. DB-free mocked/synthetic tests,
  NOT an actual backup, restoration, live webhook or full integration gate.
- Directly called the proposed guard with the embedded harness's URL shape:
  `postgresql://postgres@/casevault_test?host=/home/user/casevault/data/pgdata`.
  It rejects it because it requires a hostname and forbids all query parameters.
  This demonstrably breaks the supported no-Docker strict-gate path, which
  provisions embedded PG and then passes precisely this Unix-socket URL shape.
- No commands touching local Mac services, tunnels, real evidence or backups ran.
  Scratch files remain outside Git at /home/user/local-ops-review.

## Before merge consideration
1. Open a focused PR into integration from the existing local-ops branch; keep
   this separate from EU-V and local acceptance reports. Do not self-merge.
2. Resolve embedded-PG compatibility without weakening disposable-target safety:
   either narrowly validate approved Unix-socket connection parameters or use a
   supported equivalent harness transport. Continue rejecting database-name and
   service overrides. Add guard regression cases for the actual harness URL,
   explicit TCP disposable URLs, missing TEST_DATABASE_URL and unsafe targets.
   Validate targets before destructive operations wherever applicable.
3. Run strict integration gate on the corrected candidate, including embedded PG;
   report exact SHA/commands/counts and any environment limitations honestly.
4. Add synthetic webhook tests: signed ping/push, invalid/missing signatures,
   wrong repository, malformed payload shapes/body sizes and failed fetch. Ensure
   malformed repository/head/pusher objects yield controlled rejection rather
   than attribute errors. Keep subprocess effects mocked; never publish secrets.
5. Maintain current backup claims: pg_restore --list plus archive read is structural
   validation, not recovery proof. A real backup/restore drill requires separate
   owner-approved isolated targets; do not touch working data to obtain a count.

## Coordination / current checkpoints
EU-M reports local LaunchAgents/ngrok/webhook setup in scripts/LOCAL_OPS.md; these
machine-state claims are not independently verified here. GitHub delivery response
and signed-event handling are needed for end-to-end confirmation; process presence
or desktop alert alone is insufficient.

EU-V remote checkpoint `3499164` is visible and based on `e3e0b76`. Owner reports
AI-service-busy interruptions; these are not product test failures. Continuation
advice endorsed on PR19: inspect existing work/process/results before restarting,
checkpoint often, bounded runs with external raw synthetic logs, measured counts
only, no weakened assertions or stale-baseline acceptance. Final acceptance still
pending. Do not import this local-ops proposal into EU-V's verifier branch.

Pinned evidence product checkpoint remains `a040e9f`; `e3e0b76` adds its local
checklist/docs. EU-M should continue that scoped native-browser/Mac verification
using handoff/EU_M_CHECKPOINT.md; EU-D/L remain inactive pending scoped bug reports.

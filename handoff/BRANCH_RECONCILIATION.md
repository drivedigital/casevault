# Branch reconciliation — 2026-09-10

**Latest update:** WS-D PR #14 integrated as `57e5ae6`, strict full gate 119 tests.
W2-W PR #16 integrated as `f9e6a1c`; native Mac Python 3.12 upload stability
reported in MAC_WORKER_VERIFICATION.md. Original UI follow-up remains outstanding.
GitHub CI for the repaired workflow still needs confirmation. The tables below
are historical audit records, not current merge blockers.

Audit base: integration `72e8237`. Fetched all remote head refs; compared
ancestry, outstanding diffs, and GitHub PR state. **Not fully reconciled.**
No branches deleted or switched. Archived/superseded work is intentionally
not merged merely to make ancestry appear clean.

| Remote branch suffix | Head | Disposition |
|---|---|---|
| arena/01a0899f-casevault | 72e8237 | Integration; up to date at audit |
| arena/01a089c9-casevault | 4936aea | Fully contained (E) |
| arena/01a089cb-casevault | 7c53b92 | Fully contained (EV/F) |
| arena/01a089cc-casevault | fac1568 | Fully contained (G + worker fix); PRs 9/13 merged |
| arena/01a089ce-casevault | 865c624 | Fully contained recovery via PR 11; follow-up remains incomplete/unmerged |
| arena/01a089cd-casevault | 55e6d10 | Five commits after merged 5755cc3; smoke script cap/bulk/link changes plus notes need new PR/review/proof |
| arena/01a08a04-casevault | 0b3ce1c | Active WS-D successor PR 14, unmerged; six-file diff including evidence CI and automatic-token fix |
| arena/01a089cf-casevault | de18118 | Superseded by PR 14; old PR 10 closed during audit; verifier script/test byte-identical in successor |
| arena/01a08429-casevault | cd40299 | Older D verifier; PR 6 closed, not an active merge candidate; keep for reference |
| archive/ws-b-01a089ce | 5c9f36f | Intentionally retained duplicate storage implementation + assessment, not approved for merge |
| archive/ws-c-original | d22993c | Original UI archived; adapted recovery integrated via PR 11, do not merge original over it |
| dev-logs | e39b1ca | Unrelated report/patch history; uploaded UI patch reviewed, stale and incomplete; not applied |
| main | bfdaf22 | Unrelated Phase-0 history; intentionally untouched, no main release reconciliation authorized |

## Update after follow-up integration

J head `b6e7b44` is now contained via merge `15174cd`; the earlier five-commit
J backlog below is resolved (including rebased successor commits). Integrator
verified normal-worker queued generation, idempotency, and cap=2 against real
Redis without PYTHONPATH. Full merged gate: 96 tests. WS-D PR 14 local candidate
gate passed 98 tests on the prior base, with both Redis modes; still unmerged
because its failing secrets check is unexplained. UI follow-up remains open.

## Outstanding work (original audit; J item resolved above)

1. Review/gate WS-D PR 14. Latest checked GitHub checks: evidence/intake/python/
   web pass; secrets fails (run 34449294532, job 102781076787). Retried detailed
   log fetch; results-receiver EOF persists. Root cause unknown; do not assume
   a permissions issue, a harmless flake, or absence of a secret.
2. J must publish its five post-merge commits as a follow-up PR, preserving
   useful cap/bulk/link tests. Rebase onto integrated G worker fix e3332bd and
   update stale notes; final normal-worker queued proof still needed.
3. Evidence UI follow-up: downloaded patch from dev-logs is not a safe current
   delta. Status direct-entry initialization, list/link errors and completion-
   aware OCR refresh are not implemented; download control is salvageable.
4. Do not merge archive branches, old verifier alternatives, or dev-logs into
   integration. Keep them until owner authorizes retention cleanup.

Instructions posted to J PR 3. Closed duplicate PR 10 with pointer to PR 14;
no branch deletion. Product merge base remains 72e8237 for this audit; only
reconciliation documentation is added by the audit commit.

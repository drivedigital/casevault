> Historical implementation assignment: PR18 merged; original session closed. List-review note recovered as limitation only.
> No new work authorized by this brief. See ../STATUS.md and ../RECOVERY.md.

# EU-D — evidence detail-page completion

**Recommended assignee:** former W2-I/J UI-capable agent, or a fresh UI session.
One session owns ALL detail behavior; do not split the file across agents.

## Paste-ready assignment

Read `handoff/AGENT_POLICY.md` and frozen
`docs/contracts/evidence_ui_closure.md` v1.0. Your assignment is **EU-D**.
Base on latest `arena/01a0899f-casevault`, preserving existing work; stay on your
current session's assigned branch. Do not replay the stale WS-C patch.

Own only the EU-D write set in the contract. Implement:
- Direct Status-tab initialization; dirty-edit preservation during refetch;
  correct source-navigation reset; safe save/pending/error behavior.
- Explicit original download for all types with browser byte-equality proof.
- Safe PDF preview or clearly labeled fallback: attachment endpoint must not
  trigger unexpected downloads on page load. UI-only; no header/API changes.
- Detail/pages/matters/link/unlink/update failure feedback and retry.
- Honest OCR enqueue feedback, bounded 2s/120s source-state polling, terminal
  refresh, timeout/manual refresh, and cancellation on navigation/unmount.
  `queued:false` is not OCR success; stubbed PDF/image `skipped` remains valid.

Keep source API shapes and ledger/intake clients untouched. Shared hubs and all
backend/worker/dependency/CI changes require integrator approval. Use synthetic
fixtures only. Run lint/typecheck/build and targeted regression checks; label
browser tests vs structural/HTTP proof. Request test tooling rather than adding
an uncoordinated framework. If browser unavailable, give EU-V a reproducible
checklist and report limitation explicitly.

Deliver `handoff/notes/EU-D.md`, branch/base/final SHA and a NEW focused PR into
integration. Stop for review; no self-merge or next-wave feature work.

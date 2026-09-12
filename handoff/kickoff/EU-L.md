> Historical implementation assignment: PR17 merged; original session closed. OCR-review note recovered as limitation only.
> No new work authorized by this brief. See ../STATUS.md and ../RECOVERY.md.

# EU-L — evidence list resilience and accessible upload

**Recommended assignee:** former W2-F or available UI agent; independent of EU-D.

## Paste-ready assignment

Read AGENT_POLICY and `docs/contracts/evidence_ui_closure.md` v1.0. Your assignment
is **EU-L**. Start from latest integration on your existing assigned session
branch; preserve work first. Own only EU-L paths from the contract.

Implement distinct loading/empty/filtered-empty/error list states with retry;
source-attributable row mutation feedback and pending protection; upload errors
and keyboard-operable upload; matter-filter and row-badge failure feedback.
Preserve filters and input through failure/retry. Include/exclude must explicitly
clear the opposite flag. Refresh only relevant caches on success. Preserve the
bare-array client, supported filters, client-side filters, duplicates and links.

Do NOT edit detail page, shared api/types/components, backend/worker, CI or
package/lockfiles. Request hub/tooling changes through integrator. Synthetic
fixtures only. Prove list failure is not displayed as empty, retries work,
mutations fail visibly, duplicate submissions are prevented, and upload works
by keyboard. Run web lint/typecheck/build; report actual browser coverage vs
HTTP/source inspection honestly.

Deliver new focused PR + `handoff/notes/EU-L.md`, exact base/final SHA, commands,
results and remaining limitations. Merge is integrator-owned. No Wave 3 work.

# OCR-PLAN review — 2026-09-12

PR20, reviewed head61da3b422c2d2c6e3536902158e8c215fe279517. Only the authorized
handoff/notes/OCR-PLAN.md is proposed. Source/design review only; no package installs,
engine executions, compatibility tests or real-document accuracy proof performed.
**Changes requested; PR remains unmerged. No dependency/CI/engine approval.**

Direction accepted in principle: start with native PDF text, retain honest skipped
outcomes for unimplemented scanned/image OCR, preserve originals, add per-page
provenance and separate subsequent OCR fallback. Native text is not scanned OCR.

## Implementation-design gates
1. Status-based claim is unsafe: the API can set queued while an extraction runs;
   distinct ingest/OCR status guards do not serialize writes to shared pages.
   Need cross-entry ownership, attempt-conditioned commit and crash recovery.
2. Byte/page/output-char limits cannot bound decompression, parser allocations or
   time spent within parser calls. Define enforceable runtime/memory containment,
   Linux/Darwin cleanup, and preservation of old results on hard termination.
3. Reconcile true page_count on page-limit skip with old retained pages; separate
   latest-attempt status/metadata from last-successful derived dataset. Specify
   mixed native/scanned and truncated coverage so complete is not misleading.
4. Public reason must not pass through str(exc), even truncated. Arbitrary exception
   text can contain internals/evidence; use enumerated reasons and private diagnostics.
5. Installing pypdf changes existing PDF-skipped test expectations. A single CI pip
   line is not a complete test migration: list impacted tests, present/absent engine
   modes, fail-closed required proof and disjoint verifier ownership. Scanned/mixed,
   concurrency and hard-limit fixtures required for their claimed behavior.
6. Primary upstream license/version docs required; compatibility is untested.
   Zero-text count does not distinguish blank/scanned. Schema JSON capacity does
   not waive contract review. Remove contradictory timeboxes and unsupported
   implementation-ready/normative claims or explicitly mark unresolved gates.

Posted on PR20 comment5649440419: note-only followup<=45min, same PR, no self-merge.
Author may mark unresolved gates rather than manufacture guarantees. This does not
block the already-authorized limited synthetic owner preview.

## PV-GATE availability check

Owner reports PV-GATE waiting for review. Fetched all remote heads and inspected
open/recent PRs plus dev-logs54001f0. No PV-GATE PR, note or identifiable submission
is visible to this integrator. Asked for PR URL/commit SHA. Status is awaiting
artifact, NOT a failed test or completed review. Do not restart another agent or
assume closed-session recovery is needed without its actual report.

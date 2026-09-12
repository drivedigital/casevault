# OCR-PLAN — fresh-session real PDF/image extraction design

Authorized 2026-09-12, design/review ONLY. Fresh session on its OWN assigned branch.
Read STATUS.md, AGENT_POLICY.md, active closure contract, and integrated product
checkpoint a040e9f739ec3741cd28ee99756d256ea8b78d43. Confirm access first; stop if
missing. Do not reuse closed EU-D/L or write to their branches.

Write set ONLY: handoff/notes/OCR-PLAN.md. No code, dependencies, schemas, tests,
CI, shared contracts or local-ops edits. Timebox45min. No live case documents,
external document services, model calls with evidence, or environment changes.

Deliver an implementation-ready proposal (not claim implementation completed):
1. Audit both process_source and ocr_source and relevant status/page/metadata APIs.
   Explain exactly why PDF/image now skip, and distinguish born-digital PDF text
   extraction, scanned PDF/image OCR, and native PDF preview.
2. Recommend the smallest local-only vertical slice: native PDF text first vs OCR
   fallback, candidate tool/library and license/system dependencies; identify what
   needs actual compatibility checks on Python3.12, Linux and macOS. Compare at
   most two practical designs, choose one with tradeoffs; no package install.
3. Specify immutable originals, per-page provenance, repeat/idempotency semantics,
   atomic replacement of derived pages, bounded time/memory/page count, password/
   corrupt/huge document handling, cancellation/failure outcomes and cleanup.
   No success-shaped failures or false PDF skipped-to-complete claims.
4. Define synthetic acceptance matrix: digital text PDF, scanned PDF, PNG/JPEG,
   multi-page, mixed text/image, blank, corrupt/encrypted and repeated reprocess.
   Require original-byte equality and job payload+SQL/page-text+UI agreement.
5. Propose disjoint implementation/verifier write sets, API/schema compatibility,
   migration need (prefer none, do not assume), dependency approvals, review/merge
   sequence and exact minimum local test prerequisites. Estimate effort as bounded
   work packages, not calendar promises. No implementation until new contract and
   dependency/security review approved by integrator/owner.

Checkpoint/push note on assigned branch and open new review-only PR into
arena/01a0899f-casevault. No self-merge or force-push. Label source-reviewed vs
hypothesized facts, unresolved engine accuracy/security/packaging questions and
recommended next decision. This assignment does not delay the limited owner preview.

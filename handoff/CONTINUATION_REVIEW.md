# Continuation review — 2026-09-13

## Metadata recovery (no product changes)

Local HEAD had reverted to631b85a with110 apparent modified/untracked paths, while
origin integration31101e3 remained intact. Backed tracked/untracked nonignored files
and binary diff outside Git: /home/user/continue-recovery-a1cxo50p/. A temporary index
read origin31101e3 then staged the live files; tree matched EXACTLY. Only then used
mixed reset to origin integration (no file edits/deletions). Clean status confirmed.
Do not repeat reset on an unverified tree; no hard reset/clean used.

## PV-GATE/OCR artifacts merged

PR20 headb86db716bb00d42ccca8049624040485f2893747 (helper code ee30a4c) reviewed
and merged as **4bf4e2f1204f2160d62ec1ec46a159f0af4ae7ab**.
Product apps/workers/scripts/packages unchanged from a21ea34; this merge adds only
PV tests/helper/negative checks and OCR/PV notes. No engine or dependency/CI approval.

Integrator independently executed exact committed negative checks via exported files:
`PV_GATE_PYTHON=$(command -v python3) timeout 60 node /home/user/pv-review/tests/browser/pv-gate-negative-checks.mjs`
**7/7 passed, exit0**, no DB/Redis/browser. Fixed-code errors accepted; stdout overflow
killed child at1,048,576 buffered ASCII chars, stdin EPIPE safely failed; sentinel absent
from error messages/details. ASCII buffer count is not exact RSS/multibyte byte proof.
Private raw-diagnostic opt-in must remain unset in normal runs;0600 on creation does
not enforce permissions on an arbitrary pre-existing file. No universal orphan guarantee.

Author-reported v6 ordered checks7pass + browser3pass32.9s is at original product
a040e9f and an explicitly bootstrapped DB. Not an independent integrator browser rerun,
not clean-install proof. Preserve original v4 FIRST-BOOT failure1fail/2pass59.7s.
PR20 merge comment5651801542. PV/OCR delivery complete; no further writes assigned.
OCR proposal archived, unresolved contract gates in REVIEW_REVISIONS.md remain binding;
proposal's resolved/implementation-ready labels do not authorize implementation.

## First-boot product finding (open)

PV reports concurrent first use after fresh DB causes uq_users__email UniqueViolation
in get_local_user/flush, GET sources/matters500. Coordinator source correlation:
identity_service selects then inserts without conflict recovery; same implementation
at a21ea34. No independent reproduction by coordinator and no real-data leak inferred.
Two-read-only-call attempt did not reproduce (sessions close/rollback); write-committing
request overlap matters. Warming up then passing is conditional evidence, not a fix.
A reload is NOT guaranteed remediation. New BOOT-ID brief ready; owner must launch a
fresh session. Do not reuse closed agents or silently expand EU-V into product edits.

## EU-V bounded checkpoint accepted, PR19 still open

Head789390186bed3187eb65023992ad5a741d202e08, tested0b6c6139180d64664fb4b654fd211b2f6cfc470b.
Source diff versus575d771 only integration merge + note; runtime matchesa21ea34.
Author reports **2 list pass4.5s, exit0**, then **3 OCR pass22.1s, exit0**. Original
badge trace/SQL assertion and exact-row retry pass; TXT/PDF/image have two sequential
explicit distinct jobs, decoded payload+SQL/pages+UI. TXT complete1 expected text page;
PDF/image skipped/null/zero pages. Orchestration, not extraction or full acceptance.
Cleanup reportedly complete. No new coordinator runtime rerun of those EU-V cases.

Comment5651803847 next bounded scope<=45min/setup<=15, each batch<=5min/case<=120s:
A. Source-audit/correct D1.8/D4.6 pending proof, then run only2 detail cases. Exact-ID
   PATCH-only hold/release; dispatch AND completion timestamps; prove second activation
   while first unresolved;1 PATCH; committed intended values + UI. D1.8 must exercise
   actual reprocess overlap or stop claiming that coverage. Finally cleanup required.
B. ONLY if A passes, correct/run L4.1 keyboard proof: exact VISIBLE upload-button focus,
   ONE activation key, real chooser and actual uploaded-response ID/row. No hidden input
   focus, fallback activation retries or swallowed assertions. BLOCKED if chooser proof
   unavailable. Changes allowed only relevant existing verifier helpers/specs + note.
Product pina21ea34, verifier start7893901. No whole suite/D5.12/product edits/self-merge.
Existing initialized DB allowed when explicitly declared; do not relabel bootstrap race
as harness noise or silently warm up. Remaining other cases still require later gates.

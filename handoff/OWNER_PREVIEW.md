> Known limitation added2026-09-12: injected server traceback/SQL can appear
> in list error feedback. Use synthetic data only, keep diagnostic details private,
> and record this open issue; real-data/full acceptance remains held.

# Limited owner preview — explicit release, 2026-09-12

This is the renewed exact-checkpoint/checklist go-ahead for EU-M. It supersedes
the blanket hold ONLY for this limited synthetic-data owner preview. Full local
acceptance, real-evidence use and operational backup/restore work remain held.
EU-V PR19 is unmerged; no final release or OCR-engine completion is implied.

## Exact product and purpose
Test a040e9f739ec3741cd28ee99756d256ea8b78d43 from integration
arena/01a0899f-casevault. Later integration changes so far are documentation only.
Do not merge EU-V or local-ops0159466 into the preview. Record git rev-parse HEAD
and local diff; if newer docs are present verify product paths match this SHA.
Purpose: owner sees integrated evidence/ledger/review workflow and records native
browser behavior. PDF/image extraction is NOT implemented; skipped is expected.

## Safety preflight (10-minute cap; REQUIRED before launch)
- Preserve existing checkout/work. Use a separate clean testing checkout/workflow
  consistent with the local agent's branch restrictions; no dirty reset or takeover.
- Identify and confirm ownership of a NEW disposable database, storage directory,
  Redis queue instance and unique service ports. Configure API and worker for the
  SAME disposable targets. Verify actual resolved configuration privately; never
  print credentials or publish env files. Do not rely on database name alone.
- Keep any real case database/storage and existing workers untouched. If isolation
  or process ownership cannot be proved, STOP/BLOCKED rather than run the preview.
- Apply upgrade-head migrations only to that new database. Do NOT run verify_all,
  pytest/make test, downgrade, blanket cleanup, collect_logs --push, make backup,
  or unmerged local-ops/EU-V setup scripts. No workaround for an approval block.
- Use supported installed Python/Node and normal worker launcher; on Darwin verify
  SpawnWorker. No GSS/TLS/Objective-C/PYTHONPATH bypass. No Python-version churn.
- Local browser only, no tunnel/exposed real-evidence endpoints. Browser uses
  relative API URLs/proxy to the selected API port. Never disturb another service
  to free a port. Record browser/Python/RQ versions and tested SHA.

If preflight passes, proceed now; waiting for final EU-V acceptance is NOT required
for this preview. If it fails, report the exact blocker and keep testing held.

## Preview checklist (20–30 minutes; synthetic fixtures only)
1. Evidence: upload a short unique TXT, a one-page PDF with known text and a PNG.
   Capture uploaded IDs, confirm rows and duplicate warning after one deliberate
   duplicate. Avoid changing any pre-existing source. Record actual outcomes.
2. Details/downloads: opening sources must not unexpectedly download originals.
   Download each original explicitly; compare bytes/hash to fixture. Try opt-in
   PDF preview in actual native browser, dismiss/reopen, navigate away/back.
   Record rendering or explicit fallback; native rendering is not OCR extraction.
3. Status: direct entry initializes title/status; edit and save one synthetic
   source, refresh to confirm; navigate to another and check draft reset.
   Include/exclude must remain exclusive; source↔matter linking should persist.
4. OCR: wait for initial upload processing to settle. For EACH TXT and PDF click
   Reprocess OCR twice sequentially, waiting for terminal state between clicks.
   Record job IDs, actual RQ return payload, SQL/page state and visible outcome.
   TXT complete/one text page; PDF skipped with stub reason. Never call RQ FINISHED
   alone success; ocr_source may return status=failed. Per-job wait<=120s; stop if
   unconfirmed rather than enqueueing again. Confirm worker survives/no matching
   new native crash and original files unchanged. Do not expect extracted PDF text.
5. Optional if time remains: synthetic ledger entry, export CSV, open review inbox.
   Absence of generated proposals without configured inputs/providers is not by
   itself a product defect; do not send case content to an external provider.

## Report and stop
Use PASS/FAIL/BLOCKED/NOT RUN per case. Include exact SHA, runtime, commands,
manual vs automated/injected classification, minimal reproductions, fixture-only
job/source IDs and compact redacted evidence. Missing evidence remains missing.
No product/dependency fixes by EU-M. Return report via established redacted report
workflow/approved attachment; no raw backup, .env*, secrets or data/ Git commits.
Stop only owned preview processes; preserve needed synthetic diagnostic state until
review, then remove only positively identified disposable resources. Record cleanup.
No unattended retries/long suites. A real safety failure or matching worker crash
pauses the preview and is escalated immediately. Full acceptance remains separate.

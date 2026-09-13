> Current2026-09-12: EU-ERR merged a21ea34, independently119+25 green. EU-V575d771
> corrections accepted, bounded2 list then conditional3 OCR cases authorized. OCR R2
> accepted as proposal/parked; PV sole PR20 writer fixing diagnostic echo. Details
> REVIEW_REVISIONS.md / STATUS.md override historical task labels below.

# Backlog — current as of 2026-09-12

Legend: [x] implemented/integrated (not necessarily final browser/native acceptance),
[~] active, [ ] pending, [HOLD] explicitly paused. STATUS.md owns current assignments;
WORKLOG.md preserves historical merge/gate evidence. No new feature wave is authorized.

## Now — evidence closure and safe delivery

- [x] EU-D detail lifecycle/downloads/errors/abortable OCR watch merged c8c7d27.
- [x] EU-L list/error/keyboard affordance and upload/row retry guards merged a040e9f.
- [x] Independent D+L gate119/no skips and browser43/2 worker-only skips recorded.
- [x] Closed-session D/L review notes recovered from dev-logs54001f0; limitation
  reports only, not completed independent reviews or code to replay.
- [x] EU-V PR19 short batch3c405cf: T1 + corrected background-refetch L1.5
  each reported1 pass; integrator source-reviewed only, no full acceptance.
- [x] EU-V e7fe31e bounded list batch reported1 pass/1 fail; no acceptance.
- [ ] EU-ERR: fix list raw error-detail disclosure with focused regression (fresh brief ready).
- [~] EU-V next: supported RQ result reader + bounded async polling, then real
  TXT/PDF explicit OCR proof; original badge regression waits for product fix.
- [ ] EU-V six list-failure groups classified with valid setup/locators/assertions.
- [ ] EU-V detail save-race candidate proven or refuted using actual overlap timing.
- [ ] EU-V integrated OCR job/payload/SQL/UI evidence using correct RQ result API,
  shipped enums and uploaded IDs; explicit OCR reprocess, not TXT inline ingest.
- [ ] Final combined browser acceptance after valid bounded reruns; no additive
  pass counts across partial runs and no silent missing/skipped acceptance cases.
- [~] Limited EU-M synthetic owner preview authorized at a040e9f after mandatory
  isolation preflight; OWNER_PREVIEW.md is exact checklist. Full acceptance held.
- [~] PV-GATE319120e located inside PR20/61da3b4; bridge deadline/redaction/
  cleanup-report corrections requested, scoped3-test rerun after correction.
- [~] OCR-PLAN PR20/61da3b4 reviewed; note-only revisions requested for safety/
  concurrency/state/CI gates. No engine implementation or dependency approval.
- [ ] Fresh independent review sessions only if assigned with access confirmed.
  Retired D/L sessions must not be reused; fresh sessions own fresh assigned branches.

## Operational safety — separate proposal, not merged

- [ ] Review local-ops0159466: preserve embedded socket test targets safely while
  refusing application fallbacks/overrides; add HTTP webhook validation tests.
- [HOLD] Local-ops follow-up edits until normal approval is available; no bypass.
- [ ] Backup safety corrections: no DSN disclosure, complete validated dump/archive,
  private permissions, no success on missing dump. Actual restore drill unperformed.
- [ ] Destructive gate/fixture target protection enforced in code (currently only
  operational precautions; docs alone do not fix unsafe application fallbacks).
- [ ] Diagnostic collector safe export/redaction workflow; automatic --push not used.
- [ ] Webhook/macOS LaunchAgent end-to-end behavior independently verified when
  separately authorized; machine setup reports are not evidence-UI acceptance.
- [x] Recovery/verification runbooks and current status consolidated; historical
  hard-reset/force-push and automatic bundle-push instructions removed from entry points.

## Integrated foundations and core product

- [x] Local-first ignore/env conventions, workspace bootstrap, matters/proceeding
  overlays, actors/aliases/roles, migrations0001–0002.
- [x] Evidence sources/storage/dedupe/pages/linking, migration0003.
- [x] Excerpt CRUD + per-source reprocess (W2-EV); text ingests inline.
- [x] Ledger CRUD/filter/CSV/bulk API and /ledger UI.
- [x] Proposal review/trusted facts/linking/generation API and /ai-review UI.
- [x] Unified intake schema migration0004 (not a second proposals migration0005).
- [x] W2-G worker import fix; W2-J intake verifier reconciled15174cd.
- [x] WS-D evidence verifier57e5ae6; W2-W worker model/RQ compatibilityf9e6a1c.
- [x] CI python/web/secrets/intake/evidence jobs; latest verified push0788ccc green.
- [x] Scaffold backup/diagnostic tools exist; **not** validated backup/recovery assurance.

## Deferred core gaps — not assigned

- [ ] Real PDF/image OCR engine (current skipped stub); VLM/provider wiring.
- [ ] GET /sources pagination and server-side filter parity (status/OCR/flags);
  search currently title-only; source array client shape stays frozen until approved.
- [ ] Streaming uploads instead of whole-file buffering (100MB guard exists).
- [ ] Source metadata update endpoint; verify need against existing schema before scope.
- [ ] Storage interface/S3 adapter; no second storage implementation replay.
- [ ] Workspace switcher, auth/invitations, multi-user permissions/hardening.
- [ ] Verification-task scheduler, ledger-to-claims links.
- [ ] Chronology/event model, claim chart; no migration reserved by this backlog.

## Deferred intelligence and output

- [ ] Proof graph, claim templates, gap detection, hybrid search/pgvector.
- [ ] Contradiction analysis, relief/research libraries, multi-agent review, MCP adapters.
- [ ] Drafting, PDF exports, graph UI, performance, collaboration, advanced bulk UX.

No main release, archive/branch deletion, real-evidence test, dependency/CI expansion,
or OCR-engine work follows automatically from checking an implementation item done.

Latest review: BATCH_REVIEW_2026_09_12.md. EU-ERR PR21/b78fa82 awaiting narrow
safe-text expectation alignment; EU-V5e925be decoded OCR proof reported, remaining
helper/coverage corrections and full acceptance pending. OCR-PLAN2b6688a is the
original proposal, not resolution of prior design gates. No merge in this batch.

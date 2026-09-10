# Contract — Wave 2: intake core (source ledger + proposal review + trusted facts)

**Version:** 1.0 · **Status:** **FROZEN** 2026-09-10 · **Scope owner:** integrator
(`arena/01a0899f-casevault`) · **Rules:** `handoff/AGENT_POLICY.md`

Implements Roadmap Sprints 4 (source ledger) and 5 (proposal review inbox /
fact intake), which share **one** Alembic migration in the schema draft
(Migration 004 — intake core).

Spec sources: `Legal_Matter_Intelligence_Database_Schema_Draft.md` §5.8–5.13,
§6.5, §9 (Migration 004) · `Technical_Spec.md` §9.1, §10.1, §17.1 ·
`UX_Spec.md` Screen 5 (inspector tabs), Screen 6 (review inbox), Screen 7
(facts index) · `PRD.md` §10.4, §10.5 · `handoff/DECISIONS.md` (review-state
floor, AI-sharing default).

---

## 1. Workstreams and write sets

| WS | Deliverable | Owns (write) | Depends on |
|---|---|---|---|
| **E** | migration `0004` + models + router registration | `apps/api/alembic/versions/0004_*.py`, `apps/api/app/models/intake.py`, `app/models/enums.py` (append), `app/models/__init__.py`, `app/main.py`, `app/routers/{ledger,proposals,facts}.py` (empty routers), `tests/api/conftest.py`, `tests/api/test_intake_schema.py` | — (**critical path**) |
| **F** | ledger API, filters, CSV import/export, bulk ops | `app/schemas/ledger.py`, `app/services/ledger_service.py`, `app/services/ledger_csv.py`, `app/routers/ledger.py` (fill E's stub), `tests/api/test_ledger.py` | E |
| **G** | proposal review + fact intake + links + proposal generation job | `app/schemas/intake.py`, `app/services/proposal_service.py`, `app/services/fact_service.py`, `app/routers/proposals.py`, `app/routers/facts.py` (fill E's stubs), `workers/pipeline/intake_jobs.py`, `tests/api/test_intake_review.py`, `tests/workers/test_intake_jobs.py` | E |
| **H** | `/ledger` UI + nav entry | `apps/web/app/ledger/**`, `apps/web/components/ledger-*.tsx`, `apps/web/components/nav.tsx`, `apps/web/lib/{api,types}.ts` (append-only sections) | contract only |
| **I** | `/ai-review` inbox + facts tab | `apps/web/app/ai-review/**`, `apps/web/components/review-*.tsx`, `apps/web/lib/{api,types}.ts` (append-only sections) | contract only |
| **J** | end-to-end verification + CI job | `scripts/intake_smoke.py`, `tests/integration/test_intake_e2e.py`, `.github/workflows/ci.yml` (append job) | E, F, G |
| **EV** | evidence follow-ups from the Sprint 3 delta table (run by the Sprint 3 author) | `app/schemas/source.py` (append excerpt schemas), `app/services/source_service.py` (append), `app/routers/sources.py` (append), `workers/pipeline/jobs.py` (per-source reprocess), `tests/api/test_source_excerpts.py` | — (parallel, conflict-free) |

Merge order: **E → (F ∥ G, H ∥ I) → J**. EV merges whenever green; it must not
change an existing response shape (§10).

---

## 2. Migration `0004` (revision `0004`, `down_revision = '0003'`) — WS-E

New enums (Postgres type names must match exactly):

| Python enum | PG type | Values |
|---|---|---|
| `ProposalType` | `proposal_type_enum` | `fact, event, actor, duplicate_merge, date_normalization, claim_mapping, contradiction, verification_task, restriction` |
| `ReviewState` | `review_state_enum` | `proposed, accepted, accepted_with_edits, rejected, deferred, uncertain, superseded, disputed` |
| `FactType` | `fact_type_enum` | `source_derived, user_entered, testimony, procedural, damage, other` |
| `SupportType` | `support_type_enum` | `supports, contradicts, mentions, background` |
| `StrengthLabel` | `strength_label_enum` | `low, medium, high` |

### `ledger_entries` (schema draft §6.5)
`id` UUID PK · `workspace_id` FK CASCADE not null · `matter_id` FK CASCADE null ·
`external_ledger_id` VARCHAR(64) null · `date_start`/`date_end` DATE null ·
`date_text_raw` TEXT null · `fact_short_name` VARCHAR(255) not null ·
`fact_statement` TEXT not null · `claim_use_text` TEXT null ·
`relief_use_text` TEXT null · `source_path_text` TEXT null ·
`source_locator_text` TEXT null · `source_status` `source_status_enum` null ·
`authentication_or_witness` TEXT null · `confidence_level`
`strength_label_enum` null · `verification_task_text` TEXT null ·
`restrictions_or_notes` TEXT null · `linked_source_id` FK `sources` SET NULL
null · `tags_json` JSONB not null default `'[]'` · `created_at`/`updated_at`.

Constraints/indexes: partial unique `(matter_id, external_ledger_id)` where
`external_ledger_id IS NOT NULL`; index `(matter_id, date_start)`;
`(workspace_id, source_status)`.

> **`tags_json` is a deliberate extension** to the schema draft (its ledger
> table has no tag column, but PRD §10.4 requires tag filters + bulk tagging).
> Stored as a JSON array of short strings; validated in the service layer.
> Recorded in `DECISIONS.md` when E merges.

### `proposals` (schema draft §6.5)
`id` UUID PK · `workspace_id` FK CASCADE not null · `matter_id` FK CASCADE null ·
`proposal_type` `proposal_type_enum` not null · `review_state`
`review_state_enum` not null default `proposed` · `title` VARCHAR(255) null ·
`proposed_text` TEXT null · `proposed_structured_json` JSONB not null default
`'{}'` · `source_id` FK `sources` CASCADE null · `excerpt_id` FK
`source_excerpts` SET NULL null · `confidence_score` NUMERIC(5,4) null ·
`created_by_system` BOOLEAN not null default `true` · `created_by_user_id` FK
`users` null · `reviewed_by_user_id` FK `users` null · `reviewed_at` TIMESTAMPTZ
null · `review_notes` TEXT null · `created_at`/`updated_at`.
Indexes: `(matter_id, review_state)`, `(proposal_type, review_state)`,
`(source_id)`.

### `fact_assertions` (schema draft §6.5)
`id` UUID PK · `workspace_id` FK CASCADE not null · `matter_id` FK CASCADE not
null · `short_label` VARCHAR(255) null · `statement_text` TEXT not null ·
`review_state` `review_state_enum` not null default `proposed` ·
`confidence_level` `strength_label_enum` null · `fact_type` `fact_type_enum` not
null default `source_derived` · `is_material` BOOLEAN not null default `false` ·
`created_from_proposal_id` FK `proposals` SET NULL null · `created_by_user_id`
FK `users` null · `approved_by_user_id` FK `users` null · `approved_at`
TIMESTAMPTZ null · `supersedes_fact_id` self-FK SET NULL null ·
`created_at`/`updated_at`. Indexes: `(matter_id, review_state)`,
`(workspace_id, is_material)`.

### `fact_source_links` / `fact_actor_links` (schema draft §6.5)
`fact_source_links`: `id` PK · `fact_id` FK `fact_assertions` CASCADE ·
`source_id` FK `sources` CASCADE · `excerpt_id` FK `source_excerpts` SET NULL
null · `support_type` `support_type_enum` not null default `supports` ·
`strength` `strength_label_enum` null · `notes` TEXT null · `created_at`;
unique `(fact_id, source_id, excerpt_id, support_type)` — **use
`NULLS NOT DISTINCT`** (Postgres 15+) so two excerpt-less links with the same
support type cannot duplicate.
`fact_actor_links`: `id` PK · `fact_id` FK CASCADE · `actor_id` FK `actors`
CASCADE · `role_in_fact` VARCHAR(64) null · `created_at`; unique
`(fact_id, actor_id, role_in_fact)` (same `NULLS NOT DISTINCT` treatment).

### Deferred (do not add)
Full-text GIN indexes on `statement_text` (Sprint 10), embedding columns,
`verification_task` rows (Sprint 6+ uses `ledger_entries.verification_task_text`
and proposals of type `verification_task`), audit rows (Migration 010),
soft-delete columns for facts.

---

## 3. Ledger API (WS-F), `/api/v1`

List endpoints introduced by this wave use the envelope
`{"items": [...], "total": int, "limit": int, "offset": int}` (limit ≤ 200,
default 50) — the shape `sprint3_evidence.md` proposed before the evidence
module shipped a bare array. `GET /sources` is **not** changed by this wave.

### 3.1 `ledger_entries`
```
GET    /ledger-entries            filters: matter_id, workspace_id, q
                                  (fact_statement/fact_short_name/external_ledger_id),
                                  source_status, confidence_level, tag,
                                  has_verification_task (bool), limit, offset
POST   /ledger-entries            201 → LedgerEntryOut
GET    /ledger-entries/{id}       → LedgerEntryOut
PATCH  /ledger-entries/{id}       partial update (all §2 columns except id/workspace)
DELETE /ledger-entries/{id}       204 — ledger rows are user work product;
                                  facts/evidence are never deleted through this route
POST   /ledger-entries/{id}/link-source   {source_id} → LedgerEntryOut
POST   /ledger-entries/bulk       {ids: [...], patch: {tags?, source_status?,
                                  confidence_level?, matter_id?}} → {updated, skipped, errors}
GET    /ledger-entries/export.csv same filters → text/csv (RFC 4180, UTF-8,
                                  header row, ISO-8601 dates)
POST   /ledger-entries/import     multipart CSV (field `file`) or JSON
                                  {rows: [...]}; query/body flag `dry_run` (default false)
                                  → {valid, created, skipped, errors: [{row, error}]}
```
`LedgerEntryOut` = every §2 column + `tags: string[]` (from `tags_json`) +
`linked_source: {id, title} | null`.

CSV columns (export order; import matches by header, unknown columns ignored):
`external_ledger_id, date_start, date_end, date_text_raw, fact_short_name,
fact_statement, claim_use_text, relief_use_text, source_path_text,
source_locator_text, source_status, authentication_or_witness,
confidence_level, verification_task_text, restrictions_or_notes, tags`
(`tags` is `;`-separated inside the single cell).

Import rules: `fact_statement` required (row error if blank); invalid enums or
dates → row error, row skipped, import continues; duplicate
`external_ledger_id` within the same matter → row error (unless the incoming row
is identical, then `skipped`); `dry_run=true` validates and reports without
writing; a malformed header → 422 with the expected column list.

---

## 4. Intake API (WS-G), `/api/v1`

### 4.1 Review-state floor (non-negotiable)

**No endpoint in this wave creates or leaves a fact in `accepted` unless the
request is an explicit approval action.** Concretely:

- `POST /proposals`, `POST /proposals/{id}/review (accept|accept_with_edits)`,
  `POST /proposals/generate`, and `POST /facts` all produce facts with
  `review_state = 'proposed'`.
- `POST /facts/{id}/approve` is the only route that sets `accepted` (and stamps
  `approved_by_user_id` + `approved_at`).
- Clients cannot set `review_state`, `approved_*`, `supersedes_fact_id`, or
  `created_from_proposal_id` in any create/patch body — unknown/forbidden fields
  are rejected with 422, not ignored.
- `GET /facts?review_state=accepted` is the trusted set that chronology/claims
  will read (Sprint 6+). Everything else is explicitly untrusted.

### 4.2 Proposals
```
GET    /proposals              filters: matter_id, proposal_type, review_state,
                               source_id, min_confidence, limit, offset
POST   /proposals              201 (manual proposal; created_by_system=false)
GET    /proposals/{id}         → ProposalOut
PATCH  /proposals/{id}         title, proposed_text, proposed_structured_json,
                               confidence_score (only while review_state=proposed)
POST   /proposals/{id}/review  {action: accept | accept_with_edits | reject |
                               defer | uncertain | dispute,
                               edits?: {statement_text, short_label, fact_type,
                                        confidence_level, is_material, matter_id},
                               review_notes?} → {proposal, fact|null}
POST   /proposals/bulk-review  {ids, action, review_notes?} →
                               {results: [{id, ok, error?}], created_facts}
POST   /proposals/generate     {source_id, max_proposals?} → {created, skipped}
                               (runs the generation job; can enqueue when redis
                               is present, otherwise inline for text sources)
```
`review` semantics: `accept` / `accept_with_edits` set the proposal to that
state, stamp `reviewed_by_user_id`/`reviewed_at`, and create a `fact_assertions`
row with `review_state='proposed'`, `created_from_proposal_id`, `matter_id`
(proposal's, or `edits.matter_id`), `statement_text` = `edits.statement_text` ??
`proposed_text` (422 if both empty). `reject` / `defer` / `uncertain` / `dispute`
only update the proposal. Re-reviewing a proposal that is not `proposed`/
`deferred`/`uncertain` → 409. Bulk review is **partial-success** (per-id results,
never all-or-nothing).

`ProposalOut` = all §2 columns + `source: {id, title} | null`,
`excerpt: {id, page_start, page_end, locator_text} | null`,
`created_fact_id: uuid | null` (derived by lookup on
`created_from_proposal_id`).

### 4.3 Facts
```
GET    /facts                  filters: matter_id, review_state (repeatable),
                               fact_type, is_material, q (statement_text),
                               limit, offset
POST   /facts                  201, always review_state=proposed
GET    /facts/{id}             → FactOut
PATCH  /facts/{id}             short_label, statement_text, fact_type,
                               confidence_level, is_material (never review_state)
POST   /facts/{id}/approve     → accepted + approved_by/at (409 if already accepted)
POST   /facts/{id}/review-state {review_state: rejected | deferred | uncertain |
                               disputed | accepted_with_edits | superseded,
                               notes?} (409 for `accepted` here and for
                               re-transitioning a superseded fact)
POST   /facts/{id}/supersede   {statement_text, short_label?, fact_type?,
                               confidence_level?} → {old_fact, new_fact}
                               (new fact `proposed`, `supersedes_fact_id` set,
                               old fact → `superseded`)
POST   /facts/{id}/source-links {source_id, excerpt_id?, support_type?,
                               strength?, notes?} → 201 (409 on duplicate tuple)
GET    /facts/{id}/source-links
DELETE /fact-source-links/{id}  204
POST   /facts/{id}/actor-links  {actor_id, role_in_fact?} → 201 (409 duplicate)
GET    /facts/{id}/actor-links
DELETE /fact-actor-links/{id}   204
```
`FactOut` = all §2 columns + `source_links: [...]`, `actor_links: [...]`,
`created_from_proposal: {id, proposal_type} | null`.

### 4.4 Proposal generation job (WS-G)
`workers/pipeline/intake_jobs.py`:

```python
def generate_fact_proposals(source_id: str, workspace_id: str, max_proposals: int = 50) -> dict
def enqueue_proposal_generation(source_id: str, workspace_id: str) -> dict  # {"queued": bool, "job_id": str|None, "reason": str|None}
```
Behavior: read the source's pages (text pages only); split into paragraphs
(blank-line separated, ≤ 1200 chars, trim); skip paragraphs < 40 chars and
paragraphs whose sha1 is already recorded under
`proposed_structured_json["provenance_key"]` for that source (idempotent
re-runs); create `proposals` rows (`proposal_type=fact`, `review_state=proposed`,
`created_by_system=true`, `source_id`, `confidence_score` left null, `title` =
first 80 chars); cap at `max_proposals`; never raise out of the job; return
`{"job": "generate_fact_proposals", "status": "complete|failed", "created": n,
"skipped": n, "reason": str|None}`. No redis required for the inline path.

---

## 5. Web (WS-H, WS-I)

### 5.1 `/ledger` (WS-H) — Screen 4-analogue for the source ledger
- Left: filters (matter, source status, confidence, tag, has verification task,
  free-text search), saved view is out of scope v1.
- Center: sortable table (TanStack Table) — ID, date, short name, statement,
  claim use, source/locator, status, confidence, verification, tags.
- Right: detail drawer — edit all fields, link to a source (`linked_source_id`),
  delete row, per-row save.
- Actions: New row, CSV import (file picker → `dry_run` preview with row errors
  → confirm), CSV export (respects active filters), bulk select → bulk tag /
  status / confidence.
- Empty state copy per UX spec (Screen 4/ledger): “Add your first ledger row or
  import a CSV to start the evidence log.”
- Nav: add `{ href: "/ledger", label: "Ledger" }` **after** Evidence in
  `components/nav.tsx` (WS-H owns nav.tsx this wave).

### 5.2 `/ai-review` (WS-I) — Screen 6 inbox + Screen 7 facts tab
- Two tabs: **Inbox** (proposal queue) and **Accepted facts** (trusted set).
- Inbox: filters (type, matter, review state, source, min confidence), card feed
  (type badge, matter, source anchor link to `/evidence/{id}`, proposed text,
  confidence, linked actors/dates when present in `proposed_structured_json`),
  action bar per card (Accept, Accept with edits, Reject, Defer, Uncertain),
  bulk select with the same actions, and a “Generate proposals from a source”
  control (`POST /proposals/generate`).
- Facts tab: table of facts with `review_state` + confidence + material flag;
  row action **Approve** (the only route to `accepted`), plus reject/defer/
  dispute and “Supersede…” with a replacement statement.
- Empty states: inbox — “No proposals waiting. Generate proposals from a source
  or add one manually.”; facts — “No facts yet. Accept a proposal to create one.”
- The UI must never imply a fact is trusted before `Approved` — show
  `proposed` distinctly (badge + copy) per the review-state floor.

### 5.3 Types + client additions (append-only)
`types.ts`: `LedgerEntry`, `LedgerEntryPage`, `LedgerImportResult`,
`ProposalType`, `ReviewState`, `FactType`, `SupportType`, `StrengthLabel`,
`Proposal`, `ProposalPage`, `Fact`, `FactPage`, `FactSourceLink`,
`FactActorLink`, plus const arrays for the enums (`PROPOSAL_TYPES`,
`REVIEW_STATES`, `FACT_TYPES`, `SUPPORT_TYPES`, `STRENGTH_LABELS`).
`api.ts`: `listLedgerEntries`, `createLedgerEntry`, `updateLedgerEntry`,
`deleteLedgerEntry`, `linkLedgerSource`, `bulkLedger`, `importLedger`,
`ledgerExportUrl`, `listProposals`, `createProposal`, `reviewProposal`,
`bulkReviewProposals`, `generateProposals`, `listFacts`, `getFact`,
`updateFact`, `approveFact`, `setFactReviewState`, `supersedeFact`,
`addFactSourceLink`, `deleteFactSourceLink`, `addFactActorLink`,
`deleteFactActorLink`.

---

## 6. Evidence follow-ups (WS-EV, parallel)

Fills the Sprint 3 delta table (`docs/contracts/sprint3_evidence.md`), without
changing any existing response shape:
```
POST   /sources/{id}/excerpts    {page_start?, page_end?, locator_text?,
                                 excerpt_text?, excerpt_type, anchor_json?}
                                 → 201 SourceExcerptOut
GET    /sources/{id}/excerpts    → list[SourceExcerptOut]
DELETE /source-excerpts/{id}     204
POST   /sources/{id}/reprocess   {stages: ["ingest"|"ocr"]} → 202
                                 {queued: bool, job_id: str|null, reason: str|null}
```
(`excerpt_type` values: `quote, region, timestamp, bates, paragraph, other`.)
`fact_source_links.excerpt_id` points at these rows; WS-G treats a missing
excerpt as valid (`null`).

---

## 7. Verification requirements

| WS | Proof |
|---|---|
| E | fresh DB: `upgrade head → downgrade base → upgrade head` (all five tables + enum drops verified); `test_intake_schema.py` asserts tables, constraints (`NULLS NOT DISTINCT` uniques), and enum values |
| F | ledger CRUD + filters; CSV export → import round-trip equality; malformed CSV row errors; `dry_run` writes nothing; bulk patch partial success; ledger rows scoped to workspace |
| G | floor-rule tests: every route that can create a fact leaves it `proposed`; only `/approve` yields `accepted`; forbidden-field rejection (422); proposal review transitions incl. 409 cases; bulk partial success; link uniques (409); generation job idempotent on re-run |
| H | `npm run lint|typecheck|build`; walk: create/edit/delete row, import preview with a bad row, export respects filters, bulk tag |
| I | same web gates; walk: accept → fact appears `proposed` in Facts tab → Approve → `accepted`; reject/defer; bulk action; generation from a text source |
| J | `scripts/intake_smoke.py` end-to-end on a real DB: upload text source → generate proposals → review/accept → fact `proposed` → approve → `accepted` → link source/actor → ledger CSV round-trip; CI job runs it |
| EV | excerpt create/list/delete round-trip; `reprocess` returns `queued:false` without redis and does not change existing responses |

---

## 8. Change control

Frozen once Wave 2 starts. Additive changes (new optional field/endpoint) →
version 1.x, announced to all workstreams by the integrator. Anything that
renames or reshapes an existing field, path, or status value → version 2.0,
sequenced by the integrator, affected workstreams rebase. Requests go to the
integrator with the section number and the minimum change needed
(`AGENT_POLICY.md` §4.1) — never as a silent divergence.

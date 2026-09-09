# Legal Matter Intelligence Workspace — Database Schema Draft

**Status:** Draft schema specification for implementation planning  
**Companion documents:**
- `Legal_Matter_Intelligence_PRD.md`
- `Legal_Matter_Intelligence_Roadmap.md`
- `Legal_Matter_Intelligence_Technical_Spec.md`
- `Legal_Matter_Intelligence_UX_Spec.md`

**Database target:** PostgreSQL  
**ORM target:** SQLAlchemy 2.x  
**Migration tool:** Alembic  
**Vector support:** pgvector  
**Primary key strategy:** UUID

---

## 1. Purpose

This document turns the technical specification into a migration-ready schema draft. It is intended to guide:

- first database setup
- SQLAlchemy model design
- Alembic migration planning
- constraint/index choices
- enum definitions
- sample seed data shape for early testing

This is still a planning artifact. It is **not** implementation code yet.

---

## 2. Schema Design Principles

1. **Reviewed facts are first-class records**  
   Do not collapse raw sources, proposals, facts, and events into one table.

2. **Relational clarity over premature graph complexity**  
   Use explicit join tables for core legal-analysis relationships.

3. **Auditability matters**  
   Keep timestamps, review states, provenance, and approval paths visible.

4. **Multiple linked matters are a core assumption**  
   A workspace contains multiple matters and proceedings with overlap.

5. **External AI and connector workflows must be reviewable**  
   Track what was imported, what was suggested, and what was approved.

6. **Local-first legal evidence handling**  
   Store file metadata and storage keys, but not assume cloud storage.

---

## 3. PostgreSQL Extensions and Global Setup

## 3.1 Recommended extensions

Enable the following at database setup time:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
```

### Why
- `pgcrypto`: UUID generation helpers if desired
- `vector`: embeddings for semantic search
- `citext`: case-insensitive email/name-style fields

---

## 3.2 Naming conventions

### Tables
- plural snake_case: `fact_assertions`, `claim_elements`

### Columns
- snake_case
- foreign keys named `{table_singular}_id`
- timestamps as `created_at`, `updated_at`
- soft delete where needed as `archived_at` or `deleted_at`

### Constraints
Recommended names:
- `pk_<table>`
- `fk_<table>__<column>__<targettable>`
- `uq_<table>__<column1>__<column2>`
- `ix_<table>__<columns>`
- `ck_<table>__<rule>`

---

## 4. Shared Column Conventions

## 4.1 Base field recommendations

Most primary tables should include:
- `id UUID PRIMARY KEY`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### SQLAlchemy note
Use either:
- DB-level defaults plus application updates, or
- ORM-level auto-update hooks

---

## 4.2 String/text guidance

- short labels/titles: `VARCHAR(255)` or `TEXT` depending on flexibility
- narrative or statement fields: `TEXT`
- structured optional payloads: `JSONB`
- enumerated states: PostgreSQL enum or constrained text

### Recommendation
Use PostgreSQL enums for stable domain states and text for user-defined labels.

---

## 4.3 Date handling guidance

Where date precision matters, prefer:
- `date_start DATE NULL`
- `date_end DATE NULL`
- `date_text_raw TEXT NULL`
- `date_precision <enum>`

This supports:
- exact dates
- ranges
- approximate dates
- unresolved raw date text

---

## 5. Enum Definitions

Below are recommended initial enums.

## 5.1 `workspace_role_enum`
- `owner`
- `reviewer`
- `commenter`
- `viewer`
- `editor_limited`

## 5.2 `matter_type_enum`
- `merits`
- `proceeding`
- `research`
- `other`

## 5.3 `matter_status_enum`
- `active`
- `planned`
- `hold`
- `archived`

## 5.4 `actor_type_enum`
- `person`
- `entity`
- `court`
- `agency`
- `other`

## 5.5 `source_type_enum`
- `pdf`
- `image`
- `email`
- `text`
- `markdown`
- `spreadsheet`
- `note`
- `other`

## 5.6 `source_status_enum`
- `primary`
- `derived`
- `testimony`
- `working_note`
- `public_record`

## 5.7 `evidence_review_status_enum`
- `uploaded`
- `processing`
- `reviewed`
- `cited`
- `included`
- `excluded`
- `duplicate`
- `privileged`
- `settlement_restricted`
- `background_only`
- `impeachment_only`

## 5.8 `proposal_type_enum`
- `fact`
- `event`
- `actor`
- `duplicate_merge`
- `date_normalization`
- `claim_mapping`
- `contradiction`
- `verification_task`
- `restriction`

## 5.9 `review_state_enum`
- `proposed`
- `accepted`
- `accepted_with_edits`
- `rejected`
- `deferred`
- `uncertain`
- `superseded`
- `disputed`

## 5.10 `fact_type_enum`
- `source_derived`
- `user_entered`
- `testimony`
- `procedural`
- `damage`
- `other`

## 5.11 `support_type_enum`
- `supports`
- `contradicts`
- `mentions`
- `background`

## 5.12 `strength_label_enum`
- `low`
- `medium`
- `high`

## 5.13 `date_precision_enum`
- `exact`
- `range`
- `approximate`
- `unknown`

## 5.14 `claim_support_status_enum`
- `no_support`
- `weak_support`
- `moderate_support`
- `strong_support`
- `conflicted`
- `not_researched`

## 5.15 `authority_link_type_enum`
- `controlling`
- `persuasive`
- `background`
- `open_question`

## 5.16 `relief_type_enum`
- `damages`
- `injunction`
- `preservation`
- `accounting`
- `inspection`
- `access`
- `leave_to_sue`
- `case_management`
- `other`

## 5.17 `task_priority_enum`
- `P0`
- `P1`
- `P2`
- `P3`

## 5.18 `task_status_enum`
- `open`
- `in_progress`
- `blocked`
- `done`
- `canceled`

## 5.19 `task_type_enum`
- `verification`
- `research`
- `drafting`
- `evidence_follow_up`
- `claim_gap`
- `bug`
- `feature`
- `connector_review`
- `other`

## 5.20 `authority_type_enum`
- `case`
- `statute`
- `rule`
- `jury_instruction`
- `memo`
- `note`

## 5.21 `sharing_policy_enum`
- `no_ai`
- `local_only`
- `external_excerpts_only`
- `external_selected_full_documents`

## 5.22 `agent_run_status_enum`
- `queued`
- `running`
- `completed`
- `failed`
- `partial`
- `canceled`

## 5.23 `connector_type_enum`
- `mcp`
- `native`
- `filesystem`
- `knowledge_base`
- `research_source`

## 5.24 `connector_scope_enum`
- `evidence`
- `research`
- `both`

## 5.25 `connector_result_type_enum`
- `source_candidate`
- `authority_candidate`
- `note_candidate`
- `metadata_hit`

---

## 6. Core Tables

# 6.1 Users, Workspaces, and Memberships

## Table: `users`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| email | CITEXT | no |  | unique |
| display_name | VARCHAR(255) | no |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints / indexes
- `pk_users`
- `uq_users__email`

---

## Table: `workspaces`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| name | VARCHAR(255) | no |  |  |
| jurisdiction_default | VARCHAR(32) | no | `'NY'` | New York-first |
| ai_sharing_default | sharing_policy_enum | no | `no_ai` | most conservative default; external sharing requires explicit opt-in |
| created_by_user_id | UUID | no |  | FK users |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### FKs
- `created_by_user_id -> users.id`

---

## Table: `workspace_memberships`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| user_id | UUID | no |  | FK users |
| role | workspace_role_enum | no |  |  |
| invited_at | TIMESTAMPTZ | yes |  |  |
| accepted_at | TIMESTAMPTZ | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints / indexes
- unique on `(workspace_id, user_id)`
- index on `(workspace_id, role)`

---

## Table: `workspace_settings`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| workspace_id | UUID | no |  | PK + FK workspaces |
| settings_json | JSONB | no | `'{}'::jsonb` | UI and feature settings |
| updated_at | TIMESTAMPTZ | no | now() |  |

---

# 6.2 Matters and Cross-Matter Links

## Table: `matters`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| slug | VARCHAR(64) | no |  | workspace-scoped unique |
| name | VARCHAR(255) | no |  |  |
| matter_type | matter_type_enum | no | `merits` |  |
| status | matter_status_enum | no | `active` |  |
| theory_summary | TEXT | yes |  |  |
| controlling_memo_ref | TEXT | yes |  | filename/ref only |
| next_work | TEXT | yes |  |  |
| jurisdiction | VARCHAR(32) | no | `'NY'` |  |
| ai_sharing_policy | sharing_policy_enum | no | `no_ai` | can override workspace default, but only by explicit user opt-in |
| archived_at | TIMESTAMPTZ | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints / indexes
- unique on `(workspace_id, slug)`
- index on `(workspace_id, matter_type, status)`

---

## Table: `matter_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| from_matter_id | UUID | no |  | FK matters |
| to_matter_id | UUID | no |  | FK matters |
| link_type | VARCHAR(64) | no |  | e.g. `overlays`, `related` |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- check `from_matter_id <> to_matter_id`
- unique on `(from_matter_id, to_matter_id, link_type)`

---

# 6.3 Actors and Roles

## Table: `actors`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| actor_type | actor_type_enum | no |  |  |
| display_name | VARCHAR(255) | no |  |  |
| normalized_name | VARCHAR(255) | yes |  | search/useful dedupe field |
| description | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(workspace_id, display_name)`
- `(workspace_id, normalized_name)`

---

## Table: `actor_aliases`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| actor_id | UUID | no |  | FK actors |
| alias_text | VARCHAR(255) | no |  |  |
| alias_type | VARCHAR(64) | yes |  | nickname/spelling/etc. |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(actor_id, alias_text)`

---

## Table: `matter_actor_roles`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| matter_id | UUID | no |  | FK matters |
| actor_id | UUID | no |  | FK actors |
| role_label | VARCHAR(64) | no |  | plaintiff, witness, custodian, etc. |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(matter_id, actor_id, role_label)`

---

# 6.4 Sources and Storage Metadata

## Table: `sources`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| source_type | source_type_enum | no |  |  |
| title | VARCHAR(255) | no |  | user-facing title |
| original_filename | VARCHAR(255) | yes |  |  |
| mime_type | VARCHAR(128) | yes |  |  |
| storage_path | TEXT | no |  | local storage key/path |
| sha256 | CHAR(64) | yes |  | dedupe |
| file_size_bytes | BIGINT | yes |  |  |
| page_count | INTEGER | yes |  |  |
| source_status | source_status_enum | no | `derived` | proof-classification |
| evidence_review_status | evidence_review_status_enum | no | `uploaded` | lifecycle |
| included_flag | BOOLEAN | no | false |  |
| excluded_flag | BOOLEAN | no | false |  |
| exclusion_reason | TEXT | yes |  |  |
| authentication_notes | TEXT | yes |  |  |
| restrictions_notes | TEXT | yes |  |  |
| processing_status | VARCHAR(64) | no | `'queued'` | generic pipeline state |
| ocr_status | VARCHAR(64) | no | `'not_started'` |  |
| created_by_user_id | UUID | yes |  | FK users |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- check not both `included_flag = true` and `excluded_flag = true`

### Indexes
- `sha256`
- `(workspace_id, source_type)`
- `(workspace_id, evidence_review_status)`
- `(workspace_id, title)`

---

## Table: `source_matter_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| source_id | UUID | no |  | FK sources |
| matter_id | UUID | no |  | FK matters |
| link_reason | VARCHAR(128) | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(source_id, matter_id)`

---

## Table: `source_metadata`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| source_id | UUID | no |  | PK + FK sources |
| metadata_json | JSONB | no | `'{}'::jsonb` | parser output |
| extracted_from_filename_json | JSONB | no | `'{}'::jsonb` | heuristics |
| external_provenance_json | JSONB | no | `'{}'::jsonb` | MCP/import provenance |
| updated_at | TIMESTAMPTZ | no | now() |  |

---

## Table: `source_pages`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| source_id | UUID | no |  | FK sources |
| page_number | INTEGER | no |  | starts at 1 |
| page_label | VARCHAR(64) | yes |  | PDF label if any |
| ocr_text | TEXT | yes |  |  |
| layout_json | JSONB | no | `'{}'::jsonb` | bounding boxes/layout |
| image_path | TEXT | yes |  | rendered page image if created |
| embedding_vector | VECTOR(1536) | yes |  | size configurable by model |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(source_id, page_number)`

### Indexes
- vector index on `embedding_vector`
- full-text index on `ocr_text`

> If embedding dimension changes, either create a separate embedding table or standardize one embedding model for v1.

---

## Table: `source_excerpts`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| source_id | UUID | no |  | FK sources |
| page_start | INTEGER | yes |  |  |
| page_end | INTEGER | yes |  |  |
| locator_text | TEXT | yes |  | paragraph/timestamp/Bates |
| excerpt_text | TEXT | yes |  |  |
| excerpt_type | VARCHAR(64) | no |  | quote/region/timestamp/etc. |
| anchor_json | JSONB | no | `'{}'::jsonb` | bbox/time ranges |
| embedding_vector | VECTOR(1536) | yes |  | optional |
| created_by | VARCHAR(16) | no | `'system'` | system or user |
| created_by_user_id | UUID | yes |  | if user-created |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- full-text on `excerpt_text`
- vector index on `embedding_vector`
- `(source_id, page_start)`

---

# 6.5 Ledger, Proposals, Facts

## Table: `ledger_entries`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | yes |  | FK matters |
| external_ledger_id | VARCHAR(64) | yes |  | e.g. `230-001` |
| date_start | DATE | yes |  |  |
| date_end | DATE | yes |  |  |
| date_text_raw | TEXT | yes |  |  |
| fact_short_name | VARCHAR(255) | no |  |  |
| fact_statement | TEXT | no |  |  |
| claim_use_text | TEXT | yes |  | imported compatibility |
| relief_use_text | TEXT | yes |  | imported compatibility |
| source_path_text | TEXT | yes |  | imported compatibility |
| source_locator_text | TEXT | yes |  | imported compatibility |
| source_status | source_status_enum | yes |  | copied/imported descriptor |
| authentication_or_witness | TEXT | yes |  |  |
| confidence_level | strength_label_enum | yes |  | low/medium/high for now |
| verification_task_text | TEXT | yes |  |  |
| restrictions_or_notes | TEXT | yes |  |  |
| linked_source_id | UUID | yes |  | FK sources |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- optional unique on `(matter_id, external_ledger_id)` when imported IDs exist

---

## Table: `proposals`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | yes |  | FK matters |
| proposal_type | proposal_type_enum | no |  |  |
| review_state | review_state_enum | no | `proposed` |  |
| title | VARCHAR(255) | yes |  |  |
| proposed_text | TEXT | yes |  |  |
| proposed_structured_json | JSONB | no | `'{}'::jsonb` | date/actors/etc. |
| source_id | UUID | yes |  | FK sources |
| excerpt_id | UUID | yes |  | FK source_excerpts |
| confidence_score | NUMERIC(5,4) | yes |  | 0-1 if provided |
| created_by_system | BOOLEAN | no | true |  |
| created_by_user_id | UUID | yes |  | for manual proposals |
| reviewed_by_user_id | UUID | yes |  | FK users |
| reviewed_at | TIMESTAMPTZ | yes |  |  |
| review_notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(matter_id, review_state)`
- `(proposal_type, review_state)`
- `(source_id)`

---

## Table: `fact_assertions`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | no |  | FK matters |
| short_label | VARCHAR(255) | yes |  |  |
| statement_text | TEXT | no |  | trusted fact text |
| review_state | review_state_enum | no | `proposed` | safe floor; service layer sets `accepted` only on explicit approval |
| confidence_level | strength_label_enum | yes |  |  |
| fact_type | fact_type_enum | no | `source_derived` |  |
| is_material | BOOLEAN | no | false |  |
| created_from_proposal_id | UUID | yes |  | FK proposals |
| created_by_user_id | UUID | yes |  | FK users |
| approved_by_user_id | UUID | yes |  | FK users |
| approved_at | TIMESTAMPTZ | yes |  |  |
| supersedes_fact_id | UUID | yes |  | self-FK |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(matter_id, review_state)`
- full-text on `statement_text`

---

## Table: `fact_source_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| fact_id | UUID | no |  | FK fact_assertions |
| source_id | UUID | no |  | FK sources |
| excerpt_id | UUID | yes |  | FK source_excerpts |
| support_type | support_type_enum | no | `supports` |  |
| strength | strength_label_enum | yes |  |  |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(fact_id, source_id, excerpt_id, support_type)`

---

## Table: `fact_actor_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| fact_id | UUID | no |  | FK fact_assertions |
| actor_id | UUID | no |  | FK actors |
| role_in_fact | VARCHAR(64) | yes |  | speaker/recipient/subject/etc. |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(fact_id, actor_id, role_in_fact)`

---

# 6.6 Events / Chronology

## Table: `events`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | no |  | FK matters |
| title | VARCHAR(255) | no |  |  |
| description | TEXT | yes |  |  |
| date_start | DATE | yes |  |  |
| date_end | DATE | yes |  |  |
| date_precision | date_precision_enum | no | `unknown` |  |
| date_text_raw | TEXT | yes |  |  |
| significance_level | VARCHAR(32) | yes |  | high/medium/low or tag |
| review_state | review_state_enum | no | `proposed` | safe floor; acceptance flow sets `accepted` explicitly |
| confidence_level | strength_label_enum | yes |  |  |
| created_from_proposal_id | UUID | yes |  | FK proposals |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(matter_id, date_start)`
- `(matter_id, review_state)`
- full-text on `title, description`

---

## Table: `event_fact_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| event_id | UUID | no |  | FK events |
| fact_id | UUID | no |  | FK fact_assertions |
| relationship_type | VARCHAR(32) | no | `'supports_event'` | supports/contradicts/context |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(event_id, fact_id, relationship_type)`

---

## Table: `event_actor_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| event_id | UUID | no |  | FK events |
| actor_id | UUID | no |  | FK actors |
| role_in_event | VARCHAR(64) | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(event_id, actor_id, role_in_event)`

---

## Table: `event_tags`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| event_id | UUID | no |  | FK events |
| tag_type | VARCHAR(32) | no |  | significance/actor_theory/claim_theory |
| tag_value | VARCHAR(128) | no |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(event_id, tag_type, tag_value)`

---

# 6.7 Claim Templates and Claim Instances

## Table: `claim_templates`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| jurisdiction | VARCHAR(32) | no | `'NY'` |  |
| name | VARCHAR(255) | no |  |  |
| category | VARCHAR(128) | yes |  | tort/contract/property/etc. |
| source_authority_text | TEXT | yes |  | pattern instruction/statute/etc. |
| notes | TEXT | yes |  | caveats |
| is_active | BOOLEAN | no | true |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(jurisdiction, name)`

---

## Table: `claim_template_elements`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| claim_template_id | UUID | no |  | FK claim_templates |
| element_order | INTEGER | no |  |  |
| element_label | VARCHAR(255) | no |  |  |
| element_description | TEXT | yes |  |  |
| is_issue_row | BOOLEAN | no | false | for non-element issue tracking rows |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(claim_template_id, element_order)`

---

## Table: `claim_instances`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| matter_id | UUID | no |  | FK matters |
| template_id | UUID | yes |  | FK claim_templates |
| claim_code | VARCHAR(32) | yes |  | e.g. C1/H1 |
| name | VARCHAR(255) | no |  |  |
| target_summary | TEXT | yes |  |  |
| status | VARCHAR(64) | yes |  | working/live/reserved/etc. |
| theory_summary | TEXT | yes |  |  |
| highest_priority_gap | TEXT | yes |  |  |
| authority_verification_state | VARCHAR(64) | yes |  | pending/verified/etc. |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- optional unique on `(matter_id, claim_code)` when claim_code present

---

## Table: `claim_instance_targets`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| claim_instance_id | UUID | no |  | FK claim_instances |
| actor_id | UUID | no |  | FK actors |
| target_role | VARCHAR(64) | yes |  | primary defendant etc. |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(claim_instance_id, actor_id, target_role)`

---

## Table: `claim_elements`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| claim_instance_id | UUID | no |  | FK claim_instances |
| element_order | INTEGER | no |  |  |
| element_label | VARCHAR(255) | no |  |  |
| element_description | TEXT | yes |  |  |
| support_status | claim_support_status_enum | no | `not_researched` |  |
| gap_text | TEXT | yes |  |  |
| risk_text | TEXT | yes |  |  |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(claim_instance_id, element_order)`

---

## Table: `claim_element_fact_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| claim_element_id | UUID | no |  | FK claim_elements |
| fact_id | UUID | no |  | FK fact_assertions |
| link_polarity | VARCHAR(16) | no |  | support/adverse/context |
| weight_label | strength_label_enum | yes |  |  |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(claim_element_id, fact_id, link_polarity)`

---

## Table: `claim_element_authority_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| claim_element_id | UUID | no |  | FK claim_elements |
| authority_id | UUID | no |  | FK authorities |
| link_type | authority_link_type_enum | no | `background` |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(claim_element_id, authority_id, link_type)`

---

# 6.8 Relief

## Table: `relief_requests`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| matter_id | UUID | no |  | FK matters |
| name | VARCHAR(255) | no |  |  |
| relief_type | relief_type_enum | no | `other` |  |
| practical_objective | TEXT | yes |  |  |
| principal_risk | TEXT | yes |  |  |
| fallback_option | TEXT | yes |  |  |
| recommendation_state | VARCHAR(64) | yes |  | core/useful/avoid etc. |
| procedural_prerequisites | TEXT | yes |  |  |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

---

## Table: `relief_fact_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| relief_request_id | UUID | no |  | FK relief_requests |
| fact_id | UUID | no |  | FK fact_assertions |
| link_type | VARCHAR(32) | no | `support` | support/risk/context |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(relief_request_id, fact_id, link_type)`

---

## Table: `relief_claim_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| relief_request_id | UUID | no |  | FK relief_requests |
| claim_instance_id | UUID | no |  | FK claim_instances |
| link_type | VARCHAR(32) | no | `supports` |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(relief_request_id, claim_instance_id, link_type)`

---

## Table: `relief_authority_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| relief_request_id | UUID | no |  | FK relief_requests |
| authority_id | UUID | no |  | FK authorities |
| link_type | authority_link_type_enum | no | `background` |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(relief_request_id, authority_id, link_type)`

---

# 6.9 Authorities / Research

## Table: `authorities`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | yes |  | nullable for workspace-wide authority |
| authority_type | authority_type_enum | no |  |  |
| title | VARCHAR(255) | no |  |  |
| citation_text | TEXT | yes |  |  |
| jurisdiction | VARCHAR(32) | yes |  |  |
| pinpoint_text | TEXT | yes |  |  |
| holding_summary | TEXT | yes |  |  |
| source_link | TEXT | yes |  | external url or local ref |
| uploaded_source_id | UUID | yes |  | FK sources if authority uploaded |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- full-text on `title, citation_text, holding_summary`

---

## Table: `authority_propositions`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| authority_id | UUID | no |  | FK authorities |
| proposition_text | TEXT | no |  |  |
| treatment_note | TEXT | yes |  |  |
| pinpoint_text | TEXT | yes |  |  |
| embedding_vector | VECTOR(1536) | yes |  | optional semantic search |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- full-text on `proposition_text`
- vector index on `embedding_vector`

---

# 6.10 Tasks, Comments, Approvals

## Table: `tasks`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | yes |  | FK matters |
| title | VARCHAR(255) | no |  |  |
| description | TEXT | yes |  |  |
| priority | task_priority_enum | no | `P2` |  |
| status | task_status_enum | no | `open` |  |
| task_type | task_type_enum | no | `other` |  |
| assigned_to_user_id | UUID | yes |  | FK users |
| created_by_user_id | UUID | yes |  | FK users |
| due_date | DATE | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(workspace_id, priority, status)`
- `(matter_id, task_type, status)`

---

## Table: `comments`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| target_type | VARCHAR(64) | no |  | source/fact/event/etc. |
| target_id | UUID | no |  | polymorphic target |
| author_user_id | UUID | no |  | FK users |
| body_markdown | TEXT | no |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(target_type, target_id)`

---

## Table: `approvals`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| target_type | VARCHAR(64) | no |  |  |
| target_id | UUID | no |  |  |
| approved_by_user_id | UUID | no |  | FK users |
| approval_type | VARCHAR(64) | yes |  | factual/legal/editorial |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(target_type, target_id)`

---

# 6.11 Drafting

## Table: `draft_documents`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| matter_id | UUID | no |  | FK matters |
| draft_type | VARCHAR(64) | no |  | chronology/report/claim/etc. |
| title | VARCHAR(255) | no |  |  |
| status | VARCHAR(64) | yes |  | working/review/approved |
| created_by_user_id | UUID | yes |  | FK users |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

---

## Table: `draft_paragraphs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| draft_document_id | UUID | no |  | FK draft_documents |
| paragraph_order | INTEGER | no |  |  |
| text_content | TEXT | no |  |  |
| generated_by_ai | BOOLEAN | no | false |  |
| support_state | VARCHAR(32) | no | `not_checked` | supported/partial/unsupported |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(draft_document_id, paragraph_order)`

---

## Table: `draft_paragraph_fact_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| draft_paragraph_id | UUID | no |  | FK draft_paragraphs |
| fact_id | UUID | no |  | FK fact_assertions |
| link_type | VARCHAR(32) | no | `support` |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(draft_paragraph_id, fact_id, link_type)`

---

## Table: `draft_paragraph_authority_links`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| draft_paragraph_id | UUID | no |  | FK draft_paragraphs |
| authority_id | UUID | no |  | FK authorities |
| link_type | VARCHAR(32) | no | `support` |  |
| created_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(draft_paragraph_id, authority_id, link_type)`

---

# 6.12 AI Providers and Agent Runs

## Table: `ai_provider_configs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| provider_name | VARCHAR(64) | no |  | `openai`, `anthropic`, etc. |
| display_name | VARCHAR(128) | no |  |  |
| enabled | BOOLEAN | no | true |  |
| config_json | JSONB | no | `'{}'::jsonb` | non-secret config |
| secret_ref | VARCHAR(255) | yes |  | env key or local secret ref |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(workspace_id, provider_name, display_name)`

---

## Table: `agent_personas`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| name | VARCHAR(128) | no |  |  |
| description | TEXT | yes |  |  |
| prompt_template_ref | TEXT | no |  | file/path/version ref |
| default_provider_name | VARCHAR(64) | yes |  |  |
| default_model_name | VARCHAR(128) | yes |  |  |
| allowed_scope_policy | sharing_policy_enum | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

---

## Table: `agent_runs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| matter_id | UUID | yes |  | FK matters |
| question_text | TEXT | no |  |  |
| run_scope_policy | sharing_policy_enum | no |  |  |
| status | agent_run_status_enum | no | `queued` |  |
| created_by_user_id | UUID | yes |  | FK users |
| created_at | TIMESTAMPTZ | no | now() |  |
| completed_at | TIMESTAMPTZ | yes |  |  |

### Indexes
- `(matter_id, status)`

---

## Table: `agent_run_steps`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| agent_run_id | UUID | no |  | FK agent_runs |
| persona_id | UUID | yes |  | FK agent_personas |
| provider_name | VARCHAR(64) | no |  |  |
| model_name | VARCHAR(128) | no |  |  |
| prompt_version | VARCHAR(64) | yes |  |  |
| input_manifest_json | JSONB | no | `'{}'::jsonb` | what was shared |
| output_text | TEXT | yes |  |  |
| output_structured_json | JSONB | no | `'{}'::jsonb` |  |
| error_text | TEXT | yes |  |  |
| started_at | TIMESTAMPTZ | yes |  |  |
| completed_at | TIMESTAMPTZ | yes |  |  |

### Indexes
- `(agent_run_id)`
- `(provider_name, model_name)`

---

## Table: `agent_run_dispositions`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| agent_run_step_id | UUID | no |  | FK agent_run_steps |
| user_id | UUID | no |  | FK users |
| disposition | VARCHAR(64) | no |  | adopt_note/create_task/etc. |
| notes | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |

---

# 6.13 Connectors / MCP

## Table: `connector_configs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| connector_type | connector_type_enum | no | `mcp` |  |
| name | VARCHAR(128) | no |  | user-facing name |
| enabled | BOOLEAN | no | true |  |
| scope | connector_scope_enum | no | `both` | evidence/research/both |
| config_json | JSONB | no | `'{}'::jsonb` | non-secret config |
| secret_ref | VARCHAR(255) | yes |  | local secret ref |
| created_at | TIMESTAMPTZ | no | now() |  |
| updated_at | TIMESTAMPTZ | no | now() |  |

### Constraints
- unique on `(workspace_id, name)`

---

## Table: `connector_runs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| connector_config_id | UUID | no |  | FK connector_configs |
| matter_id | UUID | yes |  | FK matters |
| initiated_by_user_id | UUID | yes |  | FK users |
| query_text | TEXT | yes |  |  |
| query_json | JSONB | no | `'{}'::jsonb` | richer payload |
| status | agent_run_status_enum | no | `queued` | reuse or create connector-specific enum |
| started_at | TIMESTAMPTZ | yes |  |  |
| completed_at | TIMESTAMPTZ | yes |  |  |
| error_text | TEXT | yes |  |  |

---

## Table: `connector_results`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| connector_run_id | UUID | no |  | FK connector_runs |
| result_type | connector_result_type_enum | no |  |  |
| title | VARCHAR(255) | yes |  |  |
| snippet_text | TEXT | yes |  |  |
| external_id | VARCHAR(255) | yes |  |  |
| external_uri | TEXT | yes |  |  |
| provenance_json | JSONB | no | `'{}'::jsonb` |  |
| raw_payload_json | JSONB | no | `'{}'::jsonb` | raw normalized storage |
| review_state | review_state_enum | no | `proposed` | candidate review state |
| imported_source_id | UUID | yes |  | FK sources |
| imported_authority_id | UUID | yes |  | FK authorities |
| created_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(connector_run_id, review_state)`
- `(external_id)`

---

# 6.14 Audit and Jobs

## Table: `audit_log_entries`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| workspace_id | UUID | no |  | FK workspaces |
| actor_user_id | UUID | yes |  | FK users; null for system jobs |
| action_type | VARCHAR(128) | no |  | fact_approved/source_uploaded/etc. |
| target_type | VARCHAR(64) | no |  |  |
| target_id | UUID | no |  |  |
| before_json | JSONB | yes |  |  |
| after_json | JSONB | yes |  |  |
| metadata_json | JSONB | no | `'{}'::jsonb` | route/job/prompt info |
| created_at | TIMESTAMPTZ | no | now() |  |

### Indexes
- `(workspace_id, created_at)`
- `(target_type, target_id)`

---

## Table: `system_jobs`

| Column | Type | Null | Default | Notes |
|---|---|---:|---|---|
| id | UUID | no | gen_random_uuid() | PK |
| job_type | VARCHAR(64) | no |  |  |
| target_type | VARCHAR(64) | yes |  |  |
| target_id | UUID | yes |  |  |
| status | VARCHAR(32) | no | `'queued'` |  |
| payload_json | JSONB | no | `'{}'::jsonb` |  |
| result_json | JSONB | no | `'{}'::jsonb` |  |
| error_text | TEXT | yes |  |  |
| created_at | TIMESTAMPTZ | no | now() |  |
| started_at | TIMESTAMPTZ | yes |  |  |
| completed_at | TIMESTAMPTZ | yes |  |  |

---

## 7. Full-Text and Vector Search Strategy

## 7.1 Full-text targets
Recommended tsvector indexes on:
- `sources.title`
- `source_pages.ocr_text`
- `source_excerpts.excerpt_text`
- `fact_assertions.statement_text`
- `events.title` + `events.description`
- `authorities.title` + `authorities.citation_text` + `authorities.holding_summary`
- `authority_propositions.proposition_text`

### Recommendation
Use generated tsvector columns later if performance requires. For v1, expression indexes are acceptable.

---

## 7.2 Vector targets
Recommended embeddings first on:
- `source_pages.embedding_vector`
- `source_excerpts.embedding_vector`

Optional later:
- `authority_propositions.embedding_vector`
- `fact_assertions.embedding_vector`

### Design note
If multiple embedding dimensions/providers are likely, move embeddings into dedicated tables:
- `source_page_embeddings`
- `excerpt_embeddings`
- `authority_embeddings`

For v1, one standardized dimension is simpler.

---

## 8. Suggested SQLAlchemy Model Grouping

Recommended model modules:

```text
models/
├── base.py
├── enums.py
├── user.py
├── workspace.py
├── matter.py
├── actor.py
├── source.py
├── ledger.py
├── proposal.py
├── fact.py
├── event.py
├── claim.py
├── relief.py
├── authority.py
├── task.py
├── draft.py
├── ai.py
├── connector.py
├── audit.py
└── job.py
```

### Base mixins
Useful common mixins:
- `UUIDPrimaryKeyMixin`
- `TimestampMixin`
- `WorkspaceScopedMixin` where appropriate
- `SoftDeleteMixin` for selected tables

---

## 9. Migration Plan

## Migration 001 — foundations
- enums
- users
- workspaces
- workspace_memberships
- workspace_settings
- matters
- matter_links

## Migration 002 — actors
- actors
- actor_aliases
- matter_actor_roles

## Migration 003 — sources
- sources
- source_matter_links
- source_metadata
- source_pages
- source_excerpts

## Migration 004 — intake core
- ledger_entries
- proposals
- fact_assertions
- fact_source_links
- fact_actor_links

## Migration 005 — chronology
- events
- event_fact_links
- event_actor_links
- event_tags

## Migration 006 — claims
- claim_templates
- claim_template_elements
- claim_instances
- claim_instance_targets
- claim_elements
- claim_element_fact_links

## Migration 007 — research and relief
- authorities
- authority_propositions
- claim_element_authority_links
- relief_requests
- relief_fact_links
- relief_claim_links
- relief_authority_links

## Migration 008 — collaboration and work product
- tasks
- comments
- approvals
- draft_documents
- draft_paragraphs
- draft_paragraph_fact_links
- draft_paragraph_authority_links

## Migration 009 — AI and connectors
- ai_provider_configs
- agent_personas
- agent_runs
- agent_run_steps
- agent_run_dispositions
- connector_configs
- connector_runs
- connector_results

## Migration 010 — audit and jobs
- audit_log_entries
- system_jobs

---

## 10. Sample Seed Data Shape

These are illustrative, not actual inserts.

## 10.1 Workspace
- workspace: `DG Matter Workspace`
- jurisdiction default: `NY`
- AI sharing default: `no_ai`

## 10.2 Matters
- `230 CPS — 2F Bedroom C` (`slug=230cps`, type=`merits`)
- `510 W 42 — #209 / hotel work / property` (`slug=510w42`, type=`merits`)
- `Part 19 — Article 81 leave and preservation` (`slug=part19`, type=`proceeding`)

## 10.3 Matter links
- `part19 overlays 230cps`
- `part19 overlays 510w42`

## 10.4 Actors
- `DG` person
- `IR` person
- `AC` person
- `230 Park South Apartments, Inc.` entity

## 10.5 Source
- title: `RE Access and Property Status — 510 W 42nd St / 230 CPS`
- source_type: `pdf`
- source_status: `primary`
- evidence_review_status: `reviewed`

## 10.6 Ledger entry
- external_ledger_id: `230-018`
- fact_short_name: `restore and inventory demand`
- fact_statement: `DG made written restore and inventory demand covering 2F and 510...`

## 10.7 Proposal
- proposal_type: `fact`
- review_state: `proposed`
- source linked to the PDF excerpt

## 10.8 Fact assertion
- short_label: `2F door exclusion`
- review_state: `accepted`
- fact_type: `source_derived`

## 10.9 Event
- title: `2F door exclusion`
- date_start: `2025-06-03`
- date_precision: `exact`

## 10.10 Claim instance
- claim_code: `C1`
- name: `RPAPL 768 + NYC Admin. Code §26-521`
- matter: `230cps`

## 10.11 Claim element link
- element: `lawful occupancy`
- support fact: approved occupancy fact
- support status: `moderate_support`

---

## 11. High-Risk Areas to Keep Simple in v1

1. **Polymorphic links everywhere**  
   Use explicit join tables for critical relationships first.

2. **Fine-grained ACL tables too early**  
   Start with workspace-level roles and design for later expansion.

3. **Multiple embedding model dimensions**  
   Standardize early unless a real use case forces flexibility.

4. **Over-abstracting claim logic**  
   Keep claim templates and matter-specific claim instances simple and editable.

5. **Generic event/fact auto-merging**  
   Flag duplicates, but require review.

---

## 12. Recommended First Implementation Cut

If implementation begins from this schema, the first useful subset is:

### Essential tables only
- users
- workspaces
- workspace_memberships
- matters
- matter_links
- actors
- matter_actor_roles
- sources
- source_matter_links
- source_pages
- source_excerpts
- proposals
- fact_assertions
- fact_source_links
- events
- event_fact_links
- claim_templates
- claim_instances
- claim_elements
- claim_element_fact_links
- audit_log_entries

That subset is enough for:
- matter management
- evidence ingestion
- proposal review
- chronology
- claim chart v1

---

## 13. Suggested Next Step

The cleanest next artifact after this schema draft would be one of these:

1. **SQLAlchemy model outline + Alembic migration checklist**, or  
2. **Repo scaffold / Phase 0 implementation plan**

### Recommendation
Do the **repo scaffold / Phase 0 implementation plan** next if you want to start building in an orderly way, because the planning stack is now complete enough to begin implementation safely.

---

**End of Database Schema Draft**

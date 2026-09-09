# Legal Matter Intelligence Workspace — Technical Implementation Specification

**Status:** Technical planning draft  
**Companion documents:**
- `Legal_Matter_Intelligence_PRD.md`
- `Legal_Matter_Intelligence_Roadmap.md`

**Build posture:** Local-first testing with real evidence, progressive full-stack build, remote-agent/local-user handoff workflow  
**Jurisdiction focus:** New York-first  
**Core product goal:** connect evidence, facts, chronology, claim elements, causes of action, and relief through a reviewed proof graph

---

## 1. Purpose of This Specification

This document translates the product roadmap into an implementation-oriented technical plan. It is intended to guide early architecture, repository setup, schema design, API design, background-job design, AI integration, MCP connector support, and the local diagnostic/handoff workflow.

This is not a final low-level build sheet for every component, but it is detailed enough to:
- start the repo correctly
- choose the core stack
- define service boundaries
- design the first database migrations
- define the main APIs and workers
- avoid major architectural rework later

---

## 2. Architecture Summary

## 2.1 Recommended stack

### Frontend
- **Next.js** (App Router)
- **TypeScript**
- **React**
- **Tailwind CSS** or equivalent utility-first styling
- **TanStack Query** for server state
- **Zustand** or React Context for light client UI state

### Backend API
- **Python + FastAPI**
- **SQLAlchemy 2.x**
- **Alembic** for migrations
- **Pydantic** for request/response models

### Database
- **PostgreSQL**
- **pgvector** extension for semantic retrieval

### Background jobs
- **Redis** as queue broker/cache
- **RQ**, **Arq**, or **Celery** for async workers

### File storage
- **Local filesystem** for local-first testing
- storage abstraction layer for future S3-compatible/private-cloud deployment

### Search/retrieval
- **Postgres full-text search** for exact/text-heavy search in early versions
- **pgvector** for embeddings and semantic search
- application-layer reranking

### PDF export
- app-native print views first
- server-side or browser print-to-PDF pipeline later if needed

### Optional AI/local inference
- external AI provider connectors
- optional local model connector via **Ollama** or similar

### MCP integration
- internal connector registry with adapters to external MCP servers/data tools

---

## 2.2 Architectural posture

The system should be built as a **modular monorepo** with:
- one web app
- one backend API service
- one worker process family
- shared types/contracts where useful
- scripts for local setup, diagnostics, exports, and handoff support

This should **not** be built as:
- a single giant frontend-only app
- a chat-first system with hidden state in prompts
- a vector-db-only knowledge app
- a document bucket with weak structured linking

---

## 3. High-Level System Components

## 3.1 Core components

1. **Web UI**
   - workspace and matter navigation
   - source/evidence viewer
   - review inbox
   - chronology UI
   - claim chart UI
   - relief UI
   - research UI
   - AI review UI

2. **API service**
   - CRUD for all domain objects
   - permission enforcement
   - upload session management
   - review workflows
   - orchestration of search, AI runs, exports, and connectors

3. **Worker service(s)**
   - OCR
   - VLM extraction
   - duplicate detection
   - embeddings
   - proposal generation
   - chronology suggestions
   - search indexing
   - connector pulls
   - AI multi-agent jobs
   - export jobs

4. **Postgres database**
   - source of truth for structured objects and audit trail

5. **File storage service layer**
   - local file storage now
   - object storage abstraction later

6. **Diagnostics/handoff tooling**
   - log collection script
   - handoff file updates
   - branch conventions

---

## 3.2 Logical data flow

### Evidence ingestion flow
1. user uploads file
2. API creates `source` record
3. file is stored locally
4. worker extracts metadata and OCR text
5. worker splits into pages/chunks/excerpts
6. worker proposes facts/events/entities
7. proposals appear in review inbox
8. user approves/edits/rejects
9. approved facts can feed chronology and claim mapping

### Claim analysis flow
1. user creates claim from template
2. system links existing approved facts as candidate support
3. user reviews/supports elements
4. gap detection job surfaces weak or missing support
5. claim chart updates dynamically

### Multi-agent review flow
1. user chooses matter/question/agent set
2. system assembles allowed context
3. selected providers/models run
4. outputs are stored as `agent_run` records
5. synthesis and comparison appear in AI Review module
6. user converts insights to tasks, notes, or proposals

### MCP retrieval flow
1. user configures or selects MCP connector
2. system executes connector query/job
3. results come back as candidate records with provenance
4. user imports selected results as sources or research authorities
5. imported material follows standard review workflow

---

## 4. Repository / Monorepo Structure

Recommended top-level structure:

```text
casevault/
├── apps/
│   ├── web/                        # Next.js frontend
│   └── api/                        # FastAPI backend
├── workers/
│   ├── pipeline/                   # OCR, extraction, embeddings, proposals
│   ├── ai/                         # multi-agent execution workers
│   └── connectors/                 # MCP and other external connector jobs
├── packages/
│   ├── ui/                         # shared UI components
│   ├── types/                      # shared TypeScript types / generated clients
│   ├── prompts/                    # prompt templates and prompt manifests
│   ├── schemas/                    # shared JSON schemas / validation contracts
│   └── config/                     # shared app configuration defaults
├── scripts/
│   ├── setup_local.sh
│   ├── setup_local.ps1
│   ├── collect_logs.py
│   ├── handoff_finish.py
│   ├── backup_workspace.py
│   ├── seed_dev_data.py
│   └── export_bundle.py
├── handoff/
│   ├── WORKLOG.md
│   ├── BACKLOG.md
│   ├── TESTING.md
│   ├── KNOWN_ISSUES.md
│   └── DECISIONS.md
├── docs/
│   ├── architecture/
│   ├── prompts/
│   ├── connectors/
│   └── specs/
├── infra/
│   ├── docker/
│   ├── compose/
│   └── env/
├── data/                           # ignored: local storage root
│   ├── uploads/
│   ├── processed/
│   ├── ocr/
│   ├── exports/
│   ├── diagnostics/
│   └── vector/
├── tests/
│   ├── api/
│   ├── web/
│   ├── workers/
│   └── integration/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
└── Makefile
```

### Notes
- `data/` should be ignored by Git by default.
- `handoff/` should be versioned and intentionally updated each coding turn.
- `packages/prompts/` should store prompt templates with version metadata.
- `workers/` can begin as one worker codebase with multiple queues.

---

## 5. Core Technology Decisions

## 5.1 Frontend

### Recommended libraries
- Next.js App Router
- Tailwind CSS
- shadcn/ui or similar headless component primitives
- TanStack Table for ledger/chart tables
- TanStack Query for async data fetching
- React Hook Form + Zod for forms
- PDF/print rendering via app print styles initially

### Why this fits
- easy multi-panel legal workspace layout
- strong routing for matter/module pages
- fast local development
- reusable components for tables, drawers, inspectors, and side panels

---

## 5.2 Backend

### FastAPI rationale
- strong fit for structured APIs and worker orchestration
- good Python ecosystem for OCR, PDF processing, NLP, embeddings, and LLM pipelines
- good typing and schema generation
- easy local startup

### Recommended backend sublayers
- `routers/` for HTTP endpoints
- `services/` for business logic
- `repositories/` or direct SQLAlchemy modules for persistence
- `workers/` for async job execution
- `integrations/` for AI and MCP providers

---

## 5.3 Local environment approach

### Recommend Docker Compose support for:
- postgres
- redis
- optional local object storage emulator if needed

### App processes during local testing
- `web`
- `api`
- `worker`
- `postgres`
- `redis`

### Local-first convenience
Provide both:
- Docker-first setup
- native setup scripts for users who prefer direct local installs

---

## 6. Configuration and Environment Variables

## 6.1 Core env groups

### App config
- `APP_ENV`
- `APP_PORT_WEB`
- `APP_PORT_API`
- `APP_BASE_URL`
- `API_BASE_URL`

### Database
- `DATABASE_URL`

### Redis / worker
- `REDIS_URL`

### File storage
- `STORAGE_MODE=local`
- `LOCAL_STORAGE_ROOT=./data`

### Security
- `APP_SECRET_KEY`
- `SESSION_SECRET`

### AI providers
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `OPENROUTER_API_KEY`
- `OLLAMA_BASE_URL` (optional)

### Search / embeddings
- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`

### OCR / parsing
- `OCR_ENGINE`
- `TESSERACT_PATH` (if needed)

### MCP
- `MCP_DEFAULT_TIMEOUT`
- connector-specific values stored in encrypted local settings or secret store, not plain Git-tracked files

---

## 6.2 Git safety requirements

`.gitignore` must include, at minimum:

```gitignore
.env
.env.*
/data/
/uploads/
/evidence/
/exports/
/logs/
/tmp/
/cache/
*.sqlite
*.db
*.sqlite3
__pycache__/
node_modules/
.next/
coverage/
.venv/
```

Add local diagnostic and OCR caches as needed.

---

## 7. Database Design

## 7.1 General design principles

- use UUID primary keys for app-level records
- use explicit timestamps on all important tables
- soft-delete where appropriate for high-value analytical records
- preserve auditability and review status
- favor relational clarity over premature graph-db complexity
- use join tables for support links
- add a generic `object_links` table only where broad polymorphic linking provides clear value

---

## 7.2 Core enumerations

These may be implemented as Postgres enums or validated string constants.

### Matter status
- active
- archived
- planned
- hold

### Matter type
- merits
- proceeding
- research
- other

### Source type
- pdf
- image
- email
- text
- markdown
- spreadsheet
- note
- other

### Source status
- primary
- derived
- testimony
- working_note
- public_record

### Evidence review status
- uploaded
- processing
- reviewed
- cited
- included
- excluded
- duplicate
- privileged
- settlement_restricted
- background_only
- impeachment_only

### Proposal type
- fact
- event
- actor
- duplicate_merge
- date_normalization
- claim_mapping
- contradiction
- verification_task
- restriction

### Review state
- proposed
- accepted
- accepted_with_edits
- rejected
- deferred
- uncertain
- superseded
- disputed

### Claim support status
- no_support
- weak_support
- moderate_support
- strong_support
- conflicted
- not_researched

### Task status
- open
- in_progress
- blocked
- done
- canceled

### Comment target type
- source
- excerpt
- fact
- event
- claim
- element
- relief
- authority
- draft_paragraph
- task

### Agent scope sharing policy
- no_ai
- local_only
- external_excerpts_only
- external_selected_full_documents

### Connector result type
- source_candidate
- authority_candidate
- note_candidate
- metadata_hit

---

## 7.3 Table groups

### Group A — identity, access, workspace

#### `users`
Core user records.

Key fields:
- `id`
- `email`
- `display_name`
- `created_at`
- `updated_at`

#### `workspaces`
Key fields:
- `id`
- `name`
- `jurisdiction_default` (default `NY`)
- `ai_sharing_default` (default `no_ai`; external AI sharing is opt-in)
- `created_by_user_id`
- `created_at`
- `updated_at`

#### `workspace_memberships`
Key fields:
- `id`
- `workspace_id`
- `user_id`
- `role` (`owner`, `reviewer`, `commenter`, `viewer`, `editor_limited`)
- `invited_at`
- `accepted_at`
- `created_at`

#### `workspace_settings`
Key fields:
- `workspace_id`
- `settings_json`
- `updated_at`

---

### Group B — matters and relationships

#### `matters`
Key fields:
- `id`
- `workspace_id`
- `slug`
- `name`
- `matter_type`
- `status`
- `theory_summary`
- `controlling_memo_ref`
- `next_work`
- `jurisdiction`
- `ai_sharing_policy` (matter-level override of workspace default; default `no_ai`)
- `created_at`
- `updated_at`
- `archived_at` nullable

#### `matter_links`
Links matters to other matters or proceedings.

Key fields:
- `id`
- `workspace_id`
- `from_matter_id`
- `to_matter_id`
- `link_type` (`related`, `overlays`, `shares_sources`, `shares_actors`, `procedural_dependency`)
- `notes`

Indexes:
- unique-ish index on `(from_matter_id, to_matter_id, link_type)`

---

### Group C — actors and roles

#### `actors`
Key fields:
- `id`
- `workspace_id`
- `actor_type` (`person`, `entity`, `court`, `agency`, `other`)
- `display_name`
- `normalized_name`
- `description`
- `created_at`
- `updated_at`

#### `actor_aliases`
Key fields:
- `id`
- `actor_id`
- `alias_text`
- `alias_type` (`nickname`, `abbreviation`, `variant_spelling`, `source_appearance`)

#### `matter_actor_roles`
Key fields:
- `id`
- `matter_id`
- `actor_id`
- `role_label` (`plaintiff`, `counterparty`, `witness`, `custodian`, etc.)
- `notes`

---

### Group D — sources and storage

#### `sources`
One record per uploaded or imported source.

Key fields:
- `id`
- `workspace_id`
- `source_type`
- `title`
- `original_filename`
- `mime_type`
- `storage_path`
- `sha256`
- `file_size_bytes`
- `page_count` nullable
- `source_status`
- `evidence_review_status`
- `included_flag`
- `excluded_flag`
- `exclusion_reason`
- `authentication_notes`
- `restrictions_notes`
- `ocr_status`
- `processing_status`
- `created_by_user_id`
- `created_at`
- `updated_at`

Indexes:
- `sha256`
- `workspace_id, title`
- full-text index on normalized title

#### `source_matter_links`
Because a source may belong to multiple matters.

Key fields:
- `id`
- `source_id`
- `matter_id`
- `link_reason`

#### `source_metadata`
JSON and normalized metadata.

Key fields:
- `source_id`
- `metadata_json`
- `extracted_from_filename_json`
- `external_provenance_json`

#### `source_pages`
For OCR/page-level anchors.

Key fields:
- `id`
- `source_id`
- `page_number`
- `page_label`
- `ocr_text`
- `layout_json`
- `image_path` nullable
- `embedding_vector` nullable

Indexes:
- `(source_id, page_number)`
- vector index on `embedding_vector`

#### `source_excerpts`
User or machine-defined anchors.

Key fields:
- `id`
- `source_id`
- `page_start`
- `page_end`
- `locator_text`
- `excerpt_text`
- `excerpt_type` (`quote`, `paragraph`, `region`, `timestamp`, `range`, `manual_note`)
- `anchor_json` (bbox/timestamps/etc.)
- `created_by` (`system`, `user`)
- `created_at`

Indexes:
- full-text on `excerpt_text`
- vector index on excerpt embedding if stored separately

#### `source_tags`
Optional normalized tags.

---

### Group E — source ledger and fact records

#### `ledger_entries`
Structured ledger rows that can originate from imports or in-app creation.

Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `external_ledger_id` nullable (e.g., `230-001`)
- `date_start`
- `date_end`
- `date_text_raw`
- `fact_short_name`
- `fact_statement`
- `claim_use_text`
- `relief_use_text`
- `source_path_text`
- `source_locator_text`
- `source_status`
- `authentication_or_witness`
- `confidence_level`
- `verification_task_text`
- `restrictions_or_notes`
- `linked_source_id` nullable
- `created_at`
- `updated_at`

#### `fact_assertions`
Reviewed factual propositions.

Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `statement_text`
- `short_label`
- `review_state`
- `confidence_level`
- `fact_type` (`source_derived`, `user_entered`, `testimony`, `procedural`, `damage`, `other`)
- `is_material`
- `created_from_proposal_id` nullable
- `created_by_user_id`
- `approved_by_user_id` nullable
- `approved_at` nullable
- `supersedes_fact_id` nullable
- `created_at`
- `updated_at`

#### `fact_source_links`
Key fields:
- `id`
- `fact_id`
- `source_id`
- `excerpt_id` nullable
- `support_type` (`supports`, `contradicts`, `mentions`, `background`)
- `strength` (`low`, `medium`, `high`)
- `notes`

Indexes:
- `(fact_id, support_type)`
- `(source_id)`

#### `fact_actor_links`
Key fields:
- `id`
- `fact_id`
- `actor_id`
- `role_in_fact` (`speaker`, `recipient`, `subject`, `decision_maker`, `witness`, `other`)

---

### Group F — proposals and review queue

#### `proposals`
Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `proposal_type`
- `review_state`
- `title`
- `proposed_text`
- `proposed_structured_json`
- `source_id` nullable
- `excerpt_id` nullable
- `confidence_score` nullable
- `created_by_system` boolean
- `created_by_user_id` nullable
- `reviewed_by_user_id` nullable
- `reviewed_at` nullable
- `review_notes`
- `created_at`
- `updated_at`

Indexes:
- `(matter_id, proposal_type, review_state)`
- `(source_id)`

---

### Group G — chronology/events

#### `events`
Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `title`
- `description`
- `date_start`
- `date_end`
- `date_precision` (`exact`, `range`, `approximate`, `unknown`)
- `date_text_raw`
- `significance_level`
- `review_state`
- `confidence_level`
- `created_from_proposal_id` nullable
- `created_at`
- `updated_at`

#### `event_fact_links`
Key fields:
- `id`
- `event_id`
- `fact_id`
- `relationship_type` (`supports_event`, `contradicts_event`, `context_only`)

#### `event_actor_links`
Key fields:
- `id`
- `event_id`
- `actor_id`
- `role_in_event`

#### `event_tags`
- actor theory tag
- claim theory tag
- significance tag

---

### Group H — claim templates and claim charts

#### `claim_templates`
Key fields:
- `id`
- `jurisdiction`
- `name`
- `category`
- `source_authority_text`
- `notes`
- `is_active`
- `created_at`

#### `claim_template_elements`
Key fields:
- `id`
- `claim_template_id`
- `element_order`
- `element_label`
- `element_description`
- `is_issue_row` boolean

#### `claim_instances`
Matter-specific claims.

Key fields:
- `id`
- `matter_id`
- `template_id` nullable
- `claim_code` nullable (e.g., `C1`, `H1`)
- `name`
- `target_summary`
- `status`
- `theory_summary`
- `highest_priority_gap`
- `authority_verification_state`
- `notes`
- `created_at`
- `updated_at`

#### `claim_instance_targets`
Key fields:
- `id`
- `claim_instance_id`
- `actor_id`
- `target_role`

#### `claim_elements`
Key fields:
- `id`
- `claim_instance_id`
- `element_order`
- `element_label`
- `element_description`
- `support_status`
- `gap_text`
- `risk_text`
- `notes`
- `created_at`
- `updated_at`

#### `claim_element_fact_links`
Key fields:
- `id`
- `claim_element_id`
- `fact_id`
- `link_polarity` (`support`, `adverse`, `context`)
- `weight_label` (`low`, `medium`, `high`)
- `notes`

#### `claim_element_authority_links`
Key fields:
- `id`
- `claim_element_id`
- `authority_id`
- `link_type` (`controlling`, `persuasive`, `background`, `open_question`)

---

### Group I — relief

#### `relief_requests`
Key fields:
- `id`
- `matter_id`
- `name`
- `relief_type`
- `practical_objective`
- `principal_risk`
- `fallback_option`
- `recommendation_state`
- `procedural_prerequisites`
- `notes`
- `created_at`
- `updated_at`

#### `relief_fact_links`
- `relief_request_id`
- `fact_id`
- `link_type`

#### `relief_claim_links`
- `relief_request_id`
- `claim_instance_id`
- `link_type`

#### `relief_authority_links`
- `relief_request_id`
- `authority_id`
- `link_type`

---

### Group J — research authorities

#### `authorities`
Key fields:
- `id`
- `workspace_id`
- `matter_id` nullable
- `authority_type` (`case`, `statute`, `rule`, `jury_instruction`, `memo`, `note`)
- `title`
- `citation_text`
- `jurisdiction`
- `pinpoint_text`
- `holding_summary`
- `source_link`
- `uploaded_source_id` nullable
- `created_at`
- `updated_at`

#### `authority_propositions`
Key fields:
- `id`
- `authority_id`
- `proposition_text`
- `treatment_note`
- `pinpoint_text`
- `created_at`

---

### Group K — tasks, comments, approvals

#### `tasks`
Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `title`
- `description`
- `priority` (`P0`, `P1`, `P2`, `P3`)
- `status`
- `task_type` (`verification`, `research`, `drafting`, `bug`, `feature`, `connector_review`, `other`)
- `assigned_to_user_id` nullable
- `created_by_user_id`
- `due_date` nullable
- `created_at`
- `updated_at`

#### `comments`
Key fields:
- `id`
- `workspace_id`
- `target_type`
- `target_id`
- `author_user_id`
- `body_markdown`
- `created_at`
- `updated_at`

#### `approvals`
Key fields:
- `id`
- `target_type`
- `target_id`
- `approved_by_user_id`
- `approval_type`
- `notes`
- `created_at`

---

### Group L — drafting

#### `draft_documents`
Key fields:
- `id`
- `matter_id`
- `draft_type`
- `title`
- `status`
- `created_by_user_id`
- `created_at`
- `updated_at`

#### `draft_paragraphs`
Key fields:
- `id`
- `draft_document_id`
- `paragraph_order`
- `text_content`
- `generated_by_ai` boolean
- `support_state` (`supported`, `partially_supported`, `unsupported`, `not_checked`)
- `created_at`
- `updated_at`

#### `draft_paragraph_fact_links`
- `draft_paragraph_id`
- `fact_id`
- `link_type`

#### `draft_paragraph_authority_links`
- `draft_paragraph_id`
- `authority_id`
- `link_type`

---

### Group M — AI providers and agent runs

#### `ai_provider_configs`
Key fields:
- `id`
- `workspace_id`
- `provider_name`
- `display_name`
- `enabled`
- `config_json` (non-secret)
- `secret_ref` (pointer to local secret store/env key)
- `created_at`

#### `agent_personas`
Key fields:
- `id`
- `workspace_id`
- `name`
- `description`
- `prompt_template_ref`
- `default_provider_name` nullable
- `default_model_name` nullable
- `allowed_scope_policy`
- `created_at`

#### `agent_runs`
Key fields:
- `id`
- `workspace_id`
- `matter_id`
- `question_text`
- `run_scope_policy`
- `status`
- `created_by_user_id`
- `created_at`
- `completed_at` nullable

#### `agent_run_steps`
Each provider/persona execution.

Key fields:
- `id`
- `agent_run_id`
- `persona_id`
- `provider_name`
- `model_name`
- `prompt_version`
- `input_manifest_json`
- `output_text`
- `output_structured_json`
- `error_text` nullable
- `started_at`
- `completed_at`

#### `agent_run_dispositions`
Key fields:
- `id`
- `agent_run_step_id`
- `user_id`
- `disposition` (`adopt_note`, `create_task`, `ignore`, `request_revision`, `convert_to_proposal`)
- `notes`
- `created_at`

---

### Group N — MCP connectors

#### `connector_configs`
Key fields:
- `id`
- `workspace_id`
- `connector_type` (`mcp`, `native`, `filesystem`, `knowledge_base`, `research_source`)
- `name`
- `enabled`
- `scope` (`evidence`, `research`, `both`)
- `config_json`
- `secret_ref`
- `created_at`
- `updated_at`

#### `connector_runs`
Key fields:
- `id`
- `connector_config_id`
- `matter_id` nullable
- `initiated_by_user_id`
- `query_text`
- `query_json`
- `status`
- `started_at`
- `completed_at`
- `error_text` nullable

#### `connector_results`
Key fields:
- `id`
- `connector_run_id`
- `result_type`
- `title`
- `snippet_text`
- `external_id`
- `external_uri`
- `provenance_json`
- `raw_payload_json`
- `review_state`
- `imported_source_id` nullable
- `imported_authority_id` nullable
- `created_at`

Indexes:
- `(connector_run_id, review_state)`
- `(external_id)`

---

### Group O — audit and system events

#### `audit_log_entries`
Key fields:
- `id`
- `workspace_id`
- `actor_user_id` nullable
- `action_type`
- `target_type`
- `target_id`
- `before_json` nullable
- `after_json` nullable
- `metadata_json` nullable
- `created_at`

#### `system_jobs`
Optional visibility table for async work.

Key fields:
- `id`
- `job_type`
- `target_type`
- `target_id`
- `status`
- `payload_json`
- `result_json`
- `error_text`
- `created_at`
- `started_at`
- `completed_at`

---

## 7.4 Generic link table (optional, later)

If object linking becomes too fragmented, add:

#### `object_links`
- `id`
- `workspace_id`
- `from_type`
- `from_id`
- `to_type`
- `to_id`
- `link_type`
- `notes`
- `created_at`

Use this sparingly. Prefer explicit join tables for core analytical relationships.

---

## 7.5 Indexing priorities

### High priority indexes
- `sources.sha256`
- `source_pages (source_id, page_number)`
- `proposals (matter_id, review_state)`
- `events (matter_id, date_start)`
- `fact_assertions (matter_id, review_state)`
- `claim_elements (claim_instance_id, support_status)`
- `connector_results (connector_run_id, review_state)`

### Search indexes
- Postgres full-text indexes on:
  - source titles
  - source page OCR text
  - source excerpts
  - fact statements
  - event descriptions
  - authority titles and propositions

### Vector indexes
- embeddings on:
  - source page text
  - source excerpt text
  - fact assertions (optional)
  - authority propositions (optional)

---

## 8. File Storage and Local Data Layout

## 8.1 Storage abstraction

Create a `StorageService` interface with implementations for:
- `LocalFileStorage`
- future `S3Storage`

### Interface methods
- `save_upload(file_stream, metadata)`
- `get_path(storage_key)`
- `read_bytes(storage_key)`
- `write_derived(storage_key, content)`
- `delete(storage_key)`
- `exists(storage_key)`

---

## 8.2 Local directory structure

Under ignored `data/`:

```text
data/
├── uploads/
│   └── {workspace_id}/{source_id}/original.ext
├── processed/
│   └── {workspace_id}/{source_id}/
├── ocr/
│   └── {workspace_id}/{source_id}/pages/*.json
├── thumbnails/
├── exports/
├── diagnostics/
├── vector/
└── temp/
```

### Rules
- never assume original files are safe to commit
- derived OCR and embeddings should also remain local by default
- keep storage key paths deterministic

---

## 9. API Design

## 9.1 General API conventions

- JSON over HTTP
- versioned prefix: `/api/v1`
- UUID identifiers in paths
- pagination for list endpoints
- filter/query params for matter/status/type
- optimistic concurrency or updated-at checks for high-conflict edits later

---

## 9.2 Primary API groups

### Workspace & matters
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/{id}`
- `PATCH /api/v1/workspaces/{id}`
- `GET /api/v1/matters`
- `POST /api/v1/matters`
- `GET /api/v1/matters/{id}`
- `PATCH /api/v1/matters/{id}`
- `POST /api/v1/matters/{id}/links`
- `GET /api/v1/matters/{id}/overview`

### Actors
- `GET /api/v1/actors`
- `POST /api/v1/actors`
- `GET /api/v1/actors/{id}`
- `PATCH /api/v1/actors/{id}`
- `POST /api/v1/matters/{id}/actors`
- `GET /api/v1/matters/{id}/actors`

### Sources / evidence
- `POST /api/v1/sources/upload`
- `GET /api/v1/sources`
- `GET /api/v1/sources/{id}`
- `PATCH /api/v1/sources/{id}`
- `GET /api/v1/sources/{id}/pages`
- `GET /api/v1/sources/{id}/excerpts`
- `POST /api/v1/sources/{id}/excerpts`
- `POST /api/v1/sources/{id}/reprocess`
- `POST /api/v1/sources/{id}/link-matter`

### Source ledger / facts
- `GET /api/v1/ledger-entries`
- `POST /api/v1/ledger-entries`
- `PATCH /api/v1/ledger-entries/{id}`
- `POST /api/v1/ledger-entries/import-csv`
- `GET /api/v1/facts`
- `POST /api/v1/facts`
- `GET /api/v1/facts/{id}`
- `PATCH /api/v1/facts/{id}`
- `POST /api/v1/facts/{id}/links/source`
- `POST /api/v1/facts/{id}/links/actor`

### Proposals / review
- `GET /api/v1/proposals`
- `GET /api/v1/proposals/{id}`
- `POST /api/v1/proposals/{id}/accept`
- `POST /api/v1/proposals/{id}/accept-with-edits`
- `POST /api/v1/proposals/{id}/reject`
- `POST /api/v1/proposals/{id}/defer`

### Chronology
- `GET /api/v1/events`
- `POST /api/v1/events`
- `GET /api/v1/events/{id}`
- `PATCH /api/v1/events/{id}`
- `POST /api/v1/events/{id}/facts`
- `GET /api/v1/matters/{id}/chronology`

### Claims
- `GET /api/v1/claim-templates`
- `POST /api/v1/claim-instances`
- `GET /api/v1/claim-instances/{id}`
- `PATCH /api/v1/claim-instances/{id}`
- `GET /api/v1/claim-instances/{id}/chart`
- `POST /api/v1/claim-elements/{id}/link-fact`
- `POST /api/v1/claim-elements/{id}/link-authority`
- `POST /api/v1/claim-instances/{id}/recompute-support`

### Relief
- `GET /api/v1/relief-requests`
- `POST /api/v1/relief-requests`
- `GET /api/v1/relief-requests/{id}`
- `PATCH /api/v1/relief-requests/{id}`

### Research
- `GET /api/v1/authorities`
- `POST /api/v1/authorities`
- `GET /api/v1/authorities/{id}`
- `PATCH /api/v1/authorities/{id}`
- `POST /api/v1/authorities/{id}/propositions`

### Search
- `GET /api/v1/search?q=...`
- `POST /api/v1/search/semantic`
- `GET /api/v1/claims/{id}/support-search`

### AI Review
- `GET /api/v1/ai/providers`
- `POST /api/v1/ai/providers`
- `GET /api/v1/agent-personas`
- `POST /api/v1/agent-runs`
- `GET /api/v1/agent-runs/{id}`
- `POST /api/v1/agent-runs/{id}/disposition`

### MCP connectors
- `GET /api/v1/connectors`
- `POST /api/v1/connectors`
- `PATCH /api/v1/connectors/{id}`
- `POST /api/v1/connectors/{id}/run`
- `GET /api/v1/connector-runs/{id}`
- `GET /api/v1/connector-runs/{id}/results`
- `POST /api/v1/connector-results/{id}/import-source`
- `POST /api/v1/connector-results/{id}/import-authority`
- `POST /api/v1/connector-results/{id}/reject`

### Exports
- `POST /api/v1/exports/chronology-pdf`
- `POST /api/v1/exports/claim-chart-pdf`
- `GET /api/v1/exports/{job_id}`

### Comments / tasks / audit
- `GET /api/v1/comments`
- `POST /api/v1/comments`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PATCH /api/v1/tasks/{id}`
- `GET /api/v1/audit-log`

---

## 9.3 Example workflows behind endpoints

### Proposal acceptance
`POST /api/v1/proposals/{id}/accept-with-edits`

Body example:
```json
{
  "edited_text": "On June 3, 2025, DG states he was refused entry to 2F by doorman Donnie and superintendent Villanova after they said Schneider had instructed that he not be let in.",
  "create_event": true,
  "event_title": "2F door exclusion",
  "matter_id": "..."
}
```

Expected behavior:
- mark proposal accepted with edits
- create/update fact assertion
- optionally create linked event
- write audit log entries

### Agent run creation
`POST /api/v1/agent-runs`

Body example:
```json
{
  "matter_id": "...",
  "question_text": "Assess strengths and weaknesses of Claim C1 and identify the two most important missing proofs.",
  "persona_ids": ["...", "...", "..."],
  "scope_policy": "external_excerpts_only",
  "context": {
    "claim_instance_ids": ["..."],
    "fact_ids": ["..."],
    "source_ids": ["..."]
  }
}
```

---

## 10. Worker / Job Architecture

## 10.1 Worker queues

Recommended initial queues:
- `ingest`
- `ocr`
- `extract`
- `embed`
- `analysis`
- `connectors`
- `exports`

Early implementation can collapse these into fewer queues if needed.

---

## 10.2 Job types

### Ingestion jobs
- `source_ingest_job`
- `extract_metadata_job`
- `detect_duplicate_job`

### OCR/parsing jobs
- `ocr_source_job`
- `page_split_job`
- `build_excerpt_candidates_job`

### Analysis jobs
- `entity_extraction_job`
- `fact_proposal_job`
- `event_proposal_job`
- `claim_mapping_suggestion_job`
- `contradiction_detection_job`

### Embedding/search jobs
- `embed_source_pages_job`
- `embed_excerpts_job`
- `reindex_search_job`

### Claim/review jobs
- `recompute_claim_support_job`
- `recompute_matter_gap_summary_job`

### AI jobs
- `agent_run_step_job`
- `agent_synthesis_job`

### Connector jobs
- `connector_run_job`
- `connector_result_import_job`

### Export jobs
- `render_chronology_pdf_job`
- `render_claim_chart_pdf_job`

---

## 10.3 Job orchestration rules

### Upload orchestration
After source upload:
1. `source_ingest_job`
2. `extract_metadata_job`
3. `detect_duplicate_job`
4. `ocr_source_job`
5. `page_split_job`
6. `build_excerpt_candidates_job`
7. `fact_proposal_job`
8. `event_proposal_job`
9. `embed_source_pages_job`

### Claim support recompute trigger
Trigger after:
- fact accepted/revised
- event updated
- claim element links change
- authority links change

### Connector import orchestration
1. user selects connector result
2. `connector_result_import_job`
3. create `source` or `authority`
4. enqueue normal ingest/review jobs if source-like

---

## 11. Search and Retrieval Design

## 11.1 Retrieval strategy

Use **hybrid retrieval**.

### Components
1. exact keyword search via Postgres full-text
2. metadata filters
3. vector similarity search via pgvector
4. application-layer reranking
5. source anchor return formatting

### Why this matters
Legal users need:
- exact phrase recall
- structured filtering
- semantic discovery
- page-level anchors and not just document-level hits

---

## 11.2 Searchable units

### Index these units
- source titles
- source page OCR text
- source excerpts
- fact assertions
- event descriptions
- authority propositions
- optionally draft paragraphs for internal reference

### Return model
Each result should include:
- result type
- title/label
- snippet
- matter
- source/event/fact/authority identifier
- anchor info
- confidence or ranking signals

---

## 11.3 Element support search

Special query path:
- input: claim element
- output: ranked approved facts and excerpts that may support or weaken that element

This should be a dedicated service, not only a generic search call.

---

## 12. AI Provider Abstraction

## 12.1 Design objective

Support multiple AI providers and local-model options without hard-coding business logic to one vendor.

---

## 12.2 Core interface

Define an internal `LLMProvider` contract such as:
- `generate_text(request)`
- `generate_structured(request, schema)`
- `embed_texts(request)`
- `health_check()`
- `list_models()` optional

### Request envelope should include
- provider name
- model name
- temperature
- max tokens
- system prompt
- user prompt
- structured output schema if required
- redaction/share policy metadata

---

## 12.3 Provider adapters

Implement adapters for:
- OpenAI-compatible
- Anthropic
- Gemini
- xAI/Grok
- OpenRouter-style relay
- Ollama/local

### Adapter responsibilities
- map generic request envelope to provider API
- normalize responses
- capture token usage if available
- capture provider-specific errors consistently

---

## 12.4 Prompt registry

Store prompt templates in versioned files.

Recommended structure:
```text
packages/prompts/
├── chronology/
├── claims/
├── review/
├── drafting/
├── red_team/
└── schemas/
```

Each prompt should track:
- prompt name
- version
- intended use
- required inputs
- allowed source classes
- output schema
- review warnings

---

## 12.5 AI sharing guardrails

Before any external AI call, enforce:
- workspace/matter scope policy
- connector/provider enabled state
- context minimization
- log the manifest of what was shared

For example:
- if matter policy is `external_excerpts_only`, do not send full document text
- if policy is `no_ai`, reject the run
- if policy is `local_only`, route only to local providers

---

## 13. Multi-Agent Review Design

## 13.1 Personas

Recommended initial personas:
- Plaintiff Strategist
- Defense Red Team
- Neutral Evidence Auditor
- Chronology Reviewer
- Claim Gap Detector
- Procedural Risk Reviewer

## 13.2 Run model

One user question => one `agent_run` => many `agent_run_steps`.

This allows:
- side-by-side comparison
- disagreement capture
- later synthesis
- selective reuse of outputs

## 13.3 Output handling

Agent output may be converted into:
- task
- comment
- internal note
- fact proposal
- claim risk note

It must **not** directly alter approved facts.

---

## 14. MCP Connector Abstraction

## 14.1 Goal

Provide a safe, reviewable framework for connecting external data sources and knowledge bases to search for potentially relevant evidence or authority material.

---

## 14.2 Connector design principles

- connectors are **read-only first**
- connector results are **candidates**, not trusted records
- provenance is mandatory
- imported material enters the same review pipeline as local uploads
- connector access should be separately configurable from AI provider access

---

## 14.3 MCP adapter contract

Define an internal `ConnectorAdapter` interface:
- `health_check()`
- `search(query, context)`
- `fetch_item(external_id)`
- `normalize_result(raw)`
- `list_capabilities()`

### MCP-specific adapter responsibilities
- connect to MCP server/tooling endpoint
- execute allowed search/retrieval tools
- normalize results into internal `connector_results`
- preserve source provenance and raw payload metadata

---

## 14.4 Connector result lifecycle

1. run connector search
2. store raw results
3. show candidate results in review screen
4. user chooses import/reject/defer
5. import creates `source` or `authority`
6. if source imported, normal ingest/OCR/review chain begins

---

## 14.5 Recommended initial connector categories

### Evidence-oriented
- document repository
- local folder index
- notes/knowledge base search
- cloud drive-like repository

### Research-oriented
- authority repository
- statute/caselaw notes store
- memo database

### Later possibilities
- docket systems
- email archives
- transcript libraries
- e-discovery exports

---

## 14.6 Provenance requirements

For every connector result, store:
- connector name
- run id
- external item id
- external URI/location
- result snippet
- raw payload
- import decision
- imported local object id

---

## 15. OCR / Parsing / VLM Pipeline

## 15.1 OCR options

Start with a practical local-first approach:
- OCRmyPDF / Tesseract pipeline for scanned PDFs
- pdfplumber / PyMuPDF for text extraction and page handling
- optional image preprocessing for low-quality scans

## 15.2 VLM/image-description workflow

Use VLM or captioning selectively for:
- screenshots
- photos
- image-only scans where OCR is insufficient
- chat screenshots or evidentiary image descriptions

### Output should be stored as:
- extracted image description text
- optional region anchors
- confidence/status
- always marked machine-generated until reviewed

---

## 16. Duplicate Detection Strategy

## 16.1 Purpose
Avoid redundant source records and duplicate chronology/fact pollution.

## 16.2 Methods
- exact file hash matching via `sha256`
- near-duplicate title/size/date heuristics
- text similarity for extracted OCR/doc text
- event similarity checks on date/title/actors

## 16.3 UX
- do not silently merge
- show “possible duplicate” proposals
- let user keep separate, merge, or mark intentionally distinct

---

## 17. Review Workflow Implementation

## 17.1 Proposal queue behavior

All machine-extracted facts/events start in `proposed` state.

### Required review actions
- accept
- accept with edits
- reject
- defer
- mark uncertain

### Acceptance behavior
- accepted fact becomes `fact_assertion`
- accepted event becomes `event`
- audit entries are written
- downstream recompute jobs are triggered

---

## 17.2 Trust state handling

Key rule:
- `proposal.review_state` is not the same as `fact_assertion.review_state`

For example:
- a proposal can be accepted with edits
- the resulting fact becomes approved/reviewed
- later fact edits can supersede the fact without altering proposal history

---

## 18. Claim Support Engine

## 18.1 Initial approach

Do not use opaque scoring. Use interpretable rule-based support states first.

### Inputs
- number of supporting facts
- strength of source links
- presence of adverse facts
- presence of only testimony support
- authority confirmation state

### Output
Set one of:
- no_support
- weak_support
- moderate_support
- strong_support
- conflicted
- not_researched

### Later enhancements
- more advanced heuristic weighting
- confidence explanations
- suggestion engine for likely missing support

---

## 18.2 Gap detection rules (v1)

Examples:
- no approved facts linked to an element => `no_support`
- only one fact, only testimony, no source anchor => `weak_support`
- support facts and contradicting facts both present => `conflicted`
- no controlling authority linked => legal research warning

This should remain explainable to the user.

---

## 19. Export Architecture

## 19.1 Strategy

Use app-native print views first.

### Why
- cheaper than building a separate reporting engine too early
- keeps UI and export representations aligned
- sufficient for chronology and claim chart PDFs early

## 19.2 Export implementation options

### Phase 1
- dedicated printable routes in web app
- browser print to PDF

### Phase 2
- server-side PDF generation for repeatable formatting if needed

### Export targets
- chronology
- claim chart
- evidence/source ledger
- relief matrix

---

## 20. Authentication and Permissions

## 20.1 Initial permissions model

Owner plus invited reviewers.

### Workspace roles
- owner
- reviewer
- commenter
- viewer
- limited editor

### Initial enforcement
- owner manages settings and integrations
- reviewers may comment and approve designated objects
- viewers cannot edit trusted records

## 20.2 Matter/object-level restrictions

Later enhancement, but design for it now by including:
- workspace role
- matter membership override table if needed later
- object-level sensitivity flags

---

## 21. Audit Trail Design

Every meaningful mutation should emit an audit record.

### Record at minimum
- actor user/system
- action type
- target object
- before/after payloads where practical
- timestamp
- context metadata (source of change, API route, job id, prompt version)

This is especially important for:
- fact approval
- event edits
- claim support changes
- agent runs
- connector imports
- export generation

---

## 22. Local Diagnostic / Log Bundle Script Design

## 22.1 Goal

Allow the local tester to collect useful diagnostics and send them back through a `-logs` branch without leaking secrets.

---

## 22.2 Recommended script

### Filename
- `scripts/collect_logs.py`

### Suggested usage
```bash
python scripts/collect_logs.py \
  --feature feature/claim-chart \
  --note "Claim element panel throws error after fact approval" \
  --include-screenshot ./tmp/error.png
```

---

## 22.3 Script responsibilities

1. create timestamped diagnostic directory under `data/diagnostics/`
2. gather:
   - API logs
   - web logs
   - worker logs
   - stack traces
   - package/runtime versions
   - OS/platform summary
   - current git branch/commit
   - sanitized app config summary
3. redact:
   - `.env` values
   - API keys/tokens
   - cookies/session tokens
4. warn if logs appear to include:
   - large excerpts of evidence text
   - obvious secrets
5. optionally include:
   - user note
   - screenshot paths copied into bundle
6. generate manifest file:
   - timestamp
   - branch
   - note
   - included files
   - redaction warnings
7. create or switch to side branch:
   - `feature/<topic>-logs`
8. commit diagnostic bundle
9. push branch
10. print instructions for the remote coding agent

---

## 22.4 Bundle structure

```text
data/diagnostics/2026-09-08T12-30-00Z/
├── manifest.json
├── note.txt
├── versions.txt
├── api.log
├── web.log
├── worker.log
├── git_status.txt
├── config_summary_redacted.json
└── screenshots/
```

---

## 22.5 Optional helper script

Create a second script:
- `scripts/handoff_finish.py`

Purpose:
- remind remote agent to update `handoff/*`
- optionally validate that work log and testing notes changed before ending turn

---

## 23. Recommended Internal Service Modules

Within the API/backend, create service modules roughly like:

```text
apps/api/app/
├── routers/
├── models/
├── schemas/
├── services/
│   ├── workspace_service.py
│   ├── matter_service.py
│   ├── actor_service.py
│   ├── source_service.py
│   ├── ledger_service.py
│   ├── proposal_service.py
│   ├── fact_service.py
│   ├── chronology_service.py
│   ├── claim_service.py
│   ├── relief_service.py
│   ├── authority_service.py
│   ├── search_service.py
│   ├── export_service.py
│   ├── ai_service.py
│   ├── connector_service.py
│   ├── audit_service.py
│   └── permission_service.py
├── integrations/
│   ├── llm/
│   ├── embeddings/
│   ├── ocr/
│   ├── vlm/
│   ├── storage/
│   └── mcp/
└── db/
```

This keeps domain logic readable and avoids API routes becoming too heavy.

---

## 24. Initial Build Order at Technical Level

### Phase T0
- monorepo scaffold
- Docker Compose
- env handling
- `.gitignore`
- handoff files

### Phase T1
- database setup
- auth skeleton
- workspace/matter/actor tables and APIs
- app shell UI

### Phase T2
- upload pipeline
- source tables
- local storage service
- OCR worker
- source viewer

### Phase T3
- ledger entries
- proposals
- fact assertions
- review inbox
- audit log

### Phase T4
- events/chronology
- support links
- proof-link side panel

### Phase T5
- claim templates
- claim instances/elements
- claim support engine
- claim chart UI

### Phase T6
- search index and embeddings
- semantic search APIs
- connector framework/MCP adapters

### Phase T7
- relief and research modules
- agent provider layer
- AI council/multi-agent runs

### Phase T8
- PDF exports
- drafting model
- paragraph support inspection

---

## 25. Testing Strategy for the Technical Build

## 25.1 Test layers

### Unit tests
- date parsing
- support state computation
- duplicate detection heuristics
- provider request normalization
- connector result normalization

### API tests
- matter CRUD
- source upload
- proposal acceptance
- claim element linking
- connector import

### Worker/integration tests
- OCR pipeline
- proposal generation flow
- claim recompute trigger flow
- export jobs

### UI tests
- review inbox actions
- chronology filtering
- claim chart updates
- AI comparison panel

### Local user testing
- guided flows recorded in `handoff/TESTING.md`

---

## 26. Key Technical Risks and Mitigations

### Risk: schema sprawl too early
**Mitigation:** implement core explicit tables first; defer overly generic graph abstractions.

### Risk: OCR and parsing inconsistency
**Mitigation:** store raw OCR outputs, page anchors, and reviewable excerpts; never overwrite originals.

### Risk: AI vendor lock-in
**Mitigation:** provider adapter pattern and prompt registry.

### Risk: external connector material bypasses review
**Mitigation:** connector results always enter candidate review state.

### Risk: performance degradation on long documents
**Mitigation:** page/excerpt indexing, async embedding, filtered retrieval, and background processing.

### Risk: accidental evidence leakage through Git or logs
**Mitigation:** strict `.gitignore`, redacted log script, local storage defaults, explicit external-sharing policy.

---

## 27. Recommended First Database Migration Set

The very first migrations should create only the minimal foundation:

### Migration 001
- users
- workspaces
- workspace_memberships
- workspace_settings
- matters
- matter_links

### Migration 002
- actors
- actor_aliases
- matter_actor_roles

### Migration 003
- sources
- source_matter_links
- source_metadata
- source_pages
- source_excerpts

### Migration 004
- ledger_entries
- proposals
- fact_assertions
- fact_source_links
- fact_actor_links

### Migration 005
- events
- event_fact_links
- event_actor_links

### Migration 006
- claim_templates
- claim_template_elements
- claim_instances
- claim_elements
- claim_element_fact_links

### Migration 007
- authorities
- authority_propositions
- claim_element_authority_links
- relief_requests

### Migration 008
- ai_provider_configs
- agent_personas
- agent_runs
- agent_run_steps

### Migration 009
- connector_configs
- connector_runs
- connector_results

### Migration 010
- tasks
- comments
- approvals
- audit_log_entries
- system_jobs

---

## 28. Recommended First API Milestone

Before advanced AI or MCP work, the first meaningful API milestone should deliver:
- workspace/matter endpoints
- actor endpoints
- source upload and fetch endpoints
- ledger entry CRUD
- proposals list and review actions
- fact CRUD
- chronology event CRUD
- claim template + claim instance CRUD

This is the minimum needed for a useful reviewed evidence-to-claim workflow.

---

## 29. Recommended Next Spec After This One

After this technical spec, the best next planning artifact would be either:

1. **Database schema draft with concrete field types and example migrations**, or
2. **Screen-by-screen UX specification** for:
   - document viewer with proposal sidecar
   - chronology workspace
   - claim chart workspace
   - AI council review screen

### Recommendation
Do the **database schema draft next**, because the current technical spec now defines the main objects and service boundaries clearly enough.

---

## 30. Final Technical Definition

This application should be implemented as a modular local-first full-stack system with a typed frontend, Python API, async evidence-processing workers, relational proof model, hybrid retrieval, provider-agnostic AI layer, MCP-based external connector framework, and strict review/audit controls around factual record creation.

---

**End of Technical Implementation Specification**

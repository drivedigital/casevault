# Contract — Sprint 3: Evidence repository, upload, OCR

**Version:** 1.0 · **Status:** **FROZEN** 2026-09-10 (introduced in commit
`39ce8fb`; Wave 1 agents must implement it as written — see §8 for change
control) · **Scope owner:** integrator (`arena/01a0899f-casevault`) ·
**Implemented by:** WS-A (sources core), WS-B (storage + pipeline), WS-C (web UI), WS-D (verification)

This document is the *only* coordination mechanism between parallel agents for
Sprint 3. Code that follows this contract will integrate; code that needs the
contract changed must request it (see §8) instead of diverging.

Spec sources: `Legal_Matter_Intelligence_Database_Schema_Draft.md` §5.5–5.7,
§6.4 · `Technical_Spec.md` §8, §9.1, §10.1 · `UX_Spec.md` Screens 4–5 ·
`PRD.md` §10.3 · `Roadmap.md` Sprint 3.

---

## 1. File ownership (Wave 1)

| Workstream | Owns (write) | Reads only |
|---|---|---|
| **WS-A** Sources core | `apps/api/app/models/source.py`, `models/enums.py` (append source enums), `models/__init__.py`, `schemas/source.py`, `services/source_service.py`, `routers/sources.py`, `app/main.py` (router registration), `apps/api/alembic/versions/0003_*.py`, `tests/api/test_sources.py` | everything else |
| **WS-B** Storage + pipeline | `apps/api/app/integrations/storage/**`, `workers/pipeline/enqueue.py`, `workers/pipeline/source_jobs.py`, `workers/requirements-ocr.txt`, `tests/workers/test_source_jobs.py` | WS-A files (import models/contract only) |
| **WS-C** Web evidence UI | `apps/web/app/evidence/**`, `apps/web/components/source-*.tsx`, `apps/web/lib/api.ts`, `apps/web/lib/types.ts` | WS-A files (REST contract only) |
| **WS-D** Verification | `tests/integration/test_evidence_e2e.py`, `.github/workflows/ci.yml` (append job), `scripts/pipeline_smoke.py` | all |

Shared-hub rules: only WS-A edits `main.py` / `models/__init__.py` /
`models/enums.py` in this wave. Only WS-C edits `lib/api.ts` / `lib/types.ts`.
WS-B never edits `workers/queues.py` (queue names already exist). No workstream
edits another workstream's test file.

---

## 2. Database (Migration `0003`, revision id `0003`, `down_revision = '0002'`)

Enums added to `apps/api/app/models/enums.py` (Postgres type names must match):

| Python enum | PG type | Values |
|---|---|---|
| `SourceType` | `source_type_enum` | `pdf, image, email, text, markdown, spreadsheet, note, other` |
| `SourceStatus` | `source_status_enum` | `primary, derived, testimony, working_note, public_record` |
| `EvidenceReviewStatus` | `evidence_review_status_enum` | `uploaded, processing, reviewed, cited, included, excluded, duplicate, privileged, settlement_restricted, background_only, impeachment_only` |

### `sources`

| Column | Type | Null | Default |
|---|---|---|---|
| id | UUID PK | no | client-side `uuid4` |
| workspace_id | UUID FK workspaces ON DELETE CASCADE | no | |
| source_type | `source_type_enum` | no | |
| title | VARCHAR(255) | no | |
| original_filename | VARCHAR(255) | yes | |
| mime_type | VARCHAR(128) | yes | |
| storage_path | TEXT | no | relative storage key (§4) |
| sha256 | CHAR(64) | yes | |
| file_size_bytes | BIGINT | yes | |
| page_count | INTEGER | yes | |
| source_status | `source_status_enum` | no | `derived` |
| evidence_review_status | `evidence_review_status_enum` | no | `uploaded` |
| included_flag | BOOLEAN | no | `false` |
| excluded_flag | BOOLEAN | no | `false` |
| exclusion_reason | TEXT | yes | |
| authentication_notes | TEXT | yes | |
| restrictions_notes | TEXT | yes | |
| processing_status | VARCHAR(64) | no | `queued` |
| ocr_status | VARCHAR(64) | no | `not_started` |
| created_by_user_id | UUID FK users | yes | |
| created_at / updated_at | TIMESTAMPTZ | no | `now()` |

Constraints/indexes: `CHECK (NOT (included_flag AND excluded_flag))`; index on
`sha256`; `(workspace_id, source_type)`; `(workspace_id, evidence_review_status)`;
`(workspace_id, title)`.

Status vocabularies (plain strings, service-enforced, not DB enums):
`processing_status ∈ {queued, processing, complete, failed, partial}`,
`ocr_status ∈ {not_started, queued, running, complete, failed, skipped}`.

### `source_matter_links`
`id` UUID PK · `source_id` FK ON DELETE CASCADE · `matter_id` FK ON DELETE CASCADE ·
`link_reason` VARCHAR(128) null · `created_at` · UNIQUE `(source_id, matter_id)`.

### `source_metadata`
`source_id` UUID PK + FK ON DELETE CASCADE · `metadata_json` JSONB not null default `'{}'` ·
`extracted_from_filename_json` JSONB not null default `'{}'` ·
`external_provenance_json` JSONB not null default `'{}'` · `updated_at`.

### `source_pages`
`id` UUID PK · `source_id` FK ON DELETE CASCADE · `page_number` INTEGER not null ·
`page_label` VARCHAR(64) null · `ocr_text` TEXT null · `layout_json` JSONB not null
default `'{}'` · `image_path` TEXT null · `created_at` · `updated_at` ·
UNIQUE `(source_id, page_number)` · index `(source_id, page_number)`.

### `source_excerpts`
`id` UUID PK · `source_id` FK ON DELETE CASCADE · `page_start`/`page_end` INTEGER null ·
`locator_text` TEXT null · `excerpt_text` TEXT null · `excerpt_type` VARCHAR(64) not null ·
`anchor_json` JSONB not null default `'{}'` · `created_by` VARCHAR(16) not null default
`system` · `created_by_user_id` UUID FK users null · `created_at` · `updated_at` ·
index `(source_id, page_start)`.

**Deliberately deferred (do not add in 0003):** `embedding_vector` columns and
vector indexes (pgvector not enabled — see DECISIONS 2026-09-08), full-text GIN
indexes (they land with Sprint 10 search), `sources.duplicate_of_source_id`
(dedupe is response-derived, §3.1).

---

## 3. REST contract (`/api/v1`)

Conventions: UUID paths, `ApiError` shape `{"detail": "..."}` (existing
convention), workspace resolution via `?workspace_id=` → `resolve_workspace_id`
(single-workspace bootstrap). List envelope for the new module:
`{ "items": [...], "total": <int>, "limit": <int>, "offset": <int> }`.

### 3.1 Upload

```
POST /api/v1/sources            multipart/form-data, 201 → SourceOut
  file                     (required) UploadFile
  title                    (optional) falls back to filename stem
  source_type              (optional) one of SourceType; auto-classified from
                           extension/mime when omitted (map in §4.3)
  matter_ids               (optional) comma-separated UUIDs to link on create
  source_status            (optional) default `derived`
```
Rules: sha256 computed on write; if the hash already exists in the workspace,
the response still 201s and `SourceOut.duplicate_of` is populated
`{id, title}` — the UI shows a warning (PRD §10.3 duplicate requirement).
Errors: 413 file too large (§4.4), 415 unsupported/empty file, 404 unknown
`matter_ids`, 422 invalid enum.

### 3.2 Read / update

```
GET    /api/v1/sources                     → SourceListPage
         filters: q (title/filename/original_filename), matter_id,
                  source_type, source_status, evidence_review_status,
                  ocr_status, included(bool), excluded(bool),
                  limit(≤200, default 50), offset, order=-created_at|title
GET    /api/v1/sources/{id}                → SourceDetailOut
GET    /api/v1/sources/{id}/pages          → SourcePageListPage (limit/offset)
GET    /api/v1/sources/{id}/pages/{number} → SourcePageOut
GET    /api/v1/sources/{id}/file           → original bytes (FileResponse,
         correct media type; WS-A serves via storage service; never a raw
         client-supplied path)
PATCH  /api/v1/sources/{id}                → SourceOut
         body: title, source_type, source_status, evidence_review_status,
               included_flag, excluded_flag, exclusion_reason,
               authentication_notes, restrictions_notes
         server rule: setting included_flag=true clears excluded_flag and
         vice versa; both true in one request → 422
PUT    /api/v1/sources/{id}/metadata       → SourceMetadataOut
         body: metadata_json, extracted_from_filename_json,
               external_provenance_json (shallow merge allowed)
POST   /api/v1/sources/{id}/reprocess      → 202 ReprocessOut
         body: {"stages": ["ingest"|"ocr"]} default ["ocr"]
         sets processing/ocr status to `queued`, enqueues worker jobs (§5);
         without redis returns 202 with {"queued": false, "reason": "..."}
POST   /api/v1/sources/{id}/matter-links   → 201 SourceMatterLinkOut
         body: {matter_id, link_reason?}; duplicate → 409
GET    /api/v1/sources/{id}/matter-links   → list[SourceMatterLinkOut]
DELETE /api/v1/source-matter-links/{link_id}  → 204
POST   /api/v1/sources/{id}/excerpts       → 201 SourceExcerptOut
GET    /api/v1/sources/{id}/excerpts       → list[SourceExcerptOut]
```
`SourceOut` fields: `id, workspace_id, source_type, title, original_filename,
mime_type, storage_path, sha256, file_size_bytes, page_count, source_status,
evidence_review_status, included_flag, excluded_flag, exclusion_reason,
authentication_notes, restrictions_notes, processing_status, ocr_status,
created_at, updated_at, duplicate_of`.
`SourceDetailOut`: `source: SourceOut`, `matters: [{id, name, slug, link_reason}]`,
`metadata: SourceMetadataOut | null`, `pages_total: int`,
`excerpts_total: int`, `has_ocr_text: bool`.
`SourcePageOut`: `id, page_number, page_label, ocr_text, layout_json, image_path,
has_text`. Page lists may include `ocr_text`; the UI loads it lazily by page
when `pages_total > 25`.

**No DELETE /sources in v1** — retention decision pending (KNOWN_ISSUES);
exclude via `evidence_review_status=excluded` + `excluded_flag`.

---

## 4. Storage contract (WS-B)

### 4.1 Interface — `app/integrations/storage/base.py`

```python
@dataclass(frozen=True)
class StoredObject:
    key: str          # relative key, also stored in sources.storage_path
    size_bytes: int
    sha256: str

class StorageService(ABC):
    def save_upload(self, stream: BinaryIO, *, key: str) -> StoredObject: ...
    def get_path(self, key: str) -> Path: ...        # absolute, traversal-guarded
    def read_bytes(self, key: str) -> bytes: ...
    def write_derived(self, key: str, content: bytes) -> Path: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...
```
`app/integrations/storage/__init__.py` exports `get_storage()` (cached; built
from `settings.local_storage_root`, default `./data`) — WS-A and WS-B import
only `from app.integrations.storage import get_storage, StoredObject`.
`LocalFileStorage` lives in `local.py`; future `S3Storage` implements the same
ABC (Technical Spec §8.1). Any implementation must raise `StorageKeyError`
(subclass of `ValueError`) for keys escaping the root.

### 4.2 Key layout (deterministic — schema draft §8.2)

```
uploads/{workspace_id}/{source_id}/original{ext}
processed/{workspace_id}/{source_id}/<derived-name>
ocr/{workspace_id}/{source_id}/pages/{page_number}.json
thumbnails/{workspace_id}/{source_id}/page-{page_number}.png
```

### 4.3 Classification map (extension → SourceType, lower-cased)

`.pdf→pdf` · `.png .jpg .jpeg .tif .tiff .webp .heic→image` · `.eml .msg→email` ·
`.txt .log .rtf→text` · `.md .markdown→markdown` · `.csv .xlsx .xls→spreadsheet` ·
`.docx .doc .pages→other` (v1) · anything else → `other`.

### 4.4 Limits

`MAX_UPLOAD_MB` (env, default 200, read through `settings`) — WS-B adds the
setting to `app/config.py`; WS-A enforces it while streaming to storage (413).
Uploads stream to `data/temp/` first, then move into the final key (avoids
partial evidence files on failure).

---

## 5. Worker contract (WS-B)

Queues already defined in `workers/queues.py`: `ingest`, `ocr` (no edits).

```python
# workers/pipeline/source_jobs.py
def ingest_source(source_id: str, workspace_id: str) -> dict: ...
def ocr_source(source_id: str, workspace_id: str) -> dict: ...

# workers/pipeline/enqueue.py  (importable without redis/rq — graceful degrade)
def enqueue_ingest(source_id: str, workspace_id: str) -> dict   # {"queued": bool, "job_id": str|None, "reason": str|None}
def enqueue_ocr(source_id: str, workspace_id: str) -> dict
```
Job behavior:
- `ingest_source`: recompute sha256/size when missing, set `mime_type`,
  `page_count` (PDF via optional `pypdf`), classify `source_type` only when it
  is `other`, then `processing_status = complete|failed` (+ error string in
  `source_metadata.metadata_json["ingest_error"]`).
- `ocr_source`: text/markdown/csv → page 1 `ocr_text` = file content,
  `ocr_status = complete`, `page_count = 1`; PDF/image → use optional
  `pypdf`/`pytesseract`/`pdf2image` when importable and binaries present,
  else `ocr_status = skipped` with `metadata_json["ocr_note"]`; on exception →
  `failed` with `metadata_json["ocr_error"]`. Never raise out of the job;
  always return `{"job": "ocr_source", "status": "...", ...}`.
- Jobs are idempotent (safe to re-run) and use their own DB session
  (`app.db.session.get_session_factory()`).

Dependency policy: OCR/PDF libraries are **optional imports**, declared in
`workers/requirements-ocr.txt` (new file) — `requirements-dev.txt` and CI must
keep passing without them. Adding a mandatory dependency requires a DECISIONS
entry.

---

## 6. Web contract (WS-C)

Routes: `/evidence` (Screen 4: filters + table + upload panel, list default) and
`/evidence/[id]` (Screen 5 v1: page list, viewer = `<iframe>` for PDF,
`<img>` for images, `<pre>` for text/ocr, inspector tabs Metadata / OCR /
Matters / Status). `/evidence` currently 404s — the nav item exists already.

`lib/types.ts` additions: `SourceType`, `SourceStatus`, `EvidenceReviewStatus`,
`ProcessingStatus`, `OcrStatus` unions + `SOURCE_TYPES`, `SOURCE_STATUSES`,
`EVIDENCE_REVIEW_STATUSES` const arrays; interfaces `Source`, `SourceDetail`,
`SourcePage`, `SourceMatterLink`, `SourceMetadata`, `SourceListPage<T>`.

`lib/api.ts` additions (WS-C also fixes `apiFetch` to skip the JSON
`Content-Type` when the body is `FormData`):
`listSources(params)`, `getSource(id)`, `uploadSource(file, opts)`,
`updateSource(id, patch)`, `listSourcePages(id, params)`, `linkSourceToMatter`,
`unlinkSourceFromMatter`, `reprocessSource(id, stages)`,
`sourceFileUrl(id)` → `/api/v1/sources/{id}/file` (relative, proxied).

---

## 7. Verification each workstream must show

| WS | Proof |
|---|---|
| A | `alembic upgrade head` on a fresh DB **and** `downgrade base` → re-upgrade; `pytest tests/api/test_sources.py`; upload→list→filter→patch→link→reprocess via TestClient with a real file |
| B | unit tests for `LocalFileStorage` (round-trip, traversal guard, sha256) + job tests with a text file and a fake PDF; no-redis `enqueue_*` returns `queued=false` |
| C | `npm run lint|typecheck|build --workspace=web`; manual walk against WS-A's API when available; screenshots not required |
| D | end-to-end: start API, upload a real text + PDF + image, assert source row, page rows, file download byte-equality, duplicate warning path; CI job runs the same script |

Sandbox (no Docker) verification uses `scripts/agent_pg.py` (see
`handoff/PARALLEL_PLAN.md` §6).

---

## 8. Change control

The contract is frozen once Wave 1 starts. Any change requires: (1) a note to
the integrator, (2) a `handoff/DECISIONS.md` entry, (3) this file's version
bump in the same PR. Additive changes (new optional field, new endpoint) are
versioned as 1.x and announced to all agents; anything that renames an existing
field/route or changes a status value requires the integrator to sequence the
merge and the affected agents to rebase.

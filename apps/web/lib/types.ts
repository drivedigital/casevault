export type MatterType = "merits" | "proceeding" | "research" | "other";
export type MatterStatus = "active" | "planned" | "hold" | "archived";
export type ActorType = "person" | "entity" | "court" | "agency" | "other";
export type SharingPolicy =
  | "no_ai"
  | "local_only"
  | "external_excerpts_only"
  | "external_selected_full_documents";

export interface Workspace {
  id: string;
  name: string;
  jurisdiction_default: string;
  ai_sharing_default: SharingPolicy;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  matter_type: MatterType;
  status: MatterStatus;
  theory_summary: string | null;
  controlling_memo_ref: string | null;
  next_work: string | null;
  jurisdiction: string;
  ai_sharing_policy: SharingPolicy;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatterLink {
  id: string;
  from_matter_id: string;
  from_matter_name: string;
  to_matter_id: string;
  to_matter_name: string;
  link_type: string;
  direction: "outgoing" | "incoming";
  notes: string | null;
  created_at: string;
}

export interface ActorAlias {
  id: string;
  alias_text: string;
  alias_type: string | null;
}

export interface Actor {
  id: string;
  workspace_id: string;
  actor_type: ActorType;
  display_name: string;
  normalized_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  aliases: ActorAlias[];
}

export interface ActorRole {
  role_id: string;
  matter_id: string;
  matter_name: string;
  matter_slug: string;
  role_label: string;
  notes: string | null;
}

export interface ActorDossier {
  actor: Actor;
  roles: ActorRole[];
}

export interface MatterActor {
  role_id: string;
  actor_id: string;
  actor_name: string;
  actor_type: string;
  role_label: string;
  notes: string | null;
  created_at: string;
}

export const MATTER_LINK_TYPES = [
  "related",
  "overlays",
  "shares_sources",
  "shares_actors",
  "procedural_dependency",
] as const;

export const ACTOR_ROLE_LABELS = [
  "plaintiff",
  "co-party",
  "counterparty",
  "witness",
  "custodian",
  "counsel",
  "court actor",
  "other non-party",
] as const;

// --- Evidence sources (Sprint 3) ---

export type SourceType =
  | "pdf"
  | "image"
  | "email"
  | "text"
  | "markdown"
  | "spreadsheet"
  | "note"
  | "other";

export type SourceStatus =
  | "primary"
  | "derived"
  | "testimony"
  | "working_note"
  | "public_record";

export type EvidenceReviewStatus =
  | "uploaded"
  | "processing"
  | "reviewed"
  | "cited"
  | "included"
  | "excluded"
  | "duplicate"
  | "privileged"
  | "settlement_restricted"
  | "background_only"
  | "impeachment_only";

export interface Source {
  id: string;
  workspace_id: string;
  source_type: SourceType;
  title: string;
  original_filename: string | null;
  mime_type: string | null;
  storage_path: string;
  sha256: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  source_status: SourceStatus;
  evidence_review_status: EvidenceReviewStatus;
  included_flag: boolean;
  excluded_flag: boolean;
  exclusion_reason: string | null;
  authentication_notes: string | null;
  restrictions_notes: string | null;
  processing_status: string;
  ocr_status: string;
  created_at: string;
  updated_at: string;
  duplicate_of: { source_id: string; title: string; sha256: string } | null;
}

export interface SourcePage {
  id: string;
  source_id: string;
  page_number: number;
  page_label: string | null;
  ocr_text: string | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceMatterLink {
  id: string;
  source_id: string;
  source_title: string;
  matter_id: string;
  matter_name: string;
  matter_slug: string;
  link_reason: string | null;
  created_at: string;
}

export const SOURCE_TYPES: SourceType[] = [
  "pdf",
  "image",
  "email",
  "text",
  "markdown",
  "spreadsheet",
  "note",
  "other",
];

export const SOURCE_STATUSES: SourceStatus[] = [
  "primary",
  "derived",
  "testimony",
  "working_note",
  "public_record",
];

export const EVIDENCE_REVIEW_STATUSES: EvidenceReviewStatus[] = [
  "uploaded",
  "processing",
  "reviewed",
  "cited",
  "included",
  "excluded",
  "duplicate",
  "privileged",
  "settlement_restricted",
  "background_only",
  "impeachment_only",
];

// --- Source ledger (Wave 2 / WS-H) ---

export type StrengthLabel = "low" | "medium" | "high";

export const STRENGTH_LABELS: StrengthLabel[] = ["low", "medium", "high"];

export interface LedgerLinkedSource {
  id: string;
  title: string;
}

export interface LedgerEntry {
  id: string;
  workspace_id: string;
  matter_id: string | null;
  external_ledger_id: string | null;
  date_start: string | null;
  date_end: string | null;
  date_text_raw: string | null;
  fact_short_name: string;
  fact_statement: string;
  claim_use_text: string | null;
  relief_use_text: string | null;
  source_path_text: string | null;
  source_locator_text: string | null;
  source_status: SourceStatus | null;
  authentication_or_witness: string | null;
  confidence_level: StrengthLabel | null;
  verification_task_text: string | null;
  restrictions_or_notes: string | null;
  linked_source_id: string | null;
  tags: string[];
  linked_source: LedgerLinkedSource | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntryPage {
  items: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface LedgerImportError {
  row: number;
  error: string;
}

export interface LedgerImportResult {
  valid: number;
  created: number;
  skipped: number;
  errors: LedgerImportError[];
}

export interface LedgerListParams {
  matter_id?: string;
  workspace_id?: string;
  q?: string;
  source_status?: SourceStatus;
  confidence_level?: StrengthLabel;
  tag?: string;
  has_verification_task?: boolean;
  limit?: number;
  offset?: number;
}

export interface LedgerEntryInput {
  matter_id?: string | null;
  external_ledger_id?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  date_text_raw?: string | null;
  fact_short_name?: string;
  fact_statement?: string;
  claim_use_text?: string | null;
  relief_use_text?: string | null;
  source_path_text?: string | null;
  source_locator_text?: string | null;
  source_status?: SourceStatus | null;
  authentication_or_witness?: string | null;
  confidence_level?: StrengthLabel | null;
  verification_task_text?: string | null;
  restrictions_or_notes?: string | null;
  linked_source_id?: string | null;
  tags?: string[];
}

export interface LedgerBulkResult {
  updated: number;
  skipped: number;
  errors: Array<{ id?: string; error: string }>;
}

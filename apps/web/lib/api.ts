import type {
  Actor,
  ActorDossier,
  Matter,
  MatterActor,
  MatterLink,
  Source,
  SourceMatterLink,
  SourcePage,
  SourceStatus,
  Workspace,
} from "./types";

// API URL resolution:
// In development, default to relative /api/v1 (proxied by Next dev server).
// In production on Cloudflare Pages or when NEXT_PUBLIC_API_BASE_URL is set, use the edge worker gateway.
export const getBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return `${process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "")}/api/v1`;
  }
  if (typeof window !== "undefined" && window.location.hostname.includes("pages.dev")) {
    return "https://casevault-worker.dan-2eb.workers.dev/api/v1";
  }
  return "/api/v1";
};

// Lazy/runtime getter for string template usage
export const getBase = () => getBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // WS-C recovery (d22993c): never set the JSON Content-Type on FormData —
  // the browser must set the multipart boundary itself.
  const isFormData = init?.body instanceof FormData;
  const base = getBaseUrl();
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: isFormData
      ? { ...(init?.headers || {}) }
      : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, String(detail));
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  getCurrentWorkspace: () => apiFetch<Workspace>("/workspaces/current"),

  listMatters: (params?: { status?: string; matter_type?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][],
    ).toString();
    return apiFetch<Matter[]>(`/matters${qs ? `?${qs}` : ""}`);
  },
  getMatter: (id: string) => apiFetch<Matter>(`/matters/${id}`),
  createMatter: (payload: Partial<Matter> & { name: string }) =>
    apiFetch<Matter>("/matters", { method: "POST", body: JSON.stringify(payload) }),
  updateMatter: (id: string, payload: Partial<Matter>) =>
    apiFetch<Matter>(`/matters/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listLinks: (matterId: string) => apiFetch<MatterLink[]>(`/matters/${matterId}/links`),
  createLink: (matterId: string, toMatterId: string, linkType: string, notes?: string) =>
    apiFetch<MatterLink>(`/matters/${matterId}/links`, {
      method: "POST",
      body: JSON.stringify({ to_matter_id: toMatterId, link_type: linkType, notes }),
    }),
  deleteLink: (linkId: string) => apiFetch<void>(`/matter-links/${linkId}`, { method: "DELETE" }),

  listActors: (q?: string) =>
    apiFetch<Actor[]>(`/actors${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getActor: (id: string) => apiFetch<ActorDossier>(`/actors/${id}`),
  createActor: (payload: {
    display_name: string;
    actor_type: string;
    description?: string;
    aliases?: string[];
  }) => apiFetch<Actor>("/actors", { method: "POST", body: JSON.stringify(payload) }),
  updateActor: (id: string, payload: Partial<Actor>) =>
    apiFetch<Actor>(`/actors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addAlias: (actorId: string, aliasText: string, aliasType?: string) =>
    apiFetch(`/actors/${actorId}/aliases`, {
      method: "POST",
      body: JSON.stringify({ alias_text: aliasText, alias_type: aliasType || null }),
    }),
  deleteAlias: (aliasId: string) =>
    apiFetch<void>(`/actor-aliases/${aliasId}`, { method: "DELETE" }),

  listMatterActors: (matterId: string) =>
    apiFetch<MatterActor[]>(`/matters/${matterId}/actors`),
  assignRole: (matterId: string, actorId: string, roleLabel: string, notes?: string) =>
    apiFetch<MatterActor>(`/matters/${matterId}/actors`, {
      method: "POST",
      body: JSON.stringify({ actor_id: actorId, role_label: roleLabel, notes }),
    }),
  deleteRole: (roleId: string) => apiFetch<void>(`/matter-roles/${roleId}`, { method: "DELETE" }),

  // --- evidence sources (Sprint 3) ---

  listSources: (params?: {
    matter_id?: string;
    source_type?: string;
    evidence_review_status?: string;
    q?: string;
  }) => {
    // Shipped API (as-shipped delta): plain SourceOut[]; only these four
    // filters are supported server-side (filter parity is a BACKLOG item).
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][],
    ).toString();
    return apiFetch<Source[]>(`/sources${qs ? `?${qs}` : ""}`);
  },
  uploadSource: (
    file: File,
    options?: { title?: string; source_status?: SourceStatus; matter_id?: string },
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (options?.title) form.append("title", options.title);
    if (options?.source_status) form.append("source_status", options.source_status);
    if (options?.matter_id) form.append("matter_id", options.matter_id);
    // apiFetch skips the JSON Content-Type for FormData (multipart boundary).
    return apiFetch<Source>("/sources", { method: "POST", body: form });
  },
  // EU-D (integrator-approved amendment 2026-09-11): optional AbortSignal so
  // the OCR watch loop can genuinely cancel in-flight status requests. All
  // existing callers omit it and behave exactly as before.
  getSource: (id: string, signal?: AbortSignal) =>
    apiFetch<Source>(`/sources/${id}`, signal ? { signal } : undefined),
  updateSource: (
    id: string,
    payload: Partial<
      Pick<
        Source,
        | "title"
        | "source_status"
        | "evidence_review_status"
        | "included_flag"
        | "excluded_flag"
        | "exclusion_reason"
        | "authentication_notes"
        | "restrictions_notes"
      >
    >,
  ) => apiFetch<Source>(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  sourceFileUrl: (id: string) => {
    if (typeof window !== "undefined" && window.location.hostname.includes("pages.dev")) {
      return `/api/v1/sources/${id}/file`;
    }
    return `${getBaseUrl()}/sources/${id}/file`;
  },
  listSourcePages: (id: string) => apiFetch<SourcePage[]>(`/sources/${id}/pages`),
  listSourceMatters: (id: string) => apiFetch<SourceMatterLink[]>(`/sources/${id}/matters`),
  linkSourceToMatter: (matterId: string, sourceId: string, linkReason?: string) =>
    apiFetch<SourceMatterLink>(`/matters/${matterId}/sources`, {
      method: "POST",
      body: JSON.stringify({ source_id: sourceId, link_reason: linkReason ?? null }),
    }),
  listMatterSources: (matterId: string) =>
    apiFetch<Source[]>(`/matters/${matterId}/sources`),
  listMatterSourceLinks: (matterId: string) =>
    apiFetch<SourceMatterLink[]>(`/matters/${matterId}/source-links`),
  deleteSourceMatterLink: (linkId: string) =>
    apiFetch<void>(`/source-matter-links/${linkId}`, { method: "DELETE" }),

  // -------------------------------------------------------------------------
  // Wave 2 · intake core — WS-I (/ai-review) — contract
  // docs/contracts/wave2_intake_core.md v1.0 §4.2–§4.3 + §5.3.
  //
  // APPEND-ONLY section (handoff/AGENT_POLICY.md §2.4): WS-H's ledger client
  // functions live in their own section above; nothing above this line is
  // reordered or reformatted by WS-I.
  //
  // Floor rule (contract §4.1): reviewProposal(accept|accept_with_edits) only
  // creates a fact with review_state `proposed`. approveFact is the one and
  // only client call that can make a fact `accepted`.
  // -------------------------------------------------------------------------

  listProposals: (params?: ProposalListParams) =>
    apiFetch<ProposalPage>(`/proposals${intakeQuery({ ...params })}`),
  createProposal: (payload: NewProposalInput) =>
    apiFetch<Proposal>("/proposals", { method: "POST", body: JSON.stringify(payload) }),
  getProposal: (id: string) => apiFetch<Proposal>(`/proposals/${id}`),
  // PATCH /proposals/{id} is only valid while review_state=proposed (contract §4.2).
  updateProposal: (
    id: string,
    payload: {
      title?: string | null;
      proposed_text?: string | null;
      proposed_structured_json?: ProposedStructuredJson;
      confidence_score?: number | null;
    },
  ) =>
    apiFetch<Proposal>(`/proposals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  reviewProposal: (
    id: string,
    payload: { action: ProposalReviewAction; edits?: ProposalEdits; review_notes?: string | null },
  ) =>
    apiFetch<ProposalReviewResult>(`/proposals/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  bulkReviewProposals: (
    ids: string[],
    action: ProposalReviewAction,
    review_notes?: string | null,
  ) =>
    apiFetch<BulkReviewResult>("/proposals/bulk-review", {
      method: "POST",
      body: JSON.stringify({ ids, action, review_notes: review_notes ?? null }),
    }),
  generateProposals: (sourceId: string, maxProposals?: number) =>
    apiFetch<ProposalGenerateResult>("/proposals/generate", {
      method: "POST",
      body: JSON.stringify({
        source_id: sourceId,
        ...(maxProposals ? { max_proposals: maxProposals } : {}),
      }),
    }),

  listFacts: (params?: FactListParams) =>
    apiFetch<FactPage>(`/facts${intakeQuery({ ...params })}`),
  getFact: (id: string) => apiFetch<Fact>(`/facts/${id}`),
  // Never sends review_state — that is a review action, not an edit (§4.1).
  updateFact: (
    id: string,
    payload: {
      short_label?: string | null;
      statement_text?: string;
      fact_type?: FactType;
      confidence_level?: StrengthLabel | null;
      is_material?: boolean;
    },
  ) => apiFetch<Fact>(`/facts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  // The ONLY route to `accepted` (contract §4.1).
  approveFact: (id: string) =>
    apiFetch<Fact>(`/facts/${id}/approve`, { method: "POST" }),
  setFactReviewState: (id: string, reviewState: FactReviewStateTarget, notes?: string | null) =>
    apiFetch<Fact>(`/facts/${id}/review-state`, {
      method: "POST",
      body: JSON.stringify({ review_state: reviewState, notes: notes ?? null }),
    }),
  supersedeFact: (
    id: string,
    payload: {
      statement_text: string;
      short_label?: string | null;
      fact_type?: FactType;
      confidence_level?: StrengthLabel | null;
    },
  ) =>
    apiFetch<FactSupersedeResult>(`/facts/${id}/supersede`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addFactSourceLink: (
    factId: string,
    payload: {
      source_id: string;
      excerpt_id?: string | null;
      support_type?: SupportType;
      strength?: StrengthLabel | null;
      notes?: string | null;
    },
  ) =>
    apiFetch<FactSourceLink>(`/facts/${factId}/source-links`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFactSourceLink: (linkId: string) =>
    apiFetch<void>(`/fact-source-links/${linkId}`, { method: "DELETE" }),
  addFactActorLink: (factId: string, payload: { actor_id: string; role_in_fact?: string | null }) =>
    apiFetch<FactActorLink>(`/facts/${factId}/actor-links`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFactActorLink: (linkId: string) =>
    apiFetch<void>(`/fact-actor-links/${linkId}`, { method: "DELETE" }),

  // -------------------------------------------------------------------------
  // Wave 1 · WS-C evidence UI — recovered from d22993c, realigned to the
  // shipped API. APPEND-ONLY section (handoff/AGENT_POLICY.md §2.4).
  //
  // POST /sources/{id}/reprocess shipped with W2-EV: 202 ReprocessOut
  // {queued, job_id, reason}, degrading to queued=false without redis.
  // -------------------------------------------------------------------------
  reprocessSource: (id: string, stages?: Array<"ingest" | "ocr">) =>
    apiFetch<{ queued: boolean; job_id: string | null; reason: string | null }>(
      `/sources/${id}/reprocess`,
      { method: "POST", body: JSON.stringify({ stages: stages ?? ["ocr"] }) },
    ),
};

// --- WS-I section (append-only): imports, param types, query helper --------
// Imports for WS-I's own section are declared here rather than inserted into
// the shared import block at the top of the file, so the append-only rule
// holds for both WS-H and WS-I (handoff/AGENT_POLICY.md §2.4).
import type {
  BulkReviewResult,
  Fact,
  FactActorLink,
  FactPage,
  FactReviewStateTarget,
  FactSourceLink,
  FactSupersedeResult,
  FactType,
  NewProposalInput,
  Proposal,
  ProposalEdits,
  ProposalGenerateResult,
  ProposalPage,
  ProposalReviewAction,
  ProposalReviewResult,
  ProposedStructuredJson,
  ReviewState,
  StrengthLabel,
  SupportType,
} from "./types";

/** GET /proposals filters (contract §4.2). */
export type ProposalListParams = {
  matter_id?: string;
  proposal_type?: string;
  review_state?: ReviewState;
  source_id?: string;
  min_confidence?: number;
  limit?: number;
  offset?: number;
};

/** GET /facts filters (contract §4.3); `review_state` is repeatable. */
export type FactListParams = {
  matter_id?: string;
  review_state?: ReviewState[];
  fact_type?: FactType;
  is_material?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

type IntakeQueryValue = string | number | boolean | string[] | undefined | null;

/** Builds `?a=1&b=2` (repeating the key for arrays, e.g. facts' repeatable
 *  `review_state`). Empty strings and null/undefined are omitted; `0` and
 *  `false` are sent deliberately — `is_material=false` must reach the API. */
function intakeQuery(params: Record<string, IntakeQueryValue>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      qs.append(key, String(item));
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

// --- Source ledger (Wave 2 / WS-H) ---

import type {
  LedgerBulkResult,
  LedgerEntry,
  LedgerEntryInput,
  LedgerEntryPage,
  LedgerImportResult,
  LedgerListParams,
} from "./types";

function ledgerQuery(params?: LedgerListParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function listLedgerEntries(params?: LedgerListParams) {
  return apiFetch<LedgerEntryPage>(`/ledger-entries${ledgerQuery(params)}`);
}

export function createLedgerEntry(payload: LedgerEntryInput) {
  return apiFetch<LedgerEntry>("/ledger-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLedgerEntry(id: string, payload: LedgerEntryInput) {
  return apiFetch<LedgerEntry>(`/ledger-entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteLedgerEntry(id: string) {
  return apiFetch<void>(`/ledger-entries/${id}`, { method: "DELETE" });
}

export function linkLedgerSource(id: string, sourceId: string) {
  return apiFetch<LedgerEntry>(`/ledger-entries/${id}/link-source`, {
    method: "POST",
    body: JSON.stringify({ source_id: sourceId }),
  });
}

export function bulkLedger(
  ids: string[],
  patch: Pick<LedgerEntryInput, "tags" | "source_status" | "confidence_level" | "matter_id">,
) {
  return apiFetch<LedgerBulkResult>("/ledger-entries/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, patch }),
  });
}

export async function importLedger(
  fileOrRows: File | { rows: Record<string, unknown>[] },
  dryRun = false,
): Promise<LedgerImportResult> {
  const query = `?dry_run=${dryRun}`;
  if (!(fileOrRows instanceof File)) {
    return apiFetch<LedgerImportResult>(`/ledger-entries/import${query}`, {
      method: "POST",
      body: JSON.stringify(fileOrRows),
    });
  }

  const form = new FormData();
  form.append("file", fileOrRows);
  const response = await fetch(`${getBaseUrl()}/ledger-entries/import${query}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, String(detail));
  }
  return response.json() as Promise<LedgerImportResult>;
}

export function ledgerExportUrl(params?: LedgerListParams) {
  return `${getBaseUrl()}/ledger-entries/export.csv${ledgerQuery(params)}`;
}

// -------------------------------------------------------------------------// Wave 3 · WS-CHRONO — chronology / events client. APPEND-ONLY section// (handoff/AGENT_POLICY.md §2.4): nothing above this line is reordered or// reformatted. Types for this section are declared HERE (not in lib/types.ts,// which is outside the WS-CHRONO write set) following the WS-I precedent of// section-local declarations.//// Chronology invariant (WS-CHRONO brief §1): events may only link facts in// review_state=accepted — the API rejects anything else with 409, and the// link-facts dialog only offers GET /facts?review_state=accepted rows.// -------------------------------------------------------------------------// (ReviewState / StrengthLabel are already imported by the WS-I section's// type block above; this section reuses those module-scope names rather than// re-importing them, keeping the append-only rule intact.)
/** Schema Draft §5.14 `date_precision_enum`. */export type DatePrecision = "exact" | "range" | "approximate" | "unknown";
export const DATE_PRECISIONS: DatePrecision[] = ["exact", "range", "approximate", "unknown"];
/** UI hints for the event dialog's precision selector. */export const PRECISION_HINTS: Record<DatePrecision, string> = {  exact: "A single known calendar date.",  range: "A span with a start and an end date.",  approximate: "Best-known date, given as circa (e.g. “on or about June 3”).",  unknown: "No reliable date yet — keep the raw date text if the source has one.",};
/** event_fact_links.relationship_type (Tech Spec Group G). */export type EventRelationshipType = "supports_event" | "contradicts_event" | "context_only";
export const EVENT_RELATIONSHIP_TYPES: EventRelationshipType[] = [  "supports_event",  "contradicts_event",  "context_only",];
/** Canonical events.significance_level values (free-form tags also allowed). */export const SIGNIFICANCE_LEVELS = ["high", "medium", "low"] as const;
export interface ChronologyFactLink {  id: string;  event_id: string;  fact_id: string;  relationship_type: EventRelationshipType;  created_at: string;  fact_short_label: string | null;  fact_statement: string | null;  fact_review_state: ReviewState | null;}
export interface ChronologyActorLink {  id: string;  event_id: string;  actor_id: string;  role_in_event: string | null;  created_at: string;  actor_name: string | null;}
export interface ChronologyEvent {  id: string;  workspace_id: string;  matter_id: string;  title: string;  description: string | null;  date_start: string | null;  date_end: string | null;  date_precision: DatePrecision;  date_text_raw: string | null;  significance_level: string | null;  review_state: ReviewState;  confidence_level: StrengthLabel | null;  created_from_proposal_id: string | null;  created_at: string;  updated_at: string;  fact_links: ChronologyFactLink[];  actor_links: ChronologyActorLink[];  created_from_proposal: { id: string; proposal_type: string } | null;}
export interface ChronologyEventPage {  items: ChronologyEvent[];  total: number;  limit: number;  offset: number;}
/** GET /matters/{id}/chronology — timeline feed + event-creation candidates. */export interface ChronologyFeed {  matter_id: string;  events: ChronologyEvent[];  unlinked_accepted_fact_count: number;}
export interface EventCreateInput {  matter_id: string;  title: string;  description?: string | null;  date_start?: string | null;  date_end?: string | null;  date_precision?: DatePrecision;  date_text_raw?: string | null;  significance_level?: string | null;  confidence_level?: StrengthLabel | null;}
/** review_state / created_from_proposal_id are server-owned (422 on presence). */export type EventUpdateInput = Partial<Omit<EventCreateInput, "matter_id">>;
export interface EventListParams {  matter_id?: string;  review_state?: ReviewState[];  significance_level?: string;  date_from?: string;  date_to?: string;  q?: string;  limit?: number;  offset?: number;}
/** A fact plus its source links, shaped for the event inspector's evidence *  backlinks (GET /facts/{id} → FactOut; `source_title` is the denormalized *  evidence label added by the API's FactSourceLinkOut). */export interface ChronologyFactDetail {  id: string;  statement_text: string;  short_label: string | null;  review_state: ReviewState;  source_links: {    id: string;    source_id: string;    support_type: string;    strength: StrengthLabel | null;    source_title: string | null;  }[];}
function chronoQuery(params: Record<string, string | number | boolean | string[] | undefined>): string {  const qs = new URLSearchParams();  for (const [key, value] of Object.entries(params)) {    if (value === undefined || value === "") continue;    for (const item of Array.isArray(value) ? value : [value]) qs.append(key, String(item));  }  const encoded = qs.toString();  return encoded ? `?${encoded}` : "";}
export function getMatterChronology(matterId: string) {  return apiFetch<ChronologyFeed>(`/matters/${matterId}/chronology`);}
export function listEvents(params?: EventListParams) {  return apiFetch<ChronologyEventPage>(`/events${chronoQuery({ ...params })}`);}
export function getEvent(id: string) {  return apiFetch<ChronologyEvent>(`/events/${id}`);}
export function createEvent(payload: EventCreateInput) {  return apiFetch<ChronologyEvent>("/events", { method: "POST", body: JSON.stringify(payload) });}
export function updateEvent(id: string, payload: EventUpdateInput) {  return apiFetch<ChronologyEvent>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) });}
export function deleteEvent(id: string) {  return apiFetch<void>(`/events/${id}`, { method: "DELETE" });}
/** 409 unless the fact is review_state=accepted (chronology invariant). */export function linkEventFact(  eventId: string,  payload: { fact_id: string; relationship_type?: EventRelationshipType },) {  return apiFetch<ChronologyFactLink>(`/events/${eventId}/facts`, {    method: "POST",    body: JSON.stringify(payload),  });}
export function deleteEventFactLink(linkId: string) {  return apiFetch<void>(`/event-fact-links/${linkId}`, { method: "DELETE" });}
export function linkEventActor(eventId: string, payload: { actor_id: string; role_in_event?: string | null }) {  return apiFetch<ChronologyActorLink>(`/events/${eventId}/actors`, {    method: "POST",    body: JSON.stringify(payload),  });}
export function deleteEventActorLink(linkId: string) {  return apiFetch<void>(`/event-actor-links/${linkId}`, { method: "DELETE" });}
/** Fact detail for evidence backlinks in the event inspector. */export function getFactForChronology(factId: string) {  return apiFetch<ChronologyFactDetail>(`/facts/${factId}`);}


const request = <T>(path: string, init?: RequestInit) => {
  const cleanPath = path.startsWith("/api/v1") ? path.slice(7) : path;
  return apiFetch<T>(cleanPath, init);
};

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ============================================================================
// BOOTSTRAP SECTION (read-only matters + templates list used as scaffolding;
// WS-MATTERS owns everything outside the WS-CLAIMS marker below long-term)
// ============================================================================

export interface MatterRef {
  id: string;
  title: string;
  status: string;
  matter_type: string;
}

export const listMatters = () => request<MatterRef[]>("/api/v1/matters");

// ============================================================================
// ======================  WS-CLAIMS  (owned section)  =======================
// Legal Claims Matrix & Burden-of-Proof Mapping — apps/web/lib/api.ts
// Other workstreams: DO NOT EDIT inside these markers; append below.
// ============================================================================

export type BurdenStatus = "unsupported" | "partially_supported" | "proven";

export type SupportStatus =
  | "no_support"
  | "weak_support"
  | "moderate_support"
  | "strong_support"
  | "conflicted"
  | "not_researched";

export type LinkPolarity = "support" | "adverse" | "context";
export type WeightLabel = "low" | "medium" | "high";

export interface BurdenRollup {
  status: BurdenStatus;
  label: string;
  elements_total: number;
  proven_elements: number;
  partial_elements: number;
  unsupported_elements: number;
  conflicted_elements: number;
  explanation: string;
}

export interface ClaimRow {
  id: string;
  matter_id: string;
  template_id: string | null;
  claim_code: string | null;
  name: string;
  target_summary: string | null;
  status: string | null;
  theory_summary: string | null;
  highest_priority_gap: string | null;
  authority_verification_state: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  burden: BurdenRollup | null;
  element_count: number;
  gap_count: number;
  support_fact_count: number;
  adverse_fact_count: number;
}

export interface ClaimListResponse {
  items: ClaimRow[];
  limit: number;
  offset: number;
  total: number;
}

export interface EvidenceAnchor {
  source_id: string;
  title: string;
  source_type: string;
  source_status: string;
  evidence_review_status: string;
  is_primary_anchor: boolean;
  locator_text: string | null;
  page_start: number | null;
  page_end: number | null;
  excerpt_text: string | null;
}

export interface ElementFact {
  link_id: string;
  fact_id: string;
  short_label: string | null;
  statement_text: string;
  review_state: string;
  confidence_level: string | null;
  fact_type: string;
  link_polarity: string;
  weight_label: string | null;
  link_notes: string | null;
  has_primary_source: boolean;
  evidence: EvidenceAnchor[];
}

export interface ElementAuthority {
  link_id: string;
  authority_id: string;
  link_type: string;
  authority_type: string;
  title: string;
  citation_text: string | null;
  jurisdiction: string | null;
  holding_summary: string | null;
}

export interface ElementWarning {
  code: string;
  message: string;
  severity: "info" | "caution" | "alert";
}

export interface ChartElement {
  id: string;
  element_order: number;
  element_label: string;
  element_description: string | null;
  stored_support_status: SupportStatus;
  computed_support_status: SupportStatus;
  burden_status: BurdenStatus;
  support_points: number;
  adverse_points: number;
  has_primary_anchor: boolean;
  testimony_only: boolean;
  conflicted: boolean;
  has_controlling_authority: boolean;
  gap_text: string | null;
  risk_text: string | null;
  notes: string | null;
  warnings: ElementWarning[];
  support_facts: ElementFact[];
  adverse_facts: ElementFact[];
  context_facts: ElementFact[];
  authorities: ElementAuthority[];
}

export interface GapRow {
  element_id: string;
  element_order: number;
  element_label: string;
  severity: "info" | "caution" | "alert";
  code: string;
  message: string;
}

export interface ClaimChart {
  claim: ClaimRow;
  burden: BurdenRollup;
  elements: ChartElement[];
  gaps: GapRow[];
}

export interface ClaimTemplate {
  id: string;
  jurisdiction: string;
  name: string;
  category: string | null;
  source_authority_text: string | null;
  notes: string | null;
  is_active: boolean;
  element_count: number;
  elements: {
    id: string;
    element_order: number;
    element_label: string;
    element_description: string | null;
    is_issue_row: boolean;
  }[];
}

export interface SupportCandidate {
  fact_id: string;
  short_label: string | null;
  statement_text: string;
  review_state: string;
  confidence_level: string | null;
  is_material: boolean;
  score: number;
  score_reasons: string[];
  evidence_sources: string[];
}

export interface ClaimCreateInput {
  matter_id: string;
  template_id?: string | null;
  name: string;
  claim_code?: string | null;
  target_summary?: string | null;
  status?: string | null;
  theory_summary?: string | null;
  notes?: string | null;
}

export const claimsApi = {
  listTemplates: (jurisdiction?: string) =>
    request<ClaimTemplate[]>(`/api/v1/claim-templates${qs({ jurisdiction })}`),

  listClaims: (params: {
    matter_id?: string;
    burden?: BurdenStatus | "";
    q?: string;
    limit?: number;
    offset?: number;
  }) => request<ClaimListResponse>(`/api/v1/claim-instances${qs(params)}`),

  getClaim: (id: string) => request<ClaimRow>(`/api/v1/claim-instances/${id}`),

  getChart: (id: string) => request<ClaimChart>(`/api/v1/claim-instances/${id}/chart`),

  createClaim: (input: ClaimCreateInput) =>
    request<ClaimRow>("/api/v1/claim-instances", { method: "POST", body: JSON.stringify(input) }),

  patchClaim: (id: string, patch: Partial<ClaimCreateInput> & Record<string, unknown>) =>
    request<ClaimRow>(`/api/v1/claim-instances/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteClaim: (id: string) =>
    request<void>(`/api/v1/claim-instances/${id}`, { method: "DELETE" }),

  recompute: (id: string) =>
    request<ClaimChart>(`/api/v1/claim-instances/${id}/recompute-support`, { method: "POST" }),

  patchElement: (
    elementId: string,
    patch: {
      element_label?: string;
      element_description?: string | null;
      support_status?: SupportStatus;
      gap_text?: string | null;
      risk_text?: string | null;
      notes?: string | null;
    },
  ) =>
    request<ChartElement>(`/api/v1/claim-elements/${elementId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  linkFact: (
    elementId: string,
    body: { fact_id: string; link_polarity: LinkPolarity; weight_label?: WeightLabel | null; notes?: string | null },
  ) =>
    request<ChartElement>(`/api/v1/claim-elements/${elementId}/link-fact`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  unlinkFact: (elementId: string, linkId: string) =>
    request<void>(`/api/v1/claim-elements/${elementId}/link-fact/${linkId}`, {
      method: "DELETE",
    }),

  candidates: (elementId: string, includeLinked = false) =>
    request<SupportCandidate[]>(
      `/api/v1/claim-elements/${elementId}/support-candidates${qs({ include_linked: includeLinked })}`,
    ),
};



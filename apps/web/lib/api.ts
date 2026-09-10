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

// Relative paths: the Next dev server proxies /api/v1/* to the API
// (see next.config.mjs), so browser code never hard-codes the API host.
const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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
    // Note: no JSON content-type — the browser sets the multipart boundary.
    return fetch(`${BASE}/sources`, { method: "POST", body: form }).then(async (resp) => {
      if (!resp.ok) {
        let detail = resp.statusText;
        try {
          detail = (await resp.json()).detail ?? detail;
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(resp.status, String(detail));
      }
      return resp.json() as Promise<Source>;
    });
  },
  getSource: (id: string) => apiFetch<Source>(`/sources/${id}`),
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
  sourceFileUrl: (id: string) => `${BASE}/sources/${id}/file`,
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
  const response = await fetch(`${BASE}/ledger-entries/import${query}`, {
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
  return `${BASE}/ledger-entries/export.csv${ledgerQuery(params)}`;
}

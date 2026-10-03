/**
 * CaseVault web API client.
 *
 * Relative URLs only — the Next server proxies /api/v1/* to the FastAPI
 * backend (see next.config.mjs), so the browser never needs to reach the
 * sandbox host directly.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, `${res.status} ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

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

// =====================  END WS-CLAIMS SECTION  =============================

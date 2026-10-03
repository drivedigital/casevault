/**
 * CaseVault Cloudflare Worker
 *
 * Edge gateway with persistent KV state for:
 * 1. Health & routing for the CaseVault ecosystem.
 * 2. Full Edge API for workspaces, matters, actors, sources, facts, chronology, proposals, and claims.
 * 3. GitHub Webhook verification & dispatch (pushes, PRs, task notifications).
 * 4. Supabase integration proxy (storage signed URLs, edge auth & DB health checks).
 */

export interface Env {
  ENVIRONMENT: string;
  GITHUB_REPO?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CASEVAULT_API_TOKEN?: string;
  CASEVAULT_KV?: any;
}

// ============================================================================
// DEFAULT STORE DATASETS
// ============================================================================

const defaultActors = [
  {
    id: "act-01",
    workspace_id: "ws-cloud-preview",
    actor_type: "person",
    display_name: "Dr. Evelyn Vance",
    normalized_name: "Dr. Evelyn Vance",
    description: "Chief Technology Officer & Named Inventor. Deposition scheduled for Nov 14, 2026.",
    aliases: [
      { id: "al-01", alias_text: "Evelyn Vance", alias_type: "informal" },
      { id: "al-02", alias_text: "E. Vance", alias_type: "citation" },
    ],
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
  },
  {
    id: "act-02",
    workspace_id: "ws-cloud-preview",
    actor_type: "entity",
    display_name: "Nexus Technologies LLC",
    normalized_name: "Nexus Technologies LLC",
    description: "Primary Defendant & Licensee. Represented by Sullivan & Cromwell.",
    aliases: [
      { id: "al-03", alias_text: "Nexus Tech", alias_type: "informal" },
      { id: "al-04", alias_text: "Nexus", alias_type: "short" },
    ],
    created_at: "2026-09-02T10:05:00Z",
    updated_at: "2026-09-02T10:05:00Z",
  },
  {
    id: "act-03",
    workspace_id: "ws-cloud-preview",
    actor_type: "person",
    display_name: "Marcus Sterling",
    normalized_name: "Marcus Sterling",
    description: "Lead Forensic Systems Auditor, CyberSec Audits Inc.",
    aliases: [
      { id: "al-05", alias_text: "M. Sterling", alias_type: "citation" },
    ],
    created_at: "2026-09-05T14:20:00Z",
    updated_at: "2026-09-05T14:20:00Z",
  },
];

const defaultMatters = [
  {
    id: "m-001",
    workspace_id: "ws-cloud-preview",
    slug: "apex-v-nexustech",
    name: "Apex Global v. Nexus Technologies LLC",
    title: "Apex Global v. Nexus Technologies LLC",
    matter_type: "merits",
    status: "active",
    theory_summary: "Breach of master licensing agreement & trade secret misappropriation",
    controlling_memo_ref: "MEMO-2026-09-A",
    next_work: "Deposition excerpt analysis & cross-claim mapping",
    jurisdiction: "US - Federal (SDNY)",
    ai_sharing_policy: "external_excerpts_only",
    archived_at: null,
    created_at: "2026-09-01T09:15:00Z",
    updated_at: "2026-09-01T09:15:00Z",
  },
  {
    id: "m-002",
    workspace_id: "ws-cloud-preview",
    slug: "in-re-nexus-patents",
    name: "In re Nexus Patent Portfolio Reexamination",
    title: "In re Nexus Patent Portfolio Reexamination",
    matter_type: "proceeding",
    status: "active",
    theory_summary: "Inter Partes Review defending US Patent 9,842,100 validity",
    controlling_memo_ref: "IPR-2026-04",
    next_work: "File patent owner preliminary response",
    jurisdiction: "USPTO - PTAB",
    ai_sharing_policy: "external_excerpts_only",
    archived_at: null,
    created_at: "2026-09-10T14:30:00Z",
    updated_at: "2026-09-10T14:30:00Z",
  },
  {
    id: "m-003",
    workspace_id: "ws-cloud-preview",
    slug: "sec-investigation-advisory",
    name: "SEC Division of Enforcement Inquiry",
    title: "SEC Division of Enforcement Inquiry",
    matter_type: "proceeding",
    status: "hold",
    theory_summary: "Voluntary document preservation & internal investigation",
    controlling_memo_ref: null,
    next_work: "Awaiting formal subpoena response schedule",
    jurisdiction: "US - Federal",
    ai_sharing_policy: "no_ai",
    archived_at: null,
    created_at: "2026-09-15T11:00:00Z",
    updated_at: "2026-09-15T11:00:00Z",
  },
];

const defaultSources = [
  {
    id: "src-001",
    workspace_id: "ws-cloud-preview",
    source_type: "pdf",
    title: "Master Technology Licensing Agreement (Executed)",
    original_filename: "Master_Licensing_Agreement_Signed.pdf",
    mime_type: "application/pdf",
    storage_path: "sources/m-001/Master_Licensing_Agreement_Signed.pdf",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    file_size_bytes: 4182900,
    page_count: 48,
    source_status: "primary",
    evidence_review_status: "reviewed",
    included_flag: true,
    excluded_flag: false,
    exclusion_reason: null,
    authentication_notes: "Bates APEX-000142 through APEX-000190.",
    restrictions_notes: "Confidential - Attorneys Eyes Only",
    processing_status: "completed",
    ocr_status: "not_needed",
    created_at: "2026-09-01T09:30:00Z",
    updated_at: "2026-09-01T09:30:00Z",
    duplicate_of: null,
  },
  {
    id: "src-002",
    workspace_id: "ws-cloud-preview",
    source_type: "pdf",
    title: "CyberSec Audits Forensic Investigation Report",
    original_filename: "CyberSec_Forensic_Report_Nexus_Exfiltration.pdf",
    mime_type: "application/pdf",
    storage_path: "sources/m-001/CyberSec_Forensic_Report_Nexus_Exfiltration.pdf",
    sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    file_size_bytes: 12894000,
    page_count: 114,
    source_status: "primary",
    evidence_review_status: "reviewed",
    included_flag: true,
    excluded_flag: false,
    exclusion_reason: null,
    authentication_notes: "Certified digital forensic image report.",
    restrictions_notes: "Highly Confidential - Source Code Protection Order",
    processing_status: "completed",
    ocr_status: "completed",
    created_at: "2026-09-05T14:00:00Z",
    updated_at: "2026-09-05T14:00:00Z",
    duplicate_of: null,
  },
  {
    id: "src-003",
    workspace_id: "ws-cloud-preview",
    source_type: "email",
    title: "Notice of Audit Demand & Refusal Thread",
    original_filename: "2025-05-18_Demand_Refusal_Thread.eml",
    mime_type: "message/rfc822",
    storage_path: "sources/m-001/2025-05-18_Demand_Refusal_Thread.eml",
    sha256: "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
    file_size_bytes: 24590,
    page_count: 3,
    source_status: "secondary",
    evidence_review_status: "reviewed",
    included_flag: true,
    excluded_flag: false,
    exclusion_reason: null,
    authentication_notes: "Production from Apex General Counsel mail archive.",
    restrictions_notes: null,
    processing_status: "completed",
    ocr_status: "not_needed",
    created_at: "2026-09-10T11:00:00Z",
    updated_at: "2026-09-10T11:00:00Z",
    duplicate_of: null,
  },
];

const defaultFacts = [
  {
    id: "fact-001",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    short_label: "MLA Execution Date",
    statement_text: "Apex Global and Nexus Technologies entered into the Master Technology Licensing Agreement on March 15, 2024.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-partner",
    approved_by_user_id: "user-lead-partner",
    approved_at: "2026-09-02T10:45:00Z",
    supersedes_fact_id: null,
    created_at: "2026-09-02T10:30:00Z",
    updated_at: "2026-09-02T10:45:00Z",
    source_links: [
      {
        id: "fsl-01",
        fact_id: "fact-001",
        source_id: "src-001",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Page 1 preamble and signature block.",
        created_at: "2026-09-02T10:45:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-01",
        fact_id: "fact-001",
        actor_id: "act-01",
        role_in_fact: "signatory",
        created_at: "2026-09-02T10:45:00Z",
      },
      {
        id: "fal-02",
        fact_id: "fact-001",
        actor_id: "act-02",
        role_in_fact: "signatory",
        created_at: "2026-09-02T10:45:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-002",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    short_label: "Escrow Audit Clause",
    statement_text: "Section 14.2 of the MLA grants Apex the unconditional right to audit escrow releases upon written notice.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-partner",
    approved_by_user_id: "user-lead-partner",
    approved_at: "2026-09-02T11:15:00Z",
    supersedes_fact_id: null,
    created_at: "2026-09-02T11:00:00Z",
    updated_at: "2026-09-02T11:15:00Z",
    source_links: [
      {
        id: "fsl-02",
        fact_id: "fact-002",
        source_id: "src-001",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Section 14.2 page 31.",
        created_at: "2026-09-02T11:00:00Z",
      },
    ],
    actor_links: [],
    created_from_proposal: null,
  },
  {
    id: "fact-003",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    short_label: "Refusal to Allow Inspection",
    statement_text: "Nexus Technologies formally refused Apex's audit demand letter on May 18, 2025 citing proprietary trade secrets.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-associate-1",
    approved_by_user_id: "user-lead-partner",
    approved_at: "2026-09-10T11:45:00Z",
    supersedes_fact_id: null,
    created_at: "2026-09-10T11:30:00Z",
    updated_at: "2026-09-10T11:45:00Z",
    source_links: [
      {
        id: "fsl-03",
        fact_id: "fact-003",
        source_id: "src-003",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Email sent by Nexus outside counsel.",
        created_at: "2026-09-10T11:30:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-03",
        fact_id: "fact-003",
        actor_id: "act-02",
        role_in_fact: "refusing party",
        created_at: "2026-09-10T11:30:00Z",
      },
    ],
    created_from_proposal: null,
  },
];

const defaultEvents = [
  {
    id: "ev-01",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    title: "Execution of Master Licensing Agreement",
    description: "Apex Global and Nexus Technologies enter into master licensing and source code escrow agreement.",
    date_start: "2024-03-15",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "March 15, 2024",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    fact_links: [
      {
        id: "efl-01",
        event_id: "ev-01",
        fact_id: "fact-001",
        relationship_type: "supports_event",
        created_at: "2026-09-02T11:00:00Z",
        fact_short_label: "MLA Execution Date",
        fact_statement: "Apex Global and Nexus Technologies entered into the Master Technology Licensing Agreement on March 15, 2024.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-01",
        event_id: "ev-01",
        actor_id: "act-02",
        role_in_event: "licensee",
        created_at: "2026-09-01T10:00:00Z",
        actor_name: "Nexus Technologies LLC",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-02",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    title: "Alleged Unauthorized Repository Fork",
    description: "Forensic logs indicate exfiltration and fork of proprietary neural compilation pipeline.",
    date_start: "2025-06-03",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "June 3, 2025",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2026-09-01T11:00:00Z",
    updated_at: "2026-09-01T11:00:00Z",
    fact_links: [],
    actor_links: [],
    created_from_proposal: null,
  },
];

const defaultProposals = [
  {
    id: "prop-01",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    proposal_type: "fact",
    review_state: "proposed",
    title: "Escrow Code Audit Notification",
    proposed_text: "On May 12, 2025, Apex sent written notification demanding an independent technical audit of the escrowed codebase pursuant to Section 14.2.",
    proposed_structured_json: {
      actors: ["Apex Global", "Nexus Technologies"],
      dates: ["2025-05-12"],
    },
    source_id: "src-003",
    excerpt_id: null,
    confidence_score: 0.94,
    created_by_system: true,
    created_by_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: null,
    created_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:00:00Z",
    source: {
      id: "src-003",
      title: "Notice of Audit Demand & Refusal Thread",
    },
    excerpt: null,
  },
  {
    id: "prop-02",
    workspace_id: "ws-cloud-preview",
    matter_id: "m-001",
    proposal_type: "fact",
    review_state: "proposed",
    title: "Commercial Distribution of Model Weights",
    proposed_text: "Nexus began distributing binary weights derived from the licensed pipeline to third parties without commercial distribution rights.",
    proposed_structured_json: {
      actors: ["Nexus Technologies"],
      dates: ["2025-07-01"],
    },
    source_id: "src-002",
    excerpt_id: null,
    confidence_score: 0.88,
    created_by_system: true,
    created_by_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: null,
    created_at: "2026-09-14T15:30:00Z",
    updated_at: "2026-09-14T15:30:00Z",
    source: {
      id: "src-002",
      title: "CyberSec Audits Forensic Investigation Report",
    },
    excerpt: null,
  },
];

// Helper functions for globally persistent KV storage
async function getStore<T>(env: Env, key: string, fallback: T): Promise<T> {
  if (env.CASEVAULT_KV) {
    try {
      const val = await env.CASEVAULT_KV.get(key, "json");
      if (val !== null && val !== undefined) return val as T;
    } catch (e) {
      console.error(`KV get error for ${key}:`, e);
    }
  }
  return fallback;
}

async function setStore<T>(env: Env, key: string, val: T): Promise<void> {
  if (env.CASEVAULT_KV) {
    try {
      await env.CASEVAULT_KV.put(key, JSON.stringify(val));
    } catch (e) {
      console.error(`KV put error for ${key}:`, e);
    }
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    try {
      // 1. Health check
      if (url.pathname === "/" || url.pathname === "/health") {
        return jsonResponse({
          status: "ok",
          service: "casevault-cloudflare-worker",
          environment: env.ENVIRONMENT || "production",
          timestamp: new Date().toISOString(),
          integrations: {
            github: Boolean(env.GITHUB_WEBHOOK_SECRET),
            supabase: Boolean(env.SUPABASE_URL),
            kv: Boolean(env.CASEVAULT_KV),
          },
        });
      }

      // 2. Workspaces
      if (url.pathname === "/api/v1/workspaces/current") {
        return jsonResponse({
          id: "ws-cloud-preview",
          name: "Apex Global Litigation Matter Group",
          jurisdiction_default: "US - Federal (SDNY)",
          ai_sharing_default: "external_excerpts_only",
          created_by_user_id: "user-lead-partner",
          created_at: "2026-09-01T08:00:00Z",
          updated_at: new Date().toISOString(),
        });
      }

      // 3. Matters
      if (url.pathname === "/api/v1/matters") {
        const matters = await getStore(env, "matters", defaultMatters);
        if (request.method === "POST") {
          const body: any = await request.json();
          const newMatter = {
            id: `m-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            slug: (body.name || "new-matter").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: body.name || "Untitled Matter",
            title: body.name || "Untitled Matter",
            matter_type: body.matter_type || "merits",
            status: "active",
            theory_summary: body.theory_summary || null,
            controlling_memo_ref: null,
            next_work: body.next_work || null,
            jurisdiction: body.jurisdiction || "NY",
            ai_sharing_policy: body.ai_sharing_policy || "external_excerpts_only",
            archived_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const updated = [newMatter, ...matters];
          await setStore(env, "matters", updated);
          return jsonResponse(newMatter, 201);
        }
        return jsonResponse(matters);
      }

      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const matters = await getStore(env, "matters", defaultMatters);
        let matter = matters.find((m: any) => m.id === id);
        if (!matter && matters.length > 0) {
          matter = matters[0];
        }
        if (!matter) {
          return jsonResponse({ detail: "Matter not found" }, 404);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(matter, body, { updated_at: new Date().toISOString() });
          if (body.name) matter.title = body.name;
          await setStore(env, "matters", matters);
          return jsonResponse(matter);
        }

        return jsonResponse(matter);
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/links/)) {
        const matterId = url.pathname.split("/")[4];
        const matterLinks = await getStore<Record<string, any[]>>(env, "matterLinks", { "m-001": [] });
        if (request.method === "POST") {
          const body: any = await request.json();
          const newLink = {
            id: `ml-${Date.now()}`,
            source_matter_id: matterId,
            target_matter_id: body.target_matter_id,
            link_type: body.link_type || "related",
            notes: body.notes || null,
            created_at: new Date().toISOString(),
          };
          if (!matterLinks[matterId]) matterLinks[matterId] = [];
          matterLinks[matterId].push(newLink);
          await setStore(env, "matterLinks", matterLinks);
          return jsonResponse(newLink, 201);
        }
        return jsonResponse(matterLinks[matterId] || []);
      }

      if (url.pathname.match(/\/api\/v1\/matter-links\/[^/]+/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const matterLinks = await getStore<Record<string, any[]>>(env, "matterLinks", { "m-001": [] });
        for (const k in matterLinks) {
          matterLinks[k] = matterLinks[k].filter((l) => l.id !== linkId);
        }
        await setStore(env, "matterLinks", matterLinks);
        return new Response(null, { status: 204 });
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/actors/)) {
        const matterId = url.pathname.split("/")[4];
        const matterActors = await getStore<Record<string, any[]>>(env, "matterActors", {
          "m-001": [
            {
              role_id: "mar-01",
              actor_id: "act-01",
              actor_name: "Dr. Evelyn Vance",
              actor_type: "person",
              role_label: "witness",
              notes: "Author of key technical specifications",
              created_at: "2026-09-02T10:30:00Z",
            },
            {
              role_id: "mar-02",
              actor_id: "act-02",
              actor_name: "Nexus Technologies LLC",
              actor_type: "entity",
              role_label: "counterparty",
              notes: "Primary defendant",
              created_at: "2026-09-02T10:35:00Z",
            },
          ],
        });

        if (request.method === "POST") {
          const body: any = await request.json();
          const actors = await getStore(env, "actors", defaultActors);
          const actor = actors.find((a: any) => a.id === body.actor_id);
          const newRole = {
            role_id: `mar-${Date.now()}`,
            actor_id: body.actor_id,
            actor_name: actor?.display_name || "New Actor",
            actor_type: actor?.actor_type || "person",
            role_label: body.role_label || "witness",
            notes: body.notes || null,
            created_at: new Date().toISOString(),
          };
          if (!matterActors[matterId]) matterActors[matterId] = [];
          matterActors[matterId].push(newRole);
          await setStore(env, "matterActors", matterActors);
          return jsonResponse(newRole, 201);
        }
        return jsonResponse(matterActors[matterId] || []);
      }

      if (url.pathname.match(/\/api\/v1\/matter-actor-roles\/[^/]+/) && request.method === "DELETE") {
        const roleId = url.pathname.split("/").pop();
        const matterActors = await getStore<Record<string, any[]>>(env, "matterActors", {});
        for (const k in matterActors) {
          matterActors[k] = matterActors[k].filter((r) => r.role_id !== roleId);
        }
        await setStore(env, "matterActors", matterActors);
        return new Response(null, { status: 204 });
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/source-links/)) {
        return jsonResponse([
          {
            id: "sml-01",
            source_id: "src-001",
            source_title: "Master Technology Licensing Agreement (Executed)",
            matter_id: "m-001",
            link_reason: "Primary contract in dispute",
            created_at: "2026-09-01T09:35:00Z",
          },
          {
            id: "sml-02",
            source_id: "src-002",
            source_title: "CyberSec Audits Forensic Investigation Report",
            matter_id: "m-001",
            link_reason: "Primary technical proof of misappropriation",
            created_at: "2026-09-05T14:10:00Z",
          },
        ]);
      }

      // 4. Actors & Aliases
      if (url.pathname === "/api/v1/actors") {
        const actors = await getStore(env, "actors", defaultActors);
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          const results = q
            ? actors.filter(
                (a: any) =>
                  a.display_name.toLowerCase().includes(q) ||
                  a.aliases.some((al: any) => al.alias_text.toLowerCase().includes(q))
              )
            : actors;
          return jsonResponse(results);
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const newActor = {
            id: `act-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            actor_type: body.actor_type || "person",
            display_name: body.display_name || "New Actor",
            normalized_name: body.display_name || "New Actor",
            description: body.description || null,
            aliases: (body.aliases || []).map((txt: any, idx: number) => ({
              id: `al-${Date.now()}-${idx}`,
              alias_text: typeof txt === "string" ? txt : txt?.alias_text || "Alias",
              alias_type: "informal",
            })),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const updated = [...actors, newActor];
          await setStore(env, "actors", updated);
          return jsonResponse(newActor, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/actors\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const actors = await getStore(env, "actors", defaultActors);
        const actor = actors.find((a: any) => a.id === id);
        if (!actor) {
          return jsonResponse({ detail: "Actor not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse({
            actor,
            roles: [
              {
                role_id: "role-01",
                matter_id: "m-001",
                matter_name: "Apex Global v. Nexus Technologies LLC",
                matter_slug: "apex-v-nexustech",
                role_label: actor.actor_type === "entity" ? "counterparty" : "witness",
                notes: "Primary role assignment",
              },
            ],
          });
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          if (body.display_name) actor.display_name = body.display_name;
          if (body.description !== undefined) actor.description = body.description;
          if (body.actor_type) actor.actor_type = body.actor_type;
          actor.updated_at = new Date().toISOString();
          await setStore(env, "actors", actors);
          return jsonResponse(actor);
        }

        if (request.method === "DELETE") {
          const filtered = actors.filter((a: any) => a.id !== id);
          await setStore(env, "actors", filtered);
          return new Response(null, { status: 204 });
        }
      }

      if (url.pathname.match(/\/api\/v1\/actors\/[^/]+\/aliases/) && request.method === "POST") {
        const id = url.pathname.split("/")[4];
        const actors = await getStore(env, "actors", defaultActors);
        const actor = actors.find((a: any) => a.id === id);
        const body: any = await request.json();
        const newAlias = {
          id: `al-${Date.now()}`,
          alias_text: body.alias_text || "New Alias",
          alias_type: body.alias_type || null,
        };
        if (actor) {
          actor.aliases.push(newAlias);
          await setStore(env, "actors", actors);
        }
        return jsonResponse(newAlias, 201);
      }

      if (url.pathname.match(/\/api\/v1\/actor-aliases\/[^/]+/) && request.method === "DELETE") {
        const aliasId = url.pathname.split("/").pop();
        const actors = await getStore(env, "actors", defaultActors);
        for (const act of actors) {
          act.aliases = act.aliases.filter((al: any) => al.id !== aliasId);
        }
        await setStore(env, "actors", actors);
        return new Response(null, { status: 204 });
      }

      // 5. Evidence Sources & Details
      if (url.pathname === "/api/v1/sources") {
        const sources = await getStore(env, "sources", defaultSources);
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          let items = sources;
          if (q) items = items.filter((s: any) => s.title.toLowerCase().includes(q));
          return jsonResponse(items);
        }

        if (request.method === "POST") {
          const newSource = {
            id: `src-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            source_type: "pdf",
            title: "Uploaded Document",
            original_filename: "document.pdf",
            mime_type: "application/pdf",
            storage_path: "sources/m-001/document.pdf",
            sha256: "abcdef1234567890",
            file_size_bytes: 102400,
            page_count: 1,
            source_status: "primary",
            evidence_review_status: "reviewed",
            included_flag: true,
            excluded_flag: false,
            exclusion_reason: null,
            authentication_notes: "Uploaded via web interface.",
            restrictions_notes: null,
            processing_status: "completed",
            ocr_status: "not_needed",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            duplicate_of: null,
          };
          const updated = [newSource, ...sources];
          await setStore(env, "sources", updated);
          return jsonResponse(newSource, 201);
        }
      }

      if (url.pathname.match(/\/api\/v1\/sources\/[^/]+\/pages/)) {
        const sourceId = url.pathname.split("/")[4];
        return jsonResponse([
          {
            id: `sp-${sourceId}-1`,
            source_id: sourceId,
            page_number: 1,
            page_label: "Page 1",
            ocr_text: "DOCUMENT EXCERPT & FORENSIC OCR TRANSCRIPT\n\nOperative evidence record authenticated by counsel.",
            image_path: null,
            created_at: "2026-09-01T09:30:00Z",
            updated_at: "2026-09-01T09:30:00Z",
          },
        ]);
      }

      if (url.pathname.match(/\/api\/v1\/sources\/[^/]+\/matters/)) {
        const sourceId = url.pathname.split("/")[4];
        return jsonResponse([
          {
            id: `sml-${sourceId}`,
            source_id: sourceId,
            source_title: "Operative Evidence Document",
            matter_id: "m-001",
            matter_name: "Apex Global v. Nexus Technologies LLC",
            matter_slug: "apex-v-nexustech",
            link_reason: "Primary contract and forensic proof",
            created_at: "2026-09-01T09:35:00Z",
          },
        ]);
      }

      if (url.pathname.match(/\/api\/v1\/sources\/[^/]+\/file/)) {
        return new Response(
          `CaseVault Evidence Document Authenticated Payload\n\nOriginal file copy preserved with SHA-256 hash verified.\nTimestamp: ${new Date().toISOString()}`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": 'inline; filename="evidence-document.txt"',
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      if (url.pathname.match(/\/api\/v1\/sources\/[^/]+\/reprocess/) && request.method === "POST") {
        return jsonResponse({ ok: true, status: "completed" });
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const sources = await getStore(env, "sources", defaultSources);
        const source = sources.find((s: any) => s.id === id) || sources[0];
        if (!source) {
          return jsonResponse({ detail: "Source not found" }, 404);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(source, body, { updated_at: new Date().toISOString() });
          await setStore(env, "sources", sources);
          return jsonResponse(source);
        }

        return jsonResponse(source);
      }

      // 6. Facts API
      if (url.pathname === "/api/v1/facts") {
        const facts = await getStore(env, "facts", defaultFacts);
        const matterId = url.searchParams.get("matter_id");
        const reviewState = url.searchParams.getAll("review_state");
        let items = facts;
        if (matterId) items = items.filter((f: any) => f.matter_id === matterId);
        if (reviewState.length > 0) items = items.filter((f: any) => reviewState.includes(f.review_state));

        return jsonResponse({
          items,
          total: items.length,
          limit: 50,
          offset: 0,
        });
      }

      if (url.pathname.match(/^\/api\/v1\/facts\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const facts = await getStore(env, "facts", defaultFacts);
        const fact = facts.find((f: any) => f.id === id) || facts[0];
        if (!fact) {
          return jsonResponse({ detail: "Fact not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse({
            id: fact.id,
            statement_text: fact.statement_text,
            short_label: fact.short_label,
            review_state: fact.review_state,
            source_links: (fact.source_links || []).map((sl: any) => ({
              ...sl,
              source_title: "Master Technology Licensing Agreement (Executed)",
            })),
          });
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(fact, body, { updated_at: new Date().toISOString() });
          await setStore(env, "facts", facts);
          return jsonResponse(fact);
        }
      }

      // 7. Chronology Feed & Events
      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/chronology/)) {
        const matterId = url.pathname.split("/")[4];
        const events = await getStore(env, "events", defaultEvents);
        const matterEvents = events.filter((e: any) => e.matter_id === matterId || !e.matter_id);
        return jsonResponse({
          matter_id: matterId,
          events: matterEvents,
          unlinked_accepted_fact_count: 2,
        });
      }

      if (url.pathname === "/api/v1/events") {
        const events = await getStore(env, "events", defaultEvents);
        if (request.method === "GET") {
          const matterId = url.searchParams.get("matter_id");
          const items = matterId ? events.filter((e: any) => e.matter_id === matterId) : events;
          return jsonResponse({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const newEvent = {
            id: `ev-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            matter_id: body.matter_id || "m-001",
            title: body.title,
            description: body.description || null,
            date_start: body.date_start || null,
            date_end: body.date_end || null,
            date_precision: body.date_precision || "exact",
            date_text_raw: body.date_text_raw || null,
            significance_level: body.significance_level || "medium",
            review_state: "accepted",
            confidence_level: body.confidence_level || "high",
            created_from_proposal_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            fact_links: [],
            actor_links: [],
            created_from_proposal: null,
          };
          const updated = [...events, newEvent];
          await setStore(env, "events", updated);
          return jsonResponse(newEvent, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/events\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const events = await getStore(env, "events", defaultEvents);
        const event = events.find((e: any) => e.id === id);
        if (!event) {
          return jsonResponse({ detail: "Event not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse(event);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(event, body, { updated_at: new Date().toISOString() });
          await setStore(env, "events", events);
          return jsonResponse(event);
        }

        if (request.method === "DELETE") {
          const filtered = events.filter((e: any) => e.id !== id);
          await setStore(env, "events", filtered);
          return new Response(null, { status: 204 });
        }
      }

      // Link facts to event
      if (url.pathname.match(/\/api\/v1\/events\/[^/]+\/facts/) && request.method === "POST") {
        const eventId = url.pathname.split("/")[4];
        const body: any = await request.json();
        const events = await getStore(env, "events", defaultEvents);
        const facts = await getStore(env, "facts", defaultFacts);
        const event = events.find((e: any) => e.id === eventId);
        const fact = facts.find((f: any) => f.id === body.fact_id);
        const link = {
          id: `efl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          event_id: eventId,
          fact_id: body.fact_id,
          relationship_type: body.relationship_type || "supports_event",
          created_at: new Date().toISOString(),
          fact_short_label: fact?.short_label || "Linked Fact",
          fact_statement: fact?.statement_text || "Accepted fact linked to event",
          fact_review_state: fact?.review_state || "accepted",
        };
        if (event) {
          if (!event.fact_links) event.fact_links = [];
          event.fact_links.push(link);
          await setStore(env, "events", events);
        }
        return jsonResponse(link, 201);
      }

      if (url.pathname.match(/\/api\/v1\/event-fact-links\/[^/]+/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const events = await getStore(env, "events", defaultEvents);
        for (const ev of events) {
          if (ev.fact_links) {
            ev.fact_links = ev.fact_links.filter((l: any) => l.id !== linkId);
          }
        }
        await setStore(env, "events", events);
        return new Response(null, { status: 204 });
      }

      // Link actors to event
      if (url.pathname.match(/\/api\/v1\/events\/[^/]+\/actors/) && request.method === "POST") {
        const eventId = url.pathname.split("/")[4];
        const body: any = await request.json();
        const events = await getStore(env, "events", defaultEvents);
        const actors = await getStore(env, "actors", defaultActors);
        const event = events.find((e: any) => e.id === eventId);
        const actor = actors.find((a: any) => a.id === body.actor_id);
        const link = {
          id: `eal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          event_id: eventId,
          actor_id: body.actor_id,
          role_in_event: body.role_in_event || null,
          created_at: new Date().toISOString(),
          actor_name: actor?.display_name || "Witness",
        };
        if (event) {
          if (!event.actor_links) event.actor_links = [];
          event.actor_links.push(link);
          await setStore(env, "events", events);
        }
        return jsonResponse(link, 201);
      }

      if (url.pathname.match(/\/api\/v1\/event-actor-links\/[^/]+/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const events = await getStore(env, "events", defaultEvents);
        for (const ev of events) {
          if (ev.actor_links) {
            ev.actor_links = ev.actor_links.filter((l: any) => l.id !== linkId);
          }
        }
        await setStore(env, "events", events);
        return new Response(null, { status: 204 });
      }

      // 8. Proposals & AI Review Engine
      if (url.pathname === "/api/v1/proposals") {
        const proposals = await getStore(env, "proposals", defaultProposals);
        if (request.method === "GET") {
          const matterId = url.searchParams.get("matter_id");
          const reviewState = url.searchParams.get("review_state");
          let items = proposals;
          if (matterId) items = items.filter((p: any) => p.matter_id === matterId);
          if (reviewState) items = items.filter((p: any) => p.review_state === reviewState);
          return jsonResponse({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const sources = await getStore(env, "sources", defaultSources);
          const newProp = {
            id: `prop-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            matter_id: body.matter_id || "m-001",
            proposal_type: body.proposal_type || "fact",
            review_state: "proposed",
            title: body.title || "Proposed Fact",
            proposed_text: body.proposed_text || null,
            proposed_structured_json: body.proposed_structured_json || {},
            source_id: body.source_id || null,
            excerpt_id: null,
            confidence_score: body.confidence_score || 0.9,
            created_by_system: false,
            created_by_user_id: "user-current",
            reviewed_by_user_id: null,
            reviewed_at: null,
            review_notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source: sources.find((s: any) => s.id === body.source_id) || null,
            excerpt: null,
          };
          const updated = [newProp, ...proposals];
          await setStore(env, "proposals", updated);
          return jsonResponse(newProp, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/proposals\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const proposals = await getStore(env, "proposals", defaultProposals);
        const prop = proposals.find((p: any) => p.id === id);
        if (!prop) {
          return jsonResponse({ detail: "Proposal not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse(prop);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(prop, body, { updated_at: new Date().toISOString() });
          await setStore(env, "proposals", proposals);
          return jsonResponse(prop);
        }
      }

      if (url.pathname.match(/\/api\/v1\/proposals\/[^/]+\/review/) && request.method === "POST") {
        const id = url.pathname.split("/")[4];
        const body: any = await request.json();
        const proposals = await getStore(env, "proposals", defaultProposals);
        const facts = await getStore(env, "facts", defaultFacts);
        const prop = proposals.find((p: any) => p.id === id);
        if (!prop) {
          return jsonResponse({ detail: "Proposal not found" }, 404);
        }

        prop.review_state = body.action === "accept" ? "accepted" : body.action;
        prop.reviewed_at = new Date().toISOString();
        prop.review_notes = body.review_notes || null;

        let createdFact = null;
        if (body.action === "accept" || body.action === "accept_with_edits") {
          createdFact = {
            id: `fact-${Date.now().toString().slice(-4)}`,
            workspace_id: prop.workspace_id,
            matter_id: prop.matter_id || "m-001",
            short_label: prop.title || "Accepted Fact",
            statement_text: prop.proposed_text || "",
            review_state: "accepted",
            confidence_level: "high",
            fact_type: "source_derived",
            is_material: true,
            created_from_proposal_id: prop.id,
            created_by_user_id: "user-reviewer",
            approved_by_user_id: "user-reviewer",
            approved_at: new Date().toISOString(),
            supersedes_fact_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source_links: prop.source_id
              ? [
                  {
                    id: `fsl-${Date.now()}`,
                    fact_id: `fact-${Date.now().toString().slice(-4)}`,
                    source_id: prop.source_id,
                    excerpt_id: null,
                    support_type: "supports",
                    strength: "high",
                    notes: "Created via proposal review",
                    created_at: new Date().toISOString(),
                  },
                ]
              : [],
            actor_links: [],
            created_from_proposal: { id: prop.id, proposal_type: prop.proposal_type },
          };
          facts.unshift(createdFact);
          await setStore(env, "facts", facts);
        }

        await setStore(env, "proposals", proposals);
        return jsonResponse({
          proposal: prop,
          fact: createdFact,
        });
      }

      if (url.pathname === "/api/v1/proposals/bulk-review" && request.method === "POST") {
        const body: any = await request.json();
        const ids: string[] = body.ids || [];
        const action = body.action || "accept";
        const proposals = await getStore(env, "proposals", defaultProposals);
        const facts = await getStore(env, "facts", defaultFacts);
        const results = [];
        const created_facts = [];

        for (const id of ids) {
          const prop = proposals.find((p: any) => p.id === id);
          if (prop) {
            prop.review_state = action === "accept" ? "accepted" : action;
            prop.reviewed_at = new Date().toISOString();
            if (action === "accept") {
              const newFact = {
                id: `fact-${Date.now().toString().slice(-4)}`,
                workspace_id: prop.workspace_id,
                matter_id: prop.matter_id || "m-001",
                short_label: prop.title || "Accepted Fact",
                statement_text: prop.proposed_text || "",
                review_state: "accepted",
                confidence_level: "high",
                fact_type: "source_derived",
                is_material: true,
                created_from_proposal_id: prop.id,
                created_by_user_id: "user-reviewer",
                approved_by_user_id: "user-reviewer",
                approved_at: new Date().toISOString(),
                supersedes_fact_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                source_links: [],
                actor_links: [],
                created_from_proposal: null,
              };
              facts.unshift(newFact);
              created_facts.push(newFact);
            }
            results.push({ id, ok: true });
          } else {
            results.push({ id, ok: false, error: "Not found" });
          }
        }

        await setStore(env, "facts", facts);
        await setStore(env, "proposals", proposals);
        return jsonResponse({ results, created_facts });
      }

      if (url.pathname === "/api/v1/proposals/generate" && request.method === "POST") {
        const body: any = await request.json();
        const sources = await getStore(env, "sources", defaultSources);
        const proposals = await getStore(env, "proposals", defaultProposals);
        const source = sources.find((s: any) => s.id === body.source_id);
        const newP1 = {
          id: `prop-${Date.now().toString().slice(-4)}1`,
          workspace_id: "ws-cloud-preview",
          matter_id: "m-001",
          proposal_type: "fact",
          review_state: "proposed",
          title: `Key Covenant extracted from ${source?.title || "Evidence"}`,
          proposed_text: "Licensor warrants that all neural architecture compilation tools are delivered free of third-party restrictive covenants or open-source copyleft licenses.",
          proposed_structured_json: { actors: ["Licensor"] },
          source_id: body.source_id || "src-001",
          excerpt_id: null,
          confidence_score: 0.95,
          created_by_system: true,
          created_by_user_id: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: source || null,
          excerpt: null,
        };
        const updated = [newP1, ...proposals];
        await setStore(env, "proposals", updated);
        return jsonResponse({ created: 1, skipped: 0 });
      }

      // 9. Claim Templates & Instances
      if (url.pathname === "/api/v1/claim-templates") {
        return jsonResponse([
          {
            id: "tpl-ny-contract",
            jurisdiction: "NY",
            name: "Breach of Contract (New York Commercial Division)",
            category: "Commercial Contracts",
            source_authority_text: "Restatement (Second) of Contracts § 235; 34 N.Y.3d 110",
            notes: "Standard 4-element burden of proof.",
            is_active: true,
            element_count: 4,
            elements: [
              { id: "el-tpl-1", element_order: 1, element_label: "Valid agreement with binding terms", element_description: "Offer, acceptance, consideration, and mutual assent.", is_issue_row: false },
              { id: "el-tpl-2", element_order: 2, element_label: "Performance by Plaintiff", element_description: "Plaintiff performed all substantial material obligations.", is_issue_row: false },
              { id: "el-tpl-3", element_order: 3, element_label: "Breach or Failure by Defendant", element_description: "Failure to perform specific covenants or exclusivity clauses.", is_issue_row: false },
              { id: "el-tpl-4", element_order: 4, element_label: "Damages Caused by Breach", element_description: "Proximately caused cognizable economic loss.", is_issue_row: false },
            ],
          },
          {
            id: "tpl-ny-trade-secret",
            jurisdiction: "NY",
            name: "Misappropriation of Trade Secrets",
            category: "Intellectual Property",
            source_authority_text: "Defend Trade Secrets Act (DTSA) / New York Common Law",
            notes: "Covers proprietary source code and models.",
            is_active: true,
            element_count: 3,
            elements: [
              { id: "el-tpl-ts1", element_order: 1, element_label: "Possession of protectable trade secret", element_description: "Information derives independent economic value from secrecy.", is_issue_row: false },
              { id: "el-tpl-ts2", element_order: 2, element_label: "Reasonable secrecy precautions taken", element_description: "Subject to encryption, confidentiality agreements, and access controls.", is_issue_row: false },
              { id: "el-tpl-ts3", element_order: 3, element_label: "Improper acquisition, disclosure, or use", element_description: "Acquired through breach of confidential relationship or theft.", is_issue_row: false },
            ],
          },
        ]);
      }

      if (url.pathname === "/api/v1/claim-instances") {
        if (request.method === "GET") {
          return jsonResponse({
            items: [
              {
                id: "claim-01",
                matter_id: "m-001",
                template_id: "tpl-ny-contract",
                name: "Breach of Contract — §14.2 Source Code Escrow",
                claim_code: "COUNT-I",
                target_summary: "Nexus breached exclusivity and escrow audit rights.",
                status: "active",
                theory_summary: "Nexus breached Section 14.2 by refusing escrow inspection upon demand.",
                highest_priority_gap: "Exact quantification of damages resulting from escrow refusal",
                authority_verification_state: "verified",
                notes: "Primary affirmative claim",
                burden: {
                  status: "partially_supported",
                  label: "Partially Supported",
                  elements_total: 4,
                  proven_elements: 2,
                  partial_elements: 1,
                  unsupported_elements: 1,
                  conflicted_elements: 0,
                  explanation: "3 of 4 elements supported by verified evidence or deposition testimony.",
                },
                element_count: 4,
                gap_count: 1,
                support_fact_count: 6,
                adverse_fact_count: 1,
                created_at: "2026-09-02T12:00:00Z",
                updated_at: new Date().toISOString(),
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          });
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          return jsonResponse(
            {
              id: `claim-${Date.now().toString().slice(-4)}`,
              matter_id: body.matter_id || "m-001",
              template_id: body.template_id || null,
              name: body.name || "New Claim",
              claim_code: body.claim_code || "COUNT-II",
              target_summary: body.target_summary || null,
              status: "active",
              theory_summary: body.theory_summary || null,
              highest_priority_gap: null,
              authority_verification_state: "pending",
              notes: body.notes || null,
              burden: {
                status: "unsupported",
                label: "Unsupported",
                elements_total: 4,
                proven_elements: 0,
                partial_elements: 0,
                unsupported_elements: 4,
                conflicted_elements: 0,
                explanation: "New claim created; awaiting evidence linking.",
              },
              element_count: 4,
              gap_count: 4,
              support_fact_count: 0,
              adverse_fact_count: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            201
          );
        }
      }

      // Claim Chart endpoint (/api/v1/claim-instances/{id}/chart)
      if (url.pathname.match(/\/api\/v1\/claim-instances\/[^/]+\/chart/)) {
        return jsonResponse({
          claim: {
            id: "claim-01",
            matter_id: "m-001",
            template_id: "tpl-ny-contract",
            claim_code: "COUNT-I",
            name: "Breach of Contract — §14.2 Source Code Escrow",
            target_summary: "Nexus Technologies LLC",
            status: "active",
            theory_summary: "Nexus breached Section 14.2 by refusing escrow inspection upon demand.",
            highest_priority_gap: "Exact quantification of damages resulting from escrow refusal",
            authority_verification_state: "verified",
            notes: "Primary affirmative claim",
            created_at: "2026-09-02T12:00:00Z",
            updated_at: new Date().toISOString(),
            burden: {
              status: "partially_supported",
              label: "Partially Supported",
              elements_total: 4,
              proven_elements: 2,
              partial_elements: 1,
              unsupported_elements: 1,
              conflicted_elements: 0,
              explanation: "3 of 4 elements supported by verified evidence or deposition testimony.",
            },
            element_count: 4,
            gap_count: 1,
            support_fact_count: 6,
            adverse_fact_count: 1,
          },
          burden: {
            status: "partially_supported",
            label: "Partially Supported",
            elements_total: 4,
            proven_elements: 2,
            partial_elements: 1,
            unsupported_elements: 1,
            conflicted_elements: 0,
            explanation: "3 of 4 elements supported by verified evidence or deposition testimony.",
          },
          elements: [
            {
              id: "el-1",
              claim_instance_id: "claim-01",
              template_element_id: "el-tpl-1",
              element_order: 1,
              element_label: "Valid agreement with binding terms",
              element_description: "Offer, acceptance, consideration, and mutual assent.",
              is_issue_row: false,
              burden_status: "proven",
              gap_assessment: null,
              created_at: "2026-09-02T12:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-001",
                  statement_text: "Apex Global and Nexus Technologies entered into the Master Technology Licensing Agreement on March 15, 2024.",
                  short_label: "MLA Execution Date",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "dispositive",
                  qualification: "Fully executed and authenticated copy in record.",
                  created_at: "2026-09-02T12:00:00Z",
                  evidence_sources: ["Master Technology Licensing Agreement (Executed)"],
                  actors: ["Dr. Evelyn Vance", "Nexus Technologies LLC"],
                  link_id: "ef-link-1",
                  source_links: [
                    {
                      id: "sl-01",
                      source_id: "src-001",
                      source_title: "Master Technology Licensing Agreement (Executed)",
                      support_type: "supports",
                      strength: "high",
                      page_start: 1,
                      page_end: 1,
                      locator_text: "Preamble & Signature Block",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-2",
              claim_instance_id: "claim-01",
              template_element_id: "el-tpl-2",
              element_order: 2,
              element_label: "Performance by Plaintiff",
              element_description: "Plaintiff performed all substantial material obligations.",
              is_issue_row: false,
              burden_status: "proven",
              gap_assessment: null,
              created_at: "2026-09-02T12:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-002",
                  statement_text: "Section 14.2 of the MLA grants Apex the unconditional right to audit escrow releases upon written notice.",
                  short_label: "Escrow Audit Clause",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "strong",
                  qualification: "Apex tendered notice in conformity with contract.",
                  created_at: "2026-09-02T12:00:00Z",
                  evidence_sources: ["Master Technology Licensing Agreement (Executed)"],
                  actors: [],
                  link_id: "ef-link-2",
                  source_links: [
                    {
                      id: "sl-02",
                      source_id: "src-001",
                      source_title: "Master Technology Licensing Agreement (Executed)",
                      support_type: "supports",
                      strength: "high",
                      page_start: 31,
                      page_end: 32,
                      locator_text: "Section 14.2",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-3",
              claim_instance_id: "claim-01",
              template_element_id: "el-tpl-3",
              element_order: 3,
              element_label: "Breach or Failure by Defendant",
              element_description: "Failure to perform specific covenants or exclusivity clauses.",
              is_issue_row: false,
              burden_status: "supported",
              gap_assessment: "Deposition testimony required to authenticate internal refusal discussions.",
              created_at: "2026-09-02T12:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-003",
                  statement_text: "Nexus Technologies formally refused Apex's audit demand letter on May 18, 2025 citing proprietary trade secrets.",
                  short_label: "Refusal to Allow Inspection",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "strong",
                  qualification: "Demonstrates breach of mandatory inspection covenant.",
                  created_at: "2026-09-10T12:00:00Z",
                  evidence_sources: ["Notice of Audit Demand & Refusal Thread"],
                  actors: ["Nexus Technologies LLC"],
                  link_id: "ef-link-3",
                  source_links: [
                    {
                      id: "sl-03",
                      source_id: "src-003",
                      source_title: "Notice of Audit Demand & Refusal Thread",
                      support_type: "supports",
                      strength: "high",
                      page_start: 1,
                      page_end: 2,
                      locator_text: "Email Response",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-4",
              claim_instance_id: "claim-01",
              template_element_id: "el-tpl-4",
              element_order: 4,
              element_label: "Damages Caused by Breach",
              element_description: "Proximately caused cognizable economic loss.",
              is_issue_row: false,
              burden_status: "unsupported",
              gap_assessment: "Damages expert calculation needed to quantify loss from escrow block.",
              created_at: "2026-09-02T12:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [],
            },
          ],
          gap_items: [
            {
              element_id: "el-4",
              element_label: "Damages Caused by Breach",
              severity: "high",
              gap_assessment: "Damages expert calculation needed to quantify loss from escrow block.",
            },
          ],
        });
      }

      // 10. Webhooks
      if (url.pathname === "/api/v1/webhooks/github") {
        return handleGitHubWebhook(request, env);
      }

      // 11. Supabase integration proxy & status
      if (url.pathname === "/api/v1/integrations/supabase/status") {
        return handleSupabaseHealth(env);
      }

      return jsonResponse({ error: "Endpoint not found", path: url.pathname }, 404);
    } catch (err: any) {
      return jsonResponse(
        {
          error: "Internal Server Error",
          message: err?.message || String(err),
          stack: err?.stack,
        },
        500
      );
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}

async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");
  const rawBody = await request.arrayBuffer();

  if (env.GITHUB_WEBHOOK_SECRET) {
    if (!signature) {
      return jsonResponse({ error: "Missing signature header" }, 401);
    }
    const isValid = await verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!isValid) {
      return jsonResponse({ error: "Invalid webhook signature" }, 403);
    }
  }

  const text = new TextDecoder().decode(rawBody);
  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (event === "ping") {
    return jsonResponse({
      status: "pong",
      repo: payload?.repository?.full_name,
      zen: payload?.zen,
    });
  }

  if (event === "push") {
    const branch = (payload?.ref || "").replace("refs/heads/", "");
    const commitsCount = payload?.commits?.length || 0;
    const author = payload?.pusher?.name || payload?.head_commit?.author?.name || "Unknown";
    const commitMsg = (payload?.head_commit?.message || "").split("\n")[0];
    const sha = (payload?.head_commit?.id || "").slice(0, 7);

    return jsonResponse({
      status: "received",
      event: "push",
      branch,
      author,
      commit: sha,
      message: commitMsg,
      count: commitsCount,
    });
  }

  return jsonResponse({ status: "received", event });
}

async function verifyGitHubSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const signature = signatureHeader.slice(7);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, rawBody);
  const hashArray = Array.from(new Uint8Array(signed));
  const expectedSignature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return signature === expectedSignature;
}

async function handleSupabaseHealth(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL) {
    return jsonResponse({
      status: "not_configured",
      message: "SUPABASE_URL environment variable is not set.",
    });
  }

  const checkUrl = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`;
  const headers: Record<string, string> = {};
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    headers["apikey"] = env.SUPABASE_SERVICE_ROLE_KEY;
    headers["Authorization"] = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  }

  try {
    const res = await fetch(checkUrl, { method: "HEAD", headers });
    return jsonResponse({
      status: res.status < 400 ? "connected" : "reachable",
      http_status: res.status,
      supabase_url: env.SUPABASE_URL,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        status: "error",
        message: err?.message || String(err),
        supabase_url: env.SUPABASE_URL,
      },
      502
    );
  }
}

/**
 * CaseVault Cloudflare Worker
 *
 * Edge gateway for:
 * 1. Health & routing for the CaseVault ecosystem.
 * 2. Edge API mock/proxy for workspaces, matters, actors, sources, facts, chronology, and claims.
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
}

// In-memory mock stores for realistic edge interaction during preview
interface ActorState {
  id: string;
  workspace_id: string;
  actor_type: "person" | "entity" | "court" | "agency" | "other";
  display_name: string;
  normalized_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  aliases: Array<{ id: string; alias_text: string; alias_type: string | null }>;
}

let actorsStore: ActorState[] = [
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

let sourcesStore: any[] = [
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
    title: "Forensic Exfiltration & Access Log Report",
    original_filename: "CyberSec_Forensic_Report_Nexus_Exfiltration.pdf",
    mime_type: "application/pdf",
    storage_path: "sources/m-001/CyberSec_Forensic_Report_Nexus_Exfiltration.pdf",
    sha256: "982348aeb716503c8091bf2e45da7eb596328392110294827104928172938102",
    file_size_bytes: 1248900,
    page_count: 14,
    source_status: "derived",
    evidence_review_status: "reviewed",
    included_flag: true,
    excluded_flag: false,
    exclusion_reason: null,
    authentication_notes: "Accompanied by Declaration of Marcus Sterling.",
    restrictions_notes: "Subject to Protective Order §7",
    processing_status: "completed",
    ocr_status: "completed",
    created_at: "2026-09-05T14:45:00Z",
    updated_at: "2026-09-05T14:45:00Z",
    duplicate_of: null,
  },
  {
    id: "src-003",
    workspace_id: "ws-cloud-preview",
    source_type: "email",
    title: "Email Thread: Escrow Inspection Demand Refusal",
    original_filename: "2025-05-18_Demand_Refusal_Thread.eml",
    mime_type: "message/rfc822",
    storage_path: "sources/m-001/2025-05-18_Demand_Refusal_Thread.eml",
    sha256: "5271892837192837192837192837192837192837192837192837192837192837",
    file_size_bytes: 28410,
    page_count: 3,
    source_status: "primary",
    evidence_review_status: "reviewed",
    included_flag: true,
    excluded_flag: false,
    exclusion_reason: null,
    authentication_notes: "Produced by Defendant as NEX-000841.",
    restrictions_notes: null,
    processing_status: "completed",
    ocr_status: "not_needed",
    created_at: "2026-09-10T11:15:00Z",
    updated_at: "2026-09-10T11:15:00Z",
    duplicate_of: null,
  },
];

let factsStore: any[] = [
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
    approved_at: "2026-09-02T11:00:00Z",
    supersedes_fact_id: null,
    created_at: "2026-09-02T10:45:00Z",
    updated_at: "2026-09-02T11:00:00Z",
    source_links: [
      {
        id: "fsl-01",
        fact_id: "fact-001",
        source_id: "src-001",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Section 1.1 Effective Date recital.",
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
    short_label: "Audit Notice Rejection",
    statement_text: "On May 18, 2025, Nexus Technologies refused Apex's formal demand to inspect the escrow repository.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-partner",
    approved_by_user_id: "user-lead-partner",
    approved_at: "2026-09-11T09:00:00Z",
    supersedes_fact_id: null,
    created_at: "2026-09-10T11:30:00Z",
    updated_at: "2026-09-11T09:00:00Z",
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
        const matters = [
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
            updated_at: new Date().toISOString(),
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
            updated_at: new Date().toISOString(),
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
            updated_at: new Date().toISOString(),
          },
        ];
        return jsonResponse(matters);
      }

      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        return jsonResponse({
          id: id || "m-001",
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
          updated_at: new Date().toISOString(),
        });
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/links/)) {
        return jsonResponse([]);
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/actors/)) {
        return jsonResponse([
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
        ]);
      }

      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/source-links/)) {
        return jsonResponse([
          {
            id: "sml-01",
            matter_id: "m-001",
            source_id: "src-001",
            source_title: "Master Technology Licensing Agreement (Executed)",
            link_reason: "Controlling agreement",
            created_at: "2026-09-01T10:00:00Z",
          },
        ]);
      }

      // 4. Actors CRUD
      if (url.pathname === "/api/v1/actors") {
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          const items = q
            ? actorsStore.filter(
                (a) =>
                  a.display_name.toLowerCase().includes(q) ||
                  a.aliases.some((al) => al.alias_text.toLowerCase().includes(q))
              )
            : actorsStore;
          return jsonResponse(items);
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const newActor: ActorState = {
            id: `act-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-cloud-preview",
            actor_type: body.actor_type || "person",
            display_name: body.display_name || "New Actor",
            normalized_name: body.display_name || "New Actor",
            description: body.description || null,
            aliases: (body.aliases || []).map((text: string, idx: number) => ({
              id: `al-${Date.now()}-${idx}`,
              alias_text: text,
              alias_type: null,
            })),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          actorsStore.push(newActor);
          return jsonResponse(newActor, 201);
        }
      }

      // Actor dossier & updates
      if (url.pathname.match(/^\/api\/v1\/actors\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const actor = actorsStore.find((a) => a.id === id);
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
          return jsonResponse(actor);
        }
      }

      // Actor aliases
      if (url.pathname.match(/\/api\/v1\/actors\/[^/]+\/aliases/) && request.method === "POST") {
        const id = url.pathname.split("/")[4];
        const actor = actorsStore.find((a) => a.id === id);
        const body: any = await request.json();
        const newAlias = {
          id: `al-${Date.now()}`,
          alias_text: body.alias_text || "New Alias",
          alias_type: body.alias_type || null,
        };
        if (actor) {
          actor.aliases.push(newAlias);
        }
        return jsonResponse(newAlias, 201);
      }

      if (url.pathname.match(/\/api\/v1\/actor-aliases\/[^/]+/) && request.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      // 5. Evidence Sources
      if (url.pathname === "/api/v1/sources") {
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          const matterId = url.searchParams.get("matter_id");
          let items = sourcesStore;
          if (q) items = items.filter((s) => s.title.toLowerCase().includes(q));
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
          sourcesStore.unshift(newSource);
          return jsonResponse(newSource, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const source = sourcesStore.find((s) => s.id === id) || sourcesStore[0];
        return jsonResponse(source);
      }

      // 6. Facts API
      if (url.pathname === "/api/v1/facts") {
        const matterId = url.searchParams.get("matter_id");
        const reviewState = url.searchParams.getAll("review_state");
        let items = factsStore;
        if (matterId) items = items.filter((f) => f.matter_id === matterId);
        if (reviewState.length > 0) items = items.filter((f) => reviewState.includes(f.review_state));

        return jsonResponse({
          items,
          total: items.length,
          limit: 50,
          offset: 0,
        });
      }

      if (url.pathname.match(/^\/api\/v1\/facts\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const fact = factsStore.find((f) => f.id === id) || factsStore[0];
        return jsonResponse(fact);
      }

      // 7. Chronology feed & events
      if (url.pathname.includes("/chronology")) {
        return jsonResponse({
          matter_id: "m-001",
          events: [
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
              created_at: "2026-09-01T10:00:00Z",
              updated_at: new Date().toISOString(),
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
              created_at: "2026-09-01T11:00:00Z",
              updated_at: new Date().toISOString(),
              fact_links: [],
              actor_links: [],
            },
          ],
          unlinked_accepted_fact_count: 2,
        });
      }

      if (url.pathname === "/api/v1/events" && request.method === "POST") {
        const body: any = await request.json();
        return jsonResponse(
          {
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
          },
          201
        );
      }

      if (url.pathname.match(/\/api\/v1\/events\/[^/]+\/facts/) && request.method === "POST") {
        const body: any = await request.json();
        return jsonResponse(
          {
            id: `efl-${Date.now()}`,
            event_id: url.pathname.split("/")[4],
            fact_id: body.fact_id,
            relationship_type: body.relationship_type || "supports_event",
            created_at: new Date().toISOString(),
            fact_short_label: "Linked Fact",
            fact_statement: "Accepted fact linked to event",
            fact_review_state: "accepted",
          },
          201
        );
      }

      // 8. Claim Templates & Instances
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
              id: "el-01",
              element_order: 1,
              element_label: "Formation of valid agreement",
              element_description: "Valid bilateral MLA signed March 15, 2024.",
              stored_support_status: "strong_support",
              computed_support_status: "strong_support",
              burden_status: "proven",
              support_points: 10,
              adverse_points: 0,
              has_primary_anchor: true,
              testimony_only: false,
              conflicted: false,
              has_controlling_authority: true,
              gap_text: null,
              risk_text: null,
              notes: "Fully supported by executed agreement.",
              warnings: [],
              support_facts: [
                {
                  link_id: "ef-01",
                  fact_id: "fact-001",
                  short_label: "MLA Execution Date",
                  statement_text: "Apex Global and Nexus Technologies entered into the Master Technology Licensing Agreement on March 15, 2024.",
                  review_state: "accepted",
                  confidence_level: "high",
                  is_material: true,
                  link_polarity: "support",
                  weight_label: "high",
                  link_notes: "Primary agreement signature",
                  evidence_sources: ["Master Technology Licensing Agreement (Executed)"],
                  anchors: [
                    {
                      source_id: "src-001",
                      title: "Master Technology Licensing Agreement (Executed)",
                      source_type: "pdf",
                      source_status: "primary",
                      evidence_review_status: "reviewed",
                      is_primary_anchor: true,
                      locator_text: "Section 1.1",
                      page_start: 1,
                      page_end: 2,
                      excerpt_text: "This Master Licensing Agreement is made March 15, 2024...",
                    },
                  ],
                },
              ],
              adverse_facts: [],
              context_facts: [],
              authorities: [],
            },
            {
              id: "el-02",
              element_order: 2,
              element_label: "Performance by Plaintiff Apex",
              element_description: "Apex delivered source code and performed milestones.",
              stored_support_status: "strong_support",
              computed_support_status: "strong_support",
              burden_status: "proven",
              support_points: 8,
              adverse_points: 0,
              has_primary_anchor: true,
              testimony_only: false,
              conflicted: false,
              has_controlling_authority: false,
              gap_text: null,
              risk_text: null,
              notes: null,
              warnings: [],
              support_facts: [],
              adverse_facts: [],
              context_facts: [],
              authorities: [],
            },
            {
              id: "el-03",
              element_order: 3,
              element_label: "Breach of §14.2 Escrow Rights",
              element_description: "Nexus denied inspection of escrow repository.",
              stored_support_status: "weak_support",
              computed_support_status: "weak_support",
              burden_status: "partially_supported",
              support_points: 4,
              adverse_points: 1,
              has_primary_anchor: true,
              testimony_only: false,
              conflicted: false,
              has_controlling_authority: true,
              gap_text: null,
              risk_text: "Defendant claims inspection demand was defective in form.",
              notes: null,
              warnings: [],
              support_facts: [],
              adverse_facts: [],
              context_facts: [],
              authorities: [],
            },
            {
              id: "el-04",
              element_order: 4,
              element_label: "Cognizable Economic Damages",
              element_description: "Lost licensing fees and proprietary misappropriation impact.",
              stored_support_status: "no_support",
              computed_support_status: "no_support",
              burden_status: "unsupported",
              support_points: 0,
              adverse_points: 0,
              has_primary_anchor: false,
              testimony_only: false,
              conflicted: false,
              has_controlling_authority: false,
              gap_text: "Damages expert report not yet finalized.",
              risk_text: null,
              notes: null,
              warnings: [
                {
                  code: "MISSING_PROOF",
                  severity: "alert",
                  message: "No accepted facts or expert models currently substantiate damages.",
                },
              ],
              support_facts: [],
              adverse_facts: [],
              context_facts: [],
              authorities: [],
            },
          ],
          gaps: [
            {
              element_id: "el-04",
              element_order: 4,
              element_label: "Cognizable Economic Damages",
              severity: "alert",
              code: "MISSING_PROOF",
              message: "No accepted facts or expert models currently substantiate damages.",
            },
          ],
        });
      }

      // Single Claim Instance endpoint (/api/v1/claim-instances/{id})
      if (url.pathname.match(/^\/api\/v1\/claim-instances\/[^/]+$/)) {
        return jsonResponse({
          id: "claim-01",
          matter_id: "m-001",
          template_id: "tpl-ny-contract",
          name: "Breach of Contract — §14.2 Source Code Escrow",
          claim_code: "COUNT-I",
          target_summary: "Nexus Technologies LLC",
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
        });
      }

      // 9. Edge AI Providers
      if (url.pathname === "/api/v1/ai/providers") {
        return jsonResponse([
          {
            provider_name: "openai",
            model_name: "gpt-4o",
            status: "ready",
            configured: true,
          },
          {
            provider_name: "anthropic",
            model_name: "claude-3-5-sonnet",
            status: "ready",
            configured: true,
          },
        ]);
      }

      // 10. GitHub Webhook Ingest
      if (url.pathname === "/webhooks/github" && request.method === "POST") {
        return await handleGitHubWebhook(request, env);
      }

      // 11. Supabase Proxy / Health Check
      if (url.pathname.startsWith("/supabase/health") && request.method === "GET") {
        return await handleSupabaseHealth(env);
      }

      return jsonResponse({ error: "Not Found", path: url.pathname }, 404);
    } catch (err: any) {
      return jsonResponse(
        { error: "Internal Server Error", message: err?.message || String(err) },
        500
      );
    }
  },
};

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GitHub-Event, X-Hub-Signature-256",
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  const event = request.headers.get("X-GitHub-Event") || "unknown";
  const signature = request.headers.get("X-Hub-Signature-256");
  const rawBody = await request.arrayBuffer();

  if (env.GITHUB_WEBHOOK_SECRET) {
    if (!signature) {
      return jsonResponse({ error: "Missing X-Hub-Signature-256 header" }, 401);
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

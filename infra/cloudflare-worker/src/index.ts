/**
 * CaseVault Cloudflare Worker
 *
 * Edge gateway for:
 * 1. Health & routing for the CaseVault ecosystem.
 * 2. Edge API mock/proxy for workspaces and matters.
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

      // 2. Edge Workspace & Matter API
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

      if (url.pathname === "/api/v1/matters") {
        return jsonResponse([
          {
            id: "m-001",
            workspace_id: "ws-cloud-preview",
            slug: "apex-v-nexustech",
            name: "Apex Global v. Nexus Technologies LLC",
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
        ]);
      }

      if (url.pathname === "/api/v1/actors") {
        return jsonResponse([
          {
            id: "act-01",
            workspace_id: "ws-cloud-preview",
            name: "Dr. Evelyn Vance",
            actor_type: "person",
            role_description: "Chief Technology Officer & Named Inventor",
            notes: "Deposition scheduled for Nov 14, 2026",
            aliases: ["Evelyn Vance", "E. Vance"],
            created_at: "2026-09-02T10:00:00Z",
            updated_at: new Date().toISOString(),
          },
          {
            id: "act-02",
            workspace_id: "ws-cloud-preview",
            name: "Nexus Technologies LLC",
            actor_type: "entity",
            role_description: "Primary Defendant & Licensee",
            notes: "Represented by Sullivan & Cromwell",
            aliases: ["Nexus Tech", "Nexus"],
            created_at: "2026-09-02T10:05:00Z",
            updated_at: new Date().toISOString(),
          },
        ]);
      }

      // Edge Chronology feed
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
              fact_links: [],
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
          unlinked_accepted_fact_count: 3,
        });
      }

      // Edge Claims instances
      if (url.pathname === "/api/v1/claim-instances") {
        return jsonResponse({
          items: [
            {
              id: "claim-01",
              matter_id: "m-001",
              name: "Breach of Contract — §14.2 Source Code Escrow",
              claim_code: "COUNT-I",
              target_summary: "Nexus breached exclusivity and escrow audit rights.",
              status: "active",
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

      // Edge AI Providers
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


      // 3. GitHub Webhook Ingest
      if (url.pathname === "/webhooks/github" && request.method === "POST") {
        return await handleGitHubWebhook(request, env);
      }

      // 4. Supabase Proxy / Health Check
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

/**
 * Validates GitHub HMAC-SHA256 signature and processes webhook payload.
 */
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

  // Handle ping
  if (event === "ping") {
    return jsonResponse({
      status: "pong",
      repo: payload?.repository?.full_name,
      zen: payload?.zen,
    });
  }

  // Handle push
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

/**
 * Checks connection to configured Supabase project.
 */
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
    return jsonResponse({
      status: "error",
      message: err?.message || String(err),
      supabase_url: env.SUPABASE_URL,
    }, 502);
  }
}

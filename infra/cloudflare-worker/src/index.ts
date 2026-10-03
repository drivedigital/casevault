/**
 * CaseVault Cloudflare Worker
 *
 * Edge gateway for:
 * 1. GitHub Webhook verification & dispatch (pushes, PRs, task notifications).
 * 2. Supabase integration proxy (storage signed URLs, edge auth & DB health checks).
 * 3. Health & routing for the CaseVault ecosystem.
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

      // 2. GitHub Webhook Ingest
      if (url.pathname === "/webhooks/github" && request.method === "POST") {
        return await handleGitHubWebhook(request, env);
      }

      // 3. Supabase Proxy / Health Check
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

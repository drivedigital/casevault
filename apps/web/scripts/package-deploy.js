const fs = require("fs");
const path = require("path");

const webDir = path.resolve(__dirname, "..");
const deployDir = path.join(webDir, ".deploy");
const nextDir = path.join(webDir, ".next");
const serverAppDir = path.join(nextDir, "server", "app");
const staticDir = path.join(nextDir, "static");
const publicDir = path.join(webDir, "public");

// Clear and recreate deployDir
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// Copy public directory if exists
if (fs.existsSync(publicDir)) {
  console.log("Copying public assets to .deploy...");
  fs.cpSync(publicDir, deployDir, { recursive: true });
}

// Copy _next/static
const deployNextStatic = path.join(deployDir, "_next", "static");
fs.mkdirSync(path.dirname(deployNextStatic), { recursive: true });
if (fs.existsSync(staticDir)) {
  console.log("Copying _next/static to .deploy/_next/static...");
  fs.cpSync(staticDir, deployNextStatic, { recursive: true });
}

// Copy HTML, RSC, and JSON from server/app into deployDir
function copyAppFiles(src, dest) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyAppFiles(srcPath, destPath);
    } else if (entry.name.endsWith(".html") || entry.name.endsWith(".rsc") || entry.name.endsWith(".json")) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("Copying Next.js server app bundles...");
copyAppFiles(serverAppDir, deployDir);

// Write _redirects for Cloudflare Pages
const redirects = `/api/v1/*  https://casevault-worker.dan-2eb.workers.dev/api/v1/:splat  200\n`;
fs.writeFileSync(path.join(deployDir, "_redirects"), redirects);

// Write _worker.js for edge request routing, KV file proxying, and SPA client-side fallback
const workerContent = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy all /api/* calls to edge worker gateway (which serves KV binary files and stores)
    if (url.pathname.startsWith("/api/")) {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = "casevault-worker.dan-2eb.workers.dev";
      targetUrl.protocol = "https:";
      targetUrl.port = "";
      
      const newHeaders = new Headers(request.headers);
      newHeaders.set("Host", "casevault-worker.dan-2eb.workers.dev");
      
      return fetch(new Request(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "follow",
      }));
    }

    // Try serving static asset directly
    const assetResp = await env.ASSETS.fetch(request);
    if (assetResp.status === 404 && request.method === "GET" && !url.pathname.startsWith("/_next/")) {
      // Fallback to index.html for client-side routing on dynamic routes
      return env.ASSETS.fetch(new URL('/index.html', request.url));
    }
    return assetResp;
  }
};
`;

fs.writeFileSync(path.join(deployDir, "_worker.js"), workerContent);

console.log("Successfully packaged .deploy folder for Cloudflare Pages.");

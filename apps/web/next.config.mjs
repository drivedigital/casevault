/** @type {import('next').NextConfig} */
// Browser code calls relative /api/v1/* paths; the dev server proxies them
// to the API so the frontend never hard-codes the API host.
const apiBase = process.env.API_BASE_URL ?? "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiBase}/api/v1/:path*` }];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const API_URL = process.env.API_BASE_URL || process.env.API_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // Browser-side code only ever hits relative /api/v1/* URLs; this dev/prod
  // server proxies them to the FastAPI backend (sandbox browsers cannot
  // reach localhost services directly).
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

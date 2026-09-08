import type { NextConfig } from "next";

const backendOrigin =
  process.env.PANTER_BACKEND_ORIGIN || "http://127.0.0.1:18080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

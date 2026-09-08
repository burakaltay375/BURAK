import type { NextConfig } from "next";

const backendOrigin =
  process.env.PANTER_BACKEND_ORIGIN || "http://127.0.0.1:18080";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendOrigin}/api/:path*`,
        },
      ],
      fallback: [
        {
          source: "/operasyon",
          destination: "/operasyon/index.html",
        },
        {
          source: "/operasyon/:path*",
          destination: "/operasyon/index.html",
        },
      ],
    };
  },
};

export default nextConfig;

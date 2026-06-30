import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/ble_upgrade/api/:path*",
        destination: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    // Installer completion uploads 1-4 (client-compressed) photos via a Server
    // Action; the 1MB default rejects them. Keep under Vercel's ~4.5MB cap.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
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

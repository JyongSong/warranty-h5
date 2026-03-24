import type { NextConfig } from "next";

const BLE_UPGRADE_ORIGIN =
  process.env.BLE_UPGRADE_ORIGIN || "https://ble-upgrade-page.vercel.app";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/ble_upgrade",
        destination: `${BLE_UPGRADE_ORIGIN}/ble_upgrade`,
      },
      {
        source: "/ble_upgrade/:path*",
        destination: `${BLE_UPGRADE_ORIGIN}/ble_upgrade/:path*`,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Profile pictures are up to 2 MB; homework uploads (Phase 3) will go straight to storage.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;

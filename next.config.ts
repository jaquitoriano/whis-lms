import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Values for the browser's Supabase client (direct-to-storage uploads). Next.js only exposes
  // NEXT_PUBLIC_* variables to browsers, so the NEXT_SUPABASE_* names need passing through here.
  // Both values are safe to publish: this key can only do what the access rules allow.
  env: {
    BROWSER_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_SUPABASE_URL ?? "",
    BROWSER_SUPABASE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_SUPABASE_ANON_KEY ?? "",
  },
  experimental: {
    // Profile pictures are up to 2 MB; homework uploads (Phase 3) will go straight to storage.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;

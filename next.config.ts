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
  // Browser protection on every response. No other site may show these pages in a frame
  // (stops click-jacking of the login and portal pages); HTTPS only; no MIME guessing; links to
  // other sites get only the domain; camera, microphone and location are never used.
  // A full Content-Security-Policy (scripts, YouTube, Supabase) is a separate, later step.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

import { createBrowserClient } from "@supabase/ssr";

// Browser client for direct-to-storage uploads (materials). Row-level security and
// storage policies apply exactly as for server calls.
export function supabaseBrowserConfig() {
  return { url: process.env.BROWSER_SUPABASE_URL!, key: process.env.BROWSER_SUPABASE_KEY! };
}

export function createClient() {
  const { url, key } = supabaseBrowserConfig();
  return createBrowserClient(url, key);
}

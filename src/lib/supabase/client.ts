import { createBrowserClient } from "@supabase/ssr";

// Browser client for direct-to-storage uploads (materials). Row-level security and
// storage policies apply exactly as for server calls.
export function createClient() {
  return createBrowserClient(process.env.NEXT_SUPABASE_URL!, process.env.NEXT_SUPABASE_ANON_KEY!);
}

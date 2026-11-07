import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: BYPASSES row-level security.
// Use only for auth admin operations (create user, set password, change email),
// and only after checking that the caller is an admin (see requireRole in lib/auth.ts).
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient((process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_SUPABASE_URL)!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

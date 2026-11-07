import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Contract } from "@/lib/contracts";

// Looks up a guardian's one-time signing link for the public /sign page. Server-only (not a
// server action), so the browser can't call it directly.
export async function lookupSignToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const db = createAdminClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: t } = await db.from("contract_sign_tokens").select("contract_id, expires_at").eq("token_hash", hash).maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return null;
  const { data: c } = await db.from("contracts").select("*, student:profiles!contracts_student_id_fkey(id, full_name)").eq("id", t.contract_id).maybeSingle();
  if (!c || c.status !== "sent") return null;
  return { contract: c as Contract, expiresAt: t.expires_at as string };
}

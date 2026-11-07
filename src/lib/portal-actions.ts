"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import type { ActionState } from "@/lib/types";

async function auth() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

// ---------------------------------------------------------------------------
// Notifications (NOT-20)
// ---------------------------------------------------------------------------
export async function openNotification(id: string) {
  const { supabase, profile } = await auth();
  const { data } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  revalidatePath(`/${profile.role}`, "layout");
  const link = data?.link && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : `/${profile.role}/notifications`;
  redirect(link);
}

export async function markAllRead() {
  const { supabase, profile } = await auth();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath(`/${profile.role}`, "layout");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function saveEmailPreferences(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const rows = NOTIFICATION_TYPES[profile.role].map((t) => ({ user_id: profile.id, type: t.type, email: formData.get(`email_${t.type}`) === "on" }));
  const { error } = await supabase.from("notification_preferences").upsert(rows);
  if (error) return { error: "Could not save your preferences." };
  revalidatePath(`/${profile.role}/settings`);
  return { ok: true, message: "Email preferences saved." };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await auth();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two new passwords don't match." };
  // Re-check the current password so an unattended logged-in browser can't change it.
  const check = await supabase.auth.signInWithPassword({ email: user.email!, password: current });
  if (check.error) return { error: "Your current password is incorrect." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Could not change your password. Try a different one." };
  return { ok: true, message: "Password changed." };
}

// ---------------------------------------------------------------------------
// Class policies (POL-04): record who accepted which version, when, from where.
// ---------------------------------------------------------------------------
export async function acceptPolicies(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (formData.get("agree") !== "on") return { error: "Tick the box to confirm you have read and understood the policies." };
  const version = Number(formData.get("version"));
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const { error } = await supabase.from("policy_acceptances").insert({
    version,
    user_id: profile.id,
    ip,
    user_agent: (h.get("user-agent") ?? "").slice(0, 300) || null,
  });
  if (error && !error.message.includes("duplicate")) return { error: "These aren't the latest policies. Please reload the page." };
  revalidatePath(`/${profile.role}`, "layout");
  redirect(`/${profile.role}?policies=accepted`);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { ActionState, Role } from "@/lib/types";

function safeNext(next: string | null) {
  // Only allow same-site relative paths, never "//evil.com" or absolute URLs.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "Incorrect email or password." };

  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", data.user.id).single<{ role: Role; status: string }>();
  if (!profile || profile.status === "inactive") {
    await supabase.auth.signOut();
    return { error: "This account is inactive. Please contact the school office." };
  }
  redirect(safeNext(String(formData.get("next") ?? "")) ?? homeFor(profile.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` });
  // Same answer whether or not the email exists, so accounts can't be discovered.
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Your reset link has expired. Please request a new one." };
  redirect("/dashboard");
}

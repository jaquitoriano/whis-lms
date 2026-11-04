import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

// The logged-in user and their profile, or null. Cached per request.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) return null;
  return { user, profile, supabase };
});

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student";
}

// Use at the top of every portal layout, page and server action.
export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.status === "inactive") redirect("/login?error=inactive");
  if (session.profile.role !== role) redirect(homeFor(session.profile.role));
  return session;
}

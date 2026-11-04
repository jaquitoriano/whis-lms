import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Course, Profile, TeacherProfile } from "@/lib/types";

export async function getActiveCourses() {
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as Course[];
}

// Teachers the admin has chosen to show on the website (HOME-08).
export async function getPublicTeachers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teacher_profiles")
    .select("*, profile:profiles!inner(id, full_name, avatar_url, status, role)")
    .eq("show_on_website", true);
  return ((data ?? []) as (TeacherProfile & { profile: Pick<Profile, "id" | "full_name" | "avatar_url"> })[]).sort((a, b) =>
    a.profile.full_name.localeCompare(b.profile.full_name),
  );
}

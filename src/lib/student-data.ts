import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, Course, Profile, StudentProfile, TeacherProfile } from "@/lib/types";

export type MyTeacher = Profile & { teacher_profile: TeacherProfile | null; contact: Contact | null };

// The student's current teacher(s). Contact details come back only when the admin
// setting allows it; that rule lives in the database (profile_contacts policy).
export async function getMyTeachers(supabase: SupabaseClient, studentId: string): Promise<MyTeacher[]> {
  const { data: links } = await supabase.from("teacher_students").select("teacher_id").eq("student_id", studentId).eq("active", true);
  const ids = (links ?? []).map((l) => l.teacher_id);
  if (ids.length === 0) return [];
  const [{ data: profiles }, { data: tps }, { data: contacts }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", ids),
    supabase.from("teacher_profiles").select("*").in("user_id", ids),
    supabase.from("profile_contacts").select("*").in("user_id", ids),
  ]);
  return ((profiles ?? []) as Profile[]).map((p) => ({
    ...p,
    teacher_profile: ((tps ?? []) as TeacherProfile[]).find((t) => t.user_id === p.id) ?? null,
    contact: ((contacts ?? []) as Contact[]).find((c) => c.user_id === p.id) ?? null,
  }));
}

export async function getMyEnrollment(supabase: SupabaseClient, studentId: string) {
  const { data } = await supabase.from("student_profiles").select("*, course:courses(name, default_duration_min)").eq("user_id", studentId).maybeSingle();
  return data as (StudentProfile & { course: Pick<Course, "name" | "default_duration_min"> | null }) | null;
}

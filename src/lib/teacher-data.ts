import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course, Profile, StudentProfile } from "@/lib/types";

export type MyStudent = {
  assigned_at: string;
  student: Profile & { student_profile: (StudentProfile & { course: Pick<Course, "name"> | null }) | null };
};

// Students currently assigned to the logged-in teacher. RLS already restricts
// teacher_students to the teacher's own rows; the filter is explicit for clarity.
export async function getMyStudents(supabase: SupabaseClient, teacherId: string) {
  const { data } = await supabase
    .from("teacher_students")
    .select(
      "assigned_at, student:profiles!teacher_students_student_id_fkey(*, student_profile:student_profiles(*, course:courses(name)))",
    )
    .eq("teacher_id", teacherId)
    .eq("active", true);
  return ((data ?? []) as unknown as MyStudent[]).sort((a, b) => a.student.full_name.localeCompare(b.student.full_name));
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_SELECT } from "@/lib/sessions";
import type { LessonListRow } from "@/components/class/LessonList";

// Past classes (already started), newest first, with a lesson-record summary.
// RLS decides which classes and which lesson records the viewer can see.
export async function getLessonHistory(
  supabase: SupabaseClient,
  { teacherId, studentId, limit = 100 }: { teacherId?: string; studentId?: string; limit?: number } = {},
) {
  let q = supabase
    .from("class_sessions")
    .select(`${SESSION_SELECT}, lesson:lesson_records!lesson_records_session_id_fkey(feedback_overall, today_topics, shared_with_student)`)
    .lt("starts_at", new Date().toISOString())
    .not("status", "in", "(rescheduled)")
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (teacherId) q = q.eq("teacher_id", teacherId);
  if (studentId) q = q.eq("student_id", studentId);
  const { data } = await q;
  return (data ?? []) as unknown as LessonListRow[];
}

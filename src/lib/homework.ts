import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Homework, HomeworkFile, HomeworkStatus, Review, Submission } from "@/lib/homework-shared";

const HW_SELECT =
  "*, teacher:profiles!homework_assignments_teacher_id_fkey(id, full_name), student:profiles!homework_assignments_student_id_fkey(id, full_name)";

// RLS limits rows to what the viewer may see; filters narrow further.
export async function listHomework(
  supabase: SupabaseClient,
  f: { teacherId?: string; studentId?: string; sessionId?: string; statuses?: HomeworkStatus[]; limit?: number } = {},
) {
  let q = supabase.from("homework_assignments").select(HW_SELECT).order("due_at", { ascending: true }).limit(f.limit ?? 300);
  if (f.teacherId) q = q.eq("teacher_id", f.teacherId);
  if (f.studentId) q = q.eq("student_id", f.studentId);
  if (f.sessionId) q = q.eq("session_id", f.sessionId);
  if (f.statuses?.length) q = q.in("status", f.statuses);
  const { data } = await q;
  return (data ?? []) as unknown as Homework[];
}

// Latest handed-in time per assignment, for "waiting more than 48 h" flags.
export async function latestSubmittedAt(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase
    .from("homework_submissions")
    .select("assignment_id, submitted_at")
    .in("assignment_id", ids)
    .eq("is_draft", false)
    .order("submitted_at", { ascending: false });
  const m = new Map<string, string>();
  for (const r of data ?? []) if (!m.has(r.assignment_id) && r.submitted_at) m.set(r.assignment_id, r.submitted_at);
  return m;
}

export async function getHomeworkDetail(supabase: SupabaseClient, id: string) {
  const { data: hw } = await supabase.from("homework_assignments").select(HW_SELECT).eq("id", id).maybeSingle();
  if (!hw) return null;
  const [{ data: subs }, { data: files }] = await Promise.all([
    supabase.from("homework_submissions").select("*").eq("assignment_id", id).order("version"),
    supabase.from("homework_files").select("*").eq("assignment_id", id).order("position").order("created_at"),
  ]);
  const submissions = (subs ?? []) as Submission[];
  const subIds = submissions.map((s) => s.id);
  const { data: revs } = subIds.length
    ? await supabase.from("homework_reviews").select("*").in("submission_id", subIds)
    : { data: [] as Review[] };

  const all = (files ?? []) as HomeworkFile[];
  const paths = all.filter((f) => f.storage_path).map((f) => f.storage_path!);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("homework").createSignedUrls(paths, 60 * 60);
    for (const f of all) f.signedUrl = signed?.find((s) => s.path === f.storage_path)?.signedUrl ?? undefined;
  }
  for (const f of all) if (!f.storage_path && f.url) f.signedUrl = f.url;

  return {
    homework: hw as unknown as Homework,
    submissions,
    reviews: (revs ?? []) as Review[],
    files: all,
  };
}

export type HomeworkDetail = NonNullable<Awaited<ReturnType<typeof getHomeworkDetail>>>;

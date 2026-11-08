import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IeltsGoal, IeltsResult, ProgressReport } from "@/lib/progress-shared";

// Everything on a student's progress page. RLS decides what comes back: students get published
// reports only; teachers get published reports plus their own drafts, for students they teach.
export async function getProgress(supabase: SupabaseClient, studentId: string) {
  const [{ data: reports }, { data: results }, { data: goal }] = await Promise.all([
    supabase
      .from("progress_reports")
      .select("*, author:profiles!progress_reports_author_id_fkey(full_name)")
      .eq("student_id", studentId)
      .order("period_end", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("ielts_results")
      .select("*, recorder:profiles!ielts_results_recorded_by_fkey(full_name)")
      .eq("student_id", studentId)
      .order("test_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("ielts_goals").select("student_id, target_overall, exam_date").eq("student_id", studentId).maybeSingle(),
  ]);
  return {
    reports: (reports ?? []) as ProgressReport[],
    results: (results ?? []) as IeltsResult[],
    goal: (goal as IeltsGoal | null) ?? null,
  };
}

// Students due a progress report (DASH-02): a teacher's own, or everyone's for an admin.
export async function getProgressDue(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("progress_due");
  return (data ?? []) as { student_id: string; since: string }[];
}

// Latest published report and latest full IELTS result per student, for list pages.
export async function getProgressSummaries(supabase: SupabaseClient, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, { report?: ProgressReport; ielts?: IeltsResult; draft?: ProgressReport }>();
  const [{ data: reports }, { data: results }] = await Promise.all([
    supabase
      .from("progress_reports")
      .select("id, student_id, author_id, status, period_start, period_end, overall, published_at, updated_at")
      .in("student_id", studentIds)
      .order("period_end", { ascending: false })
      .limit(1000),
    supabase
      .from("ielts_results")
      .select("id, student_id, kind, test_date, overall")
      .in("student_id", studentIds)
      .not("overall", "is", null)
      .order("test_date", { ascending: false })
      .limit(1000),
  ]);
  const out = new Map<string, { report?: ProgressReport; ielts?: IeltsResult; draft?: ProgressReport }>();
  for (const id of studentIds) out.set(id, {});
  for (const r of (reports ?? []) as ProgressReport[]) {
    const e = out.get(r.student_id)!;
    if (r.status === "published") e.report ??= r;
    else e.draft ??= r;
  }
  for (const r of (results ?? []) as IeltsResult[]) out.get(r.student_id)!.ielts ??= r;
  return out;
}

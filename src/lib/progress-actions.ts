"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { addDays, isDateStr, todayStr } from "@/lib/time";
import { SKILLS, type ProgressReport } from "@/lib/progress-shared";
import type { ActionState } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Teachers and admins write progress; students only read it.
async function staff() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.profile.role === "student") redirect("/student/progress");
  return s;
}

function dbError(e: { code?: string; message?: string } | null) {
  if (!e) return "Something went wrong.";
  if (e.message?.includes("overall") || e.message?.includes("progress_reports_check1")) return "Choose an overall level before publishing.";
  if (e.message?.includes("cannot go back to draft")) return "This report has already been published.";
  if (e.message?.includes("only be removed by an administrator")) return "Published reports can only be removed by the school office.";
  if (e.message?.includes("progress_reports_check")) return "The end of the period can't be before the start.";
  if (e.message?.includes("ielts_results_check")) return "Enter at least one band.";
  if (e.message?.includes("violates check constraint")) return "That score isn't on the scale.";
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to do that. Is this student still assigned to you?";
  return e.message ?? "Something went wrong.";
}

function refresh(studentId: string) {
  for (const r of ["admin", "teacher", "student"]) revalidatePath(`/${r}`, "layout");
  revalidatePath(`/teacher/progress/${studentId}`);
  revalidatePath(`/admin/progress/${studentId}`);
}

function level(f: FormData, k: string) {
  const v = str(f, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Progress reports (PRG-01..02)
// ---------------------------------------------------------------------------

// Opens the teacher's draft for this student, or starts one: the period runs on from the last
// report (or the last 30 days), and the levels start from the last report so only changes need typing.
export async function startReport(studentId: string) {
  const { supabase, profile } = await staff();
  const base = `/${profile.role}/progress`;
  const { data: draft } = await supabase
    .from("progress_reports")
    .select("id")
    .eq("student_id", studentId)
    .eq("author_id", profile.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draft) redirect(`${base}/reports/${draft.id}`);

  const { data: last } = await supabase
    .from("progress_reports")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "published")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle<ProgressReport>();
  const today = todayStr(profile.timezone);
  let start = last ? addDays(last.period_end, 1) : addDays(today, -30);
  if (start > today) start = today;
  const levels = Object.fromEntries([...SKILLS.map((s) => s.key), "overall"].map((k) => [k, last ? (last as Record<string, unknown>)[k] ?? null : null]));
  const { data, error } = await supabase
    .from("progress_reports")
    .insert({ student_id: studentId, author_id: profile.id, period_start: start, period_end: today, ...levels })
    .select("id")
    .single();
  if (error || !data) redirect(`${base}/${studentId}?error=${encodeURIComponent(dbError(error))}`);
  refresh(studentId);
  redirect(`${base}/reports/${data.id}`);
}

export async function saveReport(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await staff();
  const publish = formData.get("intent") === "publish";
  const [start, end] = [str(formData, "period_start"), str(formData, "period_end")];
  if (!isDateStr(start) || !isDateStr(end)) return { error: "Choose the start and end of the period." };
  if (end < start) return { error: "The end of the period can't be before the start." };
  const levels = Object.fromEntries([...SKILLS.map((s) => s.key), "overall"].map((k) => [k, level(formData, k)]));
  if (publish && levels.overall === null) return { error: "Choose an overall level before publishing." };
  const text = (k: string) => str(formData, k).slice(0, 5000);

  const { data, error } = await supabase
    .from("progress_reports")
    .update({
      period_start: start,
      period_end: end,
      ...levels,
      summary: text("summary"),
      strengths: text("strengths"),
      next_goals: text("next_goals"),
      ...(publish ? { status: "published" } : {}),
    })
    .eq("id", id)
    .select("student_id, status")
    .maybeSingle();
  if (error || !data) return { error: error ? dbError(error) : "This report can't be changed. It may have been removed, or the student is no longer assigned to you." };
  refresh(data.student_id);
  if (publish) redirect(`/${profile.role}/progress/${data.student_id}?published=1`);
  return { ok: true, message: data.status === "published" ? "Changes saved. The student sees the updated report." : "Draft saved. The student can't see it until you publish it." };
}

export async function deleteReport(id: string) {
  const { supabase, profile } = await staff();
  const { data } = await supabase.from("progress_reports").delete().eq("id", id).select("student_id").maybeSingle();
  if (data) refresh(data.student_id);
  redirect(data ? `/${profile.role}/progress/${data.student_id}` : `/${profile.role}/progress`);
}

// ---------------------------------------------------------------------------
// IELTS results and target (PRG-03)
// ---------------------------------------------------------------------------
export async function saveIeltsResult(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await staff();
  const id = str(formData, "id");
  const date = str(formData, "test_date");
  if (!isDateStr(date)) return { error: "Choose the test date." };
  if (date > todayStr("Pacific/Kiritimati")) return { error: "The test date can't be in the future." };
  const kind = str(formData, "kind");
  const testModule = str(formData, "module");
  if (!["diagnostic", "mock", "official"].includes(kind)) return { error: "Choose the kind of test." };
  if (!["academic", "general_training"].includes(testModule)) return { error: "Choose Academic or General Training." };
  const bands = { listening: level(formData, "listening"), reading: level(formData, "reading"), writing: level(formData, "writing"), speaking: level(formData, "speaking") };
  if (Object.values(bands).every((b) => b === null)) return { error: "Enter at least one band." };
  const row = { kind, module: testModule, test_date: date, ...bands, notes: str(formData, "notes").slice(0, 2000) };

  const { error } = id
    ? await supabase.from("ielts_results").update(row).eq("id", id).eq("student_id", studentId).select("id").single()
    : await supabase.from("ielts_results").insert({ ...row, student_id: studentId }).select("id").single();
  if (error) return { error: error.code === "PGRST116" ? "Only the person who entered a result (or the school office) can change it." : dbError(error) };
  refresh(studentId);
  return { ok: true, message: id ? "Result updated." : "Result saved. The student has been notified." };
}

export async function deleteIeltsResult(studentId: string, id: string) {
  const { supabase, profile } = await staff();
  await supabase.from("ielts_results").delete().eq("id", id).eq("student_id", studentId);
  refresh(studentId);
  redirect(`/${profile.role}/progress/${studentId}#ielts`);
}

export async function saveIeltsGoal(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await staff();
  const exam = str(formData, "exam_date");
  if (exam && !isDateStr(exam)) return { error: "Choose a valid exam date." };
  const { error } = await supabase
    .from("ielts_goals")
    .upsert({ student_id: studentId, target_overall: level(formData, "target_overall"), exam_date: exam || null });
  if (error) return { error: dbError(error) };
  refresh(studentId);
  return { ok: true, message: "Target saved." };
}

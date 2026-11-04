"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isDateStr, zonedToUtc } from "@/lib/time";
import type { ActionState } from "@/lib/types";
import type { FileKind } from "@/lib/homework-shared";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function auth() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

function dbError(e: { code?: string; message?: string } | null) {
  if (!e) return "Something went wrong.";
  if (e.message?.includes("only the deadline")) return "This homework has been submitted, so only the deadline can be changed.";
  if (e.message?.includes("not assigned")) return "This student is not assigned to you.";
  if (e.message?.includes("not open for submission")) return "This homework isn't open for submission right now.";
  if (e.message?.includes("Add an answer")) return "Type an answer or attach at least one file before submitting.";
  if (e.message?.includes("cannot be withdrawn")) return "Homework that has been submitted can't be withdrawn.";
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to do that.";
  return e.message ?? "Something went wrong.";
}

function refresh(id?: string) {
  for (const r of ["admin", "teacher", "student"]) {
    revalidatePath(`/${r}`, "layout");
    if (id) revalidatePath(`/${r}/homework/${id}`);
  }
}

function parseDue(formData: FormData, tz: string) {
  const date = str(formData, "due_date");
  const time = str(formData, "due_time") || "23:59";
  if (!isDateStr(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return zonedToUtc(date, time, tz);
}

// ---------------------------------------------------------------------------
// Teacher: assign (HW-S01..S07)
// ---------------------------------------------------------------------------
export async function createHomework(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role !== "teacher") return { error: "Only teachers assign homework." };
  const [studentId, sessionId] = [str(formData, "student_id"), str(formData, "session_id") || null];
  const title = str(formData, "title");
  const due = parseDue(formData, profile.timezone);
  if (!studentId) return { error: "Choose a student." };
  if (!title) return { error: "Give the homework a title." };
  if (!due) return { error: "Choose a deadline." };
  if (due.getTime() < Date.now()) return { error: "The deadline can't be in the past." };

  const { data, error } = await supabase
    .from("homework_assignments")
    .insert({
      teacher_id: profile.id,
      student_id: studentId,
      session_id: sessionId,
      title,
      instructions: str(formData, "instructions"),
      requirements: str(formData, "requirements"),
      due_at: due.toISOString(),
      is_required: formData.get("is_required") === "on",
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error) };

  // HW-S03: reuse materials already attached to the class.
  const materialIds = formData.getAll("material_id").map(String).filter(Boolean);
  if (materialIds.length && sessionId) {
    const { data: mats } = await supabase.from("materials").select("title, url, kind, storage_path").in("id", materialIds).eq("session_id", sessionId);
    const links = (mats ?? []).filter((m) => m.kind === "link" && m.url);
    if (links.length) {
      await supabase
        .from("homework_files")
        .insert(links.map((m, i) => ({ assignment_id: data.id, kind: "reference", title: m.title, url: m.url, position: i, uploaded_by: profile.id })));
    }
    // Class files stay in the class's private storage; link to the class page instead of copying them.
  }
  refresh(data.id);
  redirect(`/teacher/homework/${data.id}?created=1`);
}

export async function updateHomework(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const due = parseDue(formData, profile.timezone);
  if (!due) return { error: "Choose a deadline." };
  const deadlineOnly = formData.get("deadline_only") === "1";
  const patch: Record<string, unknown> = { due_at: due.toISOString() };
  if (!deadlineOnly) {
    const title = str(formData, "title");
    if (!title) return { error: "Give the homework a title." };
    Object.assign(patch, {
      title,
      instructions: str(formData, "instructions"),
      requirements: str(formData, "requirements"),
      is_required: formData.get("is_required") === "on",
    });
  }
  const { data, error } = await supabase.from("homework_assignments").update(patch).eq("id", id).select("id");
  if (error || !data?.length) return { error: dbError(error) };
  refresh(id);
  return { ok: true, message: deadlineOnly ? "Deadline updated." : "Homework updated. The student sees the changes straight away." };
}

export async function deleteHomework(id: string) {
  const { supabase, profile } = await auth();
  const { error } = await supabase.from("homework_assignments").delete().eq("id", id);
  if (error) throw new Error(dbError(error));
  refresh();
  redirect(`/${profile.role}/homework`);
}

export async function addReferenceLink(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const url = str(formData, "url");
  if (!/^https?:\/\//i.test(url)) return { error: "Enter a full link starting with https://" };
  const { error } = await supabase
    .from("homework_files")
    .insert({ assignment_id: id, kind: "reference", title: str(formData, "title") || url, url, uploaded_by: profile.id });
  if (error) return { error: dbError(error) };
  refresh(id);
  return { ok: true, message: "Link added." };
}

// ---------------------------------------------------------------------------
// Files: the browser uploads to storage first, then this records the file.
// ---------------------------------------------------------------------------
export async function registerHomeworkFile(input: {
  assignmentId: string;
  submissionId: string | null;
  kind: FileKind;
  path: string;
  name: string;
  type: string;
  size: number;
  title?: string;
}): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const expected =
    input.kind === "reference" ? `${input.assignmentId}/reference/` : `${input.assignmentId}/${input.submissionId}/${input.kind}/`;
  if (!input.path.startsWith(expected)) return { error: "Invalid upload." };

  let position = 0;
  if (input.submissionId) {
    const { count } = await supabase.from("homework_files").select("id", { count: "exact", head: true }).eq("submission_id", input.submissionId);
    position = count ?? 0;
  }
  const { error } = await supabase.from("homework_files").insert({
    assignment_id: input.assignmentId,
    submission_id: input.submissionId,
    kind: input.kind,
    title: (input.title || input.name).slice(0, 200),
    storage_path: input.path,
    file_name: input.name.slice(0, 255),
    mime_type: input.type,
    size_bytes: input.size,
    position,
    uploaded_by: profile.id,
  });
  if (error) {
    await supabase.storage.from("homework").remove([input.path]);
    return { error: dbError(error) };
  }
  refresh(input.assignmentId);
  return { ok: true };
}

export async function deleteHomeworkFile(assignmentId: string, fileId: string) {
  const { supabase } = await auth();
  const { data } = await supabase.from("homework_files").delete().eq("id", fileId).select("storage_path");
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from("homework").remove([path]);
  refresh(assignmentId);
}

// HW-S12: reorder photo pages before submitting.
export async function moveSubmissionFile(assignmentId: string, submissionId: string, fileId: string, dir: -1 | 1) {
  const { supabase } = await auth();
  const { data } = await supabase.from("homework_files").select("id, position").eq("submission_id", submissionId).order("position").order("created_at");
  const list = data ?? [];
  const i = list.findIndex((f) => f.id === fileId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  // Students have no direct update rights on files; a checked database function stores the order.
  await supabase.rpc("reorder_submission_files", { p_submission: submissionId, p_ids: list.map((f) => f.id) });
  refresh(assignmentId);
}

// ---------------------------------------------------------------------------
// Student: draft, autosave, submit (HW-S10..S15)
// ---------------------------------------------------------------------------
export async function openDraft(assignmentId: string): Promise<{ id?: string; error?: string }> {
  const { supabase } = await auth();
  const { data, error } = await supabase.rpc("open_homework_draft", { p_assignment: assignmentId });
  if (error) return { error: dbError(error) };
  return { id: data as string };
}

export async function saveDraftAnswer(assignmentId: string, submissionId: string, answer: string): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  const { supabase } = await auth();
  const { data, error } = await supabase
    .from("homework_submissions")
    .update({ answer_text: answer.slice(0, 50000) })
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("is_draft", true)
    .select("updated_at");
  if (error || !data?.length) return { ok: false, error: dbError(error) };
  return { ok: true, savedAt: data[0].updated_at };
}

export async function submitHomework(assignmentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const submissionId = str(formData, "submission_id");
  const answer = String(formData.get("answer_text") ?? "");
  if (submissionId) {
    const saved = await saveDraftAnswer(assignmentId, submissionId, answer);
    if (!saved.ok) return { error: saved.error };
  }
  const { error } = await supabase.rpc("submit_homework", { p_assignment: assignmentId });
  if (error) return { error: dbError(error) };
  refresh(assignmentId);
  redirect(`/${profile.role}/homework/${assignmentId}?submitted=1`);
}

// ---------------------------------------------------------------------------
// Teacher: review (HW-S16..S21)
// ---------------------------------------------------------------------------
export async function saveReviewDraft(
  assignmentId: string,
  submissionId: string,
  values: { comments?: string; corrections?: string },
): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  const { supabase, profile } = await auth();
  if (profile.role === "student") return { ok: false, error: "Not allowed." };
  const row: Record<string, unknown> = { submission_id: submissionId, reviewer_id: profile.id };
  if (typeof values.comments === "string") row.comments = values.comments.slice(0, 20000);
  if (typeof values.corrections === "string") row.corrections = values.corrections.slice(0, 20000);
  const { data, error } = await supabase.from("homework_reviews").upsert(row).select("updated_at");
  if (error || !data?.length) return { ok: false, error: dbError(error) };
  return { ok: true, savedAt: data[0].updated_at };
}

export async function sendReview(assignmentId: string, submissionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const decision = str(formData, "decision");
  if (decision !== "needs_revision" && decision !== "completed") return { error: "Choose an outcome." };
  const comments = String(formData.get("comments") ?? "");
  const corrections = String(formData.get("corrections") ?? "");
  if (decision === "needs_revision" && !comments.trim() && !corrections.trim()) {
    return { error: "Tell the student what to change before asking for a revision." };
  }
  const saved = await saveReviewDraft(assignmentId, submissionId, { comments, corrections });
  if (!saved.ok) return { error: saved.error };
  const { error } = await supabase.rpc("send_homework_review", { p_submission: submissionId, p_decision: decision });
  if (error) return { error: dbError(error) };
  refresh(assignmentId);
  redirect(`/${profile.role}/homework/${assignmentId}?reviewed=${decision}`);
}

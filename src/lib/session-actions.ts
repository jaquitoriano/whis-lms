"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession as getAuth } from "@/lib/auth";
import { youtubeId } from "@/lib/sessions";
import { addDays, isDateStr, zonedParts, zonedToUtc } from "@/lib/time";
import type { ActionState } from "@/lib/types";
import { LESSON_FIELDS, SKILLS, type LessonField } from "@/lib/lesson-fields";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function dbError(e: { code?: string; message?: string } | null): string {
  if (!e) return "Something went wrong.";
  if (e.code === "23P01") return "That time overlaps another class for this teacher or student.";
  if (e.message?.includes("not assigned")) return "This student is not assigned to this teacher.";
  if (e.code === "P0001" && e.message) return e.message;
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to do that.";
  return e.message ?? "Something went wrong.";
}

function refresh(sessionId?: string) {
  for (const r of ["admin", "teacher", "student"]) {
    revalidatePath(`/${r}`, "layout");
    if (sessionId) revalidatePath(`/${r}/classes/${sessionId}`);
  }
}

async function auth() {
  const s = await getAuth();
  if (!s) redirect("/login");
  return s;
}

// ---------------------------------------------------------------------------
// Scheduling (CAL, TCH-07, ADM-10..12)
// ---------------------------------------------------------------------------

export async function createClasses(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role === "student") return { error: "Students can't schedule classes." };

  const [pairTeacher, pairStudent] = str(formData, "pair").split("|");
  // Teachers can only ever book for themselves; RLS enforces this too.
  const teacherId = profile.role === "teacher" ? profile.id : pairTeacher;
  const studentId = pairStudent;
  let courseId = str(formData, "course_id") || null;
  if (!courseId && studentId) {
    const { data: sp } = await supabase.from("student_profiles").select("course_id").eq("user_id", studentId).maybeSingle();
    courseId = sp?.course_id ?? null;
  }
  const date = str(formData, "date");
  const time = str(formData, "time");
  const duration = Number(formData.get("duration"));
  const repeat = Math.max(1, Math.min(26, Number(formData.get("repeat_weeks") ?? 1) || 1));
  const meeting = str(formData, "meeting_url") || null;
  const override = formData.get("override") === "on";

  if (!teacherId || !studentId) return { error: "Choose a teacher and a student." };
  if (!isDateStr(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose a date and start time." };
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) return { error: "Duration must be 15–240 minutes." };
  if (meeting && !/^https:\/\//i.test(meeting)) return { error: "The meeting link must start with https://" };

  // Times are entered in the scheduler's own time zone.
  const tz = profile.timezone;
  const slots = Array.from({ length: repeat }, (_, i) => {
    const start = zonedToUtc(addDays(date, i * 7), time, tz);
    return { start, end: new Date(start.getTime() + duration * 60000) };
  });
  if (slots[0].start.getTime() < Date.now() - 60 * 60000) return { error: "That time is in the past." };

  // Warn (don't block) when outside the teacher's set hours or inside a blocked period.
  if (!override) {
    const [{ data: tprof }, { data: av }, { data: bl }] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", teacherId).single(),
      supabase.from("teacher_availability").select("weekday, start_time, end_time").eq("teacher_id", teacherId),
      supabase.from("teacher_blackouts").select("starts_at, ends_at, reason").eq("teacher_id", teacherId).gt("ends_at", slots[0].start.toISOString()),
    ]);
    const ttz = tprof?.timezone ?? tz;
    for (const s of slots) {
      const p = zonedParts(s.start, ttz);
      const e = zonedParts(new Date(s.end.getTime() - 1), ttz);
      const hm = (x: { hour: number; minute: number }) => `${String(x.hour).padStart(2, "0")}:${String(x.minute).padStart(2, "0")}`;
      const within = (av ?? []).some((a) => a.weekday === p.weekday && a.start_time.slice(0, 5) <= hm(p) && hm(e) < a.end_time.slice(0, 5));
      if ((av ?? []).length && !within) return { error: `A class at ${hm(p)} (teacher's time) is outside the teacher's available hours. Tick "Schedule anyway" to continue.` };
      const blocked = (bl ?? []).find((b) => Date.parse(b.starts_at) < s.end.getTime() && Date.parse(b.ends_at) > s.start.getTime());
      if (blocked) return { error: `The teacher is unavailable then${blocked.reason ? ` (${blocked.reason})` : ""}. Tick "Schedule anyway" to continue.` };
    }
  }

  const rows = slots.map((s) => ({
    teacher_id: teacherId,
    student_id: studentId,
    course_id: courseId,
    starts_at: s.start.toISOString(),
    ends_at: s.end.toISOString(),
    meeting_url: meeting,
    created_by: profile.id,
  }));
  const { data, error } = await supabase.from("class_sessions").insert(rows).select("id");
  if (error) return { error: dbError(error) };
  refresh();
  if (data && data.length === 1) redirect(`/${profile.role}/classes/${data[0].id}`);
  return { ok: true, message: `${rows.length} classes scheduled.` };
}

const TEACHER_STATUSES = ["completed", "cancelled", "student_absent"];
const ADMIN_STATUSES = [...TEACHER_STATUSES, "teacher_absent", "scheduled"];

export async function setClassStatus(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const status = str(formData, "status");
  const reason = str(formData, "reason") || null;
  const allowed = profile.role === "admin" ? ADMIN_STATUSES : profile.role === "teacher" ? TEACHER_STATUSES : [];
  if (!allowed.includes(status)) return { error: "You can't set that status." };
  if (status === "cancelled" && !reason) return { error: "Please give a reason for cancelling." };
  // OD-04: who asked decides whether a late cancellation uses up a class (worked out in the database).
  const requestedBy = str(formData, "requested_by");
  if (status === "cancelled" && !["student", "teacher", "school"].includes(requestedBy)) return { error: "Choose who asked to cancel." };
  const minutesLate = Number(formData.get("minutes_late") ?? 0);
  const late = status === "completed" && formData.get("attendance") === "late";
  if (late && (!Number.isInteger(minutesLate) || minutesLate < 1 || minutesLate > 240)) return { error: "Enter how many minutes late (1–240)." };

  const patch: Record<string, unknown> = { status, status_reason: reason };
  if (status === "cancelled") patch.cancel_requested_by = requestedBy;
  const { error, data } = await supabase.from("class_sessions").update(patch).eq("id", sessionId).select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "You don't have permission to change this class." };
  // ATT-02: the status sets a default mark (completed = present); a late arrival replaces it.
  if (late) await supabase.from("attendance").update({ mark: "late", minutes_late: minutesLate }).eq("session_id", sessionId);

  // Completing a class shares its lesson record with the student.
  if (status === "completed") {
    await supabase.rpc("ensure_lesson_record", { p_session: sessionId });
    await supabase.from("lesson_records").update({ shared_with_student: true }).eq("session_id", sessionId);
  }
  refresh(sessionId);
  return { ok: true, message: "Class updated." };
}

// ATT-02: correct the attendance mark after the class (Present <-> Late, with a note).
export async function saveAttendance(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role === "student") return { error: "Not allowed." };
  const mark = str(formData, "mark");
  const minutes = Number(formData.get("minutes_late") ?? 0);
  const { data: cur } = await supabase.from("attendance").select("mark").eq("session_id", sessionId).maybeSingle();
  if (!cur) return { error: "Attendance is recorded when the class is closed." };
  // Absent, cancelled and rescheduled follow the class status; only completed classes have a choice.
  const patch: Record<string, unknown> = { note: str(formData, "note").slice(0, 1000) };
  if (mark === "present" || mark === "late") {
    if (cur.mark !== "present" && cur.mark !== "late") return { error: "Change the class status to change this mark." };
    if (mark === "late" && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) return { error: "Enter how many minutes late (1–240)." };
    patch.mark = mark;
    patch.minutes_late = mark === "late" ? minutes : null;
  }
  const { error, data } = await supabase.from("attendance").update(patch).eq("session_id", sessionId).select("session_id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "You don't have permission to change this attendance." };
  refresh(sessionId);
  return { ok: true, message: "Attendance saved." };
}

// Admin only: which package a class belongs to, and whether it used up a class (OD-04 override).
export async function setSessionBilling(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role !== "admin") return { error: "Only an administrator can change this." };
  const { error, data } = await supabase
    .from("class_sessions")
    .update({ enrollment_id: str(formData, "enrollment_id") || null, counts_as_used: formData.get("counts_as_used") === "on" })
    .eq("id", sessionId)
    .select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "Class not found." };
  refresh(sessionId);
  revalidatePath("/admin/billing", "layout");
  return { ok: true, message: "Package details saved." };
}

export async function rescheduleClass(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role === "student") return { error: "Please contact your teacher or the school office to reschedule." };
  const date = str(formData, "date");
  const time = str(formData, "time");
  const reason = str(formData, "reason") || null;
  if (!isDateStr(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Choose the new date and time." };

  const { data: cur } = await supabase.from("class_sessions").select("starts_at, ends_at").eq("id", sessionId).single();
  if (!cur) return { error: "Class not found." };
  const start = zonedToUtc(date, time, profile.timezone);
  const end = new Date(start.getTime() + (Date.parse(cur.ends_at) - Date.parse(cur.starts_at)));
  if (start.getTime() < Date.now()) return { error: "The new time is in the past." };

  const { data: newId, error } = await supabase.rpc("reschedule_session", {
    p_session: sessionId,
    p_starts: start.toISOString(),
    p_ends: end.toISOString(),
    p_reason: reason,
  });
  if (error) return { error: dbError(error) };
  refresh(sessionId);
  redirect(`/${profile.role}/classes/${newId}`);
}

export async function updateMeetingLink(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await auth();
  const url = str(formData, "meeting_url") || null;
  if (url && !/^https:\/\//i.test(url)) return { error: "The link must start with https://" };
  const { error, data } = await supabase.from("class_sessions").update({ meeting_url: url }).eq("id", sessionId).select("id");
  if (error || !data?.length) return { error: dbError(error) };
  refresh(sessionId);
  return { ok: true, message: "Meeting link saved." };
}

// ---------------------------------------------------------------------------
// Lesson records (LES-01..05)
// ---------------------------------------------------------------------------


export async function saveLessonRecord(
  sessionId: string,
  values: Partial<Record<LessonField, string>> & { today_skills?: string[]; private_notes?: string },
): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  const { supabase, profile } = await auth();
  if (profile.role === "student") return { ok: false, error: "Not allowed." };
  const patch: Record<string, unknown> = { updated_by: profile.id };
  for (const f of LESSON_FIELDS) if (typeof values[f] === "string") patch[f] = values[f]!.slice(0, 10000);
  if (Array.isArray(values.today_skills)) patch.today_skills = values.today_skills.filter((s) => (SKILLS as readonly string[]).includes(s));

  await supabase.rpc("ensure_lesson_record", { p_session: sessionId });
  const { error, data } = await supabase.from("lesson_records").update(patch).eq("session_id", sessionId).select("updated_at");
  if (error || !data?.length) return { ok: false, error: dbError(error) };
  if (typeof values.private_notes === "string") {
    await supabase.from("lesson_private_notes").upsert({ session_id: sessionId, notes: values.private_notes.slice(0, 10000) });
  }
  return { ok: true, savedAt: data[0].updated_at };
}

export async function setLessonShared(sessionId: string, shared: boolean) {
  const { supabase } = await auth();
  await supabase.rpc("ensure_lesson_record", { p_session: sessionId });
  await supabase.from("lesson_records").update({ shared_with_student: shared }).eq("session_id", sessionId);
  refresh(sessionId);
}

// ---------------------------------------------------------------------------
// Materials (MAT-01..04) and videos (VID-01..05)
// ---------------------------------------------------------------------------

export async function addMaterialLink(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const title = str(formData, "title");
  const url = str(formData, "url");
  if (!title) return { error: "Give the material a title." };
  if (!/^https?:\/\//i.test(url)) return { error: "Enter a full link starting with https://" };
  const { error } = await supabase.from("materials").insert({
    session_id: sessionId,
    title,
    unit_chapter: str(formData, "unit_chapter"),
    pages: str(formData, "pages"),
    kind: "link",
    url,
    uploaded_by: profile.id,
  });
  if (error) return { error: dbError(error) };
  refresh(sessionId);
  return { ok: true, message: "Link added." };
}

// Called after the browser has uploaded the file straight to storage.
export async function registerMaterialFile(
  sessionId: string,
  file: { path: string; name: string; type: string; size: number; title: string; unit_chapter: string; pages: string },
): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (!file.path.startsWith(`${sessionId}/`)) return { error: "Invalid upload." };
  const { error } = await supabase.from("materials").insert({
    session_id: sessionId,
    title: (file.title || file.name).slice(0, 200),
    unit_chapter: file.unit_chapter.slice(0, 200),
    pages: file.pages.slice(0, 100),
    kind: "file",
    storage_path: file.path,
    file_name: file.name.slice(0, 255),
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: profile.id,
  });
  if (error) {
    await supabase.storage.from("materials").remove([file.path]);
    return { error: dbError(error) };
  }
  refresh(sessionId);
  return { ok: true, message: "File uploaded." };
}

export async function deleteMaterial(sessionId: string, materialId: string) {
  const { supabase } = await auth();
  const { data } = await supabase.from("materials").delete().eq("id", materialId).select("storage_path");
  const path = data?.[0]?.storage_path;
  if (path) await supabase.storage.from("materials").remove([path]);
  refresh(sessionId);
}

export async function addVideo(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  const id = youtubeId(str(formData, "url"));
  const title = str(formData, "title");
  if (!id) return { error: "That doesn't look like a YouTube link." };
  if (!title) return { error: "Give the video a title." };
  const { error } = await supabase.from("videos").insert({
    session_id: sessionId,
    youtube_id: id,
    title,
    description: str(formData, "description"),
    added_by: profile.id,
  });
  if (error) return { error: dbError(error) };
  refresh(sessionId);
  return { ok: true, message: "Video added." };
}

export async function deleteVideo(sessionId: string, videoId: string) {
  const { supabase } = await auth();
  await supabase.from("videos").delete().eq("id", videoId);
  refresh(sessionId);
}

// ---------------------------------------------------------------------------
// Teacher availability (TCH-08)
// ---------------------------------------------------------------------------

export async function saveAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role !== "teacher") return { error: "Only teachers set availability here." };
  const rows: { teacher_id: string; weekday: number; start_time: string; end_time: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (formData.get(`on_${d}`) !== "on") continue;
    const start = str(formData, `start_${d}`);
    const end = str(formData, `end_${d}`);
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      return { error: "Each available day needs a start time before its end time." };
    }
    rows.push({ teacher_id: profile.id, weekday: d, start_time: start, end_time: end });
  }
  const del = await supabase.from("teacher_availability").delete().eq("teacher_id", profile.id);
  if (del.error) return { error: dbError(del.error) };
  if (rows.length) {
    const { error } = await supabase.from("teacher_availability").insert(rows);
    if (error) return { error: dbError(error) };
  }
  refresh();
  return { ok: true, message: "Available hours saved." };
}

export async function addBlackout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await auth();
  if (profile.role !== "teacher") return { error: "Not allowed." };
  const from = str(formData, "from_date");
  const to = str(formData, "to_date") || from;
  if (!isDateStr(from) || !isDateStr(to) || to < from) return { error: "Choose a valid date range." };
  const allDay = formData.get("all_day") === "on";
  const startT = allDay ? "00:00" : str(formData, "from_time") || "00:00";
  const endT = allDay ? "00:00" : str(formData, "to_time") || "23:59";
  const starts = zonedToUtc(from, startT, profile.timezone);
  const ends = allDay ? zonedToUtc(addDays(to, 1), "00:00", profile.timezone) : zonedToUtc(to, endT, profile.timezone);
  if (ends <= starts) return { error: "The end must be after the start." };
  const { error } = await supabase
    .from("teacher_blackouts")
    .insert({ teacher_id: profile.id, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: str(formData, "reason") });
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: true, message: "Time blocked." };
}

export async function deleteBlackout(id: string) {
  const { supabase } = await auth();
  await supabase.from("teacher_blackouts").delete().eq("id", id);
  refresh();
}

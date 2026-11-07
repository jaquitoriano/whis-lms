import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

export type SessionStatus = "scheduled" | "completed" | "cancelled" | "rescheduled" | "student_absent" | "teacher_absent";

export type SessionRow = {
  id: string;
  teacher_id: string;
  student_id: string;
  course_id: string | null;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
  meeting_url: string | null;
  rescheduled_from_id: string | null;
  status_reason: string | null;
  enrollment_id: string | null;
  counts_as_used: boolean;
  late_cancel: boolean;
  cancel_requested_by: "student" | "teacher" | "school" | null;
  teacher: { id: string; full_name: string; timezone: string } | null;
  student: { id: string; full_name: string; timezone: string } | null;
  course: { name: string; type: string } | null;
};

export const SESSION_SELECT =
  "*, teacher:profiles!class_sessions_teacher_id_fkey(id, full_name, timezone), student:profiles!class_sessions_student_id_fkey(id, full_name, timezone), course:courses(name, type)";

export const statusLabel: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  student_absent: "Student absent",
  teacher_absent: "Teacher absent",
};

export const statusStyle: Record<SessionStatus, string> = {
  scheduled: "bg-brand-50 text-brand-700 border-brand-100",
  completed: "bg-green-50 text-green-700 border-green-100",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  rescheduled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  student_absent: "bg-amber-50 text-amber-700 border-amber-100",
  teacher_absent: "bg-red-50 text-red-700 border-red-100",
};

// Sessions overlapping [from, to). RLS limits rows to what the viewer may see;
// the optional filters narrow further (e.g. admin filtering by teacher).
export async function getSessions(
  supabase: SupabaseClient,
  { from, to, teacherId, studentId }: { from: Date; to: Date; teacherId?: string; studentId?: string },
) {
  let q = supabase
    .from("class_sessions")
    .select(SESSION_SELECT)
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .order("starts_at");
  if (teacherId) q = q.eq("teacher_id", teacherId);
  if (studentId) q = q.eq("student_id", studentId);
  const { data } = await q;
  return (data ?? []) as unknown as SessionRow[];
}

export async function getSession(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("class_sessions").select(SESSION_SELECT).eq("id", id).maybeSingle();
  return data as unknown as SessionRow | null;
}

export function classPath(role: Role, id: string) {
  return `/${role}/classes/${id}`;
}

// Name of "the other person" for calendar chips.
export function counterpart(s: SessionRow, viewer: Role) {
  if (viewer === "student") return s.teacher?.full_name ?? "Teacher";
  if (viewer === "teacher") return s.student?.full_name ?? "Student";
  return `${s.teacher?.full_name ?? "?"} → ${s.student?.full_name ?? "?"}`;
}

export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1, 12) || null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v")!.slice(0, 11);
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

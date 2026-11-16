"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireRole } from "@/lib/auth";
import { syncSoon } from "@/lib/meetings/sync";
import type { ActionState } from "@/lib/types";

// Phase 7b: connect a teacher to Zoom or Google Meet so their classes get links automatically.
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveMeetingAccount(teacherId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const provider = str(formData, "provider");
  if (provider === "none") {
    const { error } = await supabase.from("teacher_meeting_accounts").delete().eq("teacher_id", teacherId);
    if (error) return { error: "Could not disconnect." };
    revalidatePath(`/admin/users/${teacherId}`);
    return { ok: true, message: "Disconnected. Existing meetings stay as they are; new classes need a link typed in." };
  }
  if (provider !== "zoom" && provider !== "google_meet") return { error: "Choose Zoom or Google Meet." };
  const email = str(formData, "account_email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
    return { error: provider === "zoom" ? "Enter the teacher's Zoom account email." : "Enter the teacher's Google Workspace email." };
  }
  const { error } = await supabase
    .from("teacher_meeting_accounts")
    .upsert({ teacher_id: teacherId, provider, account_email: email, active: formData.get("active") === "on" });
  if (error) return { error: "Could not save the meeting account." };
  revalidatePath(`/admin/users/${teacherId}`);
  return { ok: true, message: "Saved. New classes for this teacher will get a link automatically." };
}

export async function queueUpcomingMeetings(teacherId: string, _prev: ActionState): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("queue_meetings_for_teacher", { p_teacher: teacherId });
  if (error) return { error: error.message };
  syncSoon();
  revalidatePath(`/admin/users/${teacherId}`);
  return { ok: true, message: data ? `Creating links for ${data} upcoming class${data === 1 ? "" : "es"}.` : "Every upcoming class already has a link." };
}

export async function retryMeeting(sessionId: string) {
  const s = await getSession();
  if (!s || s.profile.role === "student") return;
  await s.supabase.rpc("retry_class_meeting", { p_session: sessionId });
  syncSoon();
  for (const r of ["admin", "teacher"]) revalidatePath(`/${r}/classes/${sessionId}`);
}

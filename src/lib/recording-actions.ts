"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

// Class recording links (REC-01..02). The database decides who may add, share or remove them:
// the class's own teacher and admins.
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function staff() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

function refresh(sessionId: string) {
  for (const r of ["admin", "teacher", "student"]) {
    revalidatePath(`/${r}`, "layout");
    revalidatePath(`/${r}/classes/${sessionId}`);
  }
}

export async function addRecording(sessionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await staff();
  if (profile.role === "student") return { error: "Only teachers and the school office add recordings." };
  const url = str(formData, "rec_url");
  if (!/^https:\/\/\S+$/.test(url) || url.length > 2000) return { error: "Paste the full recording link, starting with https://" };
  const { error } = await supabase.from("class_recordings").insert({
    session_id: sessionId,
    url,
    title: str(formData, "rec_title").slice(0, 200),
    passcode: str(formData, "rec_passcode").slice(0, 100) || null,
    visible_to_student: formData.get("rec_shared") === "on",
    added_by: profile.id,
  });
  if (error) return { error: error.code === "42501" || error.message.includes("row-level security") ? "Only this class's teacher or the school office can add a recording." : "Could not save the recording." };
  refresh(sessionId);
  return { ok: true, message: formData.get("rec_shared") === "on" ? "Recording added and shared with the student." : "Recording added. The student can't see it until you share it." };
}

export async function setRecordingShared(sessionId: string, id: string, shared: boolean) {
  const { supabase } = await staff();
  await supabase.from("class_recordings").update({ visible_to_student: shared }).eq("id", id).eq("session_id", sessionId);
  refresh(sessionId);
}

export async function deleteRecording(sessionId: string, id: string) {
  const { supabase } = await staff();
  await supabase.from("class_recordings").delete().eq("id", id).eq("session_id", sessionId);
  refresh(sessionId);
}

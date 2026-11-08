"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { ActionState } from "@/lib/types";

async function participant() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.profile.role === "admin") redirect("/admin/messages");
  return s;
}

function dbError(message: string | undefined) {
  if (!message) return "Something went wrong.";
  if (message.includes("own teacher or students")) return "You can only message your own teacher or students.";
  if (message.includes("can't send messages") || message.includes("can''t send")) return "You can't reply in this conversation any more.";
  if (message.includes("Attachment not found")) return "One of the files didn't finish uploading. Remove it and attach it again.";
  if (message.includes("Write a message")) return "Write a message or attach a file.";
  if (message.includes("up to 5000")) return "Messages can be up to 5,000 characters.";
  if (message.includes("up to 10 files")) return "Attach up to 10 files per message.";
  return "Your message couldn't be sent. Please try again.";
}

// Opens (or starts) the general conversation with a teacher/student, or a class's conversation.
export async function openConversation(formData: FormData) {
  const { supabase, profile } = await participant();
  const withId = String(formData.get("with") ?? "") || null;
  const sessionId = String(formData.get("session") ?? "") || null;
  const { data, error } = await supabase.rpc("open_thread", { p_with: withId, p_session: sessionId });
  if (error || !data) redirect(`/${profile.role}/messages?error=${encodeURIComponent(dbError(error?.message))}`);
  redirect(`/${profile.role}/messages/${data}`);
}

export async function sendMessage(threadId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await participant();
  let files: unknown = [];
  try {
    files = JSON.parse(String(formData.get("files") || "[]"));
  } catch {
    return { error: "One of the attachments is invalid. Remove it and try again." };
  }
  const { error } = await supabase.rpc("send_message", { p_thread: threadId, p_body: String(formData.get("body") ?? ""), p_files: files });
  if (error) return { error: dbError(error.message) };
  revalidatePath(`/${profile.role}/messages`, "layout");
  return { ok: true };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

// Messaging (MSG-01). Who can read what is decided by the database (thread_access); these
// helpers only shape the data for the pages.

type Person = { id: string; full_name: string; avatar_url: string | null } | null;

export type Thread = {
  id: string;
  kind: "general" | "class";
  teacher_id: string;
  student_id: string;
  session_id: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_sender_id: string | null;
  last_preview: string;
  teacher_read_at: string | null;
  student_read_at: string | null;
  teacher: Person;
  student: Person;
  session: { id: string; starts_at: string; status: string } | null;
};

export type MessageFile = { id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; url?: string };
export type Message = { id: string; sender_id: string | null; body: string; created_at: string; files: MessageFile[] };

const THREAD_SELECT =
  "*, teacher:profiles!message_threads_teacher_id_fkey(id, full_name, avatar_url), student:profiles!message_threads_student_id_fkey(id, full_name, avatar_url), session:class_sessions(id, starts_at, status)";

export function isUnread(t: Thread, viewerId: string) {
  if (!t.last_message_at || t.last_sender_id === viewerId) return false;
  const read = viewerId === t.teacher_id ? t.teacher_read_at : viewerId === t.student_id ? t.student_read_at : null;
  if (viewerId !== t.teacher_id && viewerId !== t.student_id) return false;
  return !read || t.last_message_at > read;
}

// The other person in the conversation, from the viewer's side (admins see "teacher and student").
export function otherParty(t: Thread, viewer: Pick<Profile, "id" | "role">) {
  if (viewer.id === t.teacher_id) return { person: t.student, fallback: "Former student" };
  return { person: t.teacher, fallback: "Former teacher" };
}

export async function listThreads(supabase: SupabaseClient, viewer: Pick<Profile, "id" | "role">, opts: { studentId?: string; teacherId?: string; limit?: number } = {}) {
  let q = supabase.from("message_threads").select(THREAD_SELECT);
  if (viewer.role === "teacher") q = q.eq("teacher_id", viewer.id);
  if (viewer.role === "student") q = q.eq("student_id", viewer.id);
  if (opts.studentId) q = q.eq("student_id", opts.studentId);
  if (opts.teacherId) q = q.eq("teacher_id", opts.teacherId);
  // Empty conversations show only to the person who opened them.
  q = q.or(`last_message_at.not.is.null,created_by.eq.${viewer.id}`);
  const { data } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 200);
  return (data ?? []) as Thread[];
}

export async function getThread(supabase: SupabaseClient, id: string) {
  const { data: thread } = await supabase.from("message_threads").select(THREAD_SELECT).eq("id", id).maybeSingle<Thread>();
  if (!thread) return null;
  const [{ data: rows }, { data: access }] = await Promise.all([
    // Latest 300 messages; older ones stay in the database.
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at, files:message_files(id, storage_path, file_name, mime_type, size_bytes)")
      .eq("thread_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.rpc("thread_access", { p_thread: id }),
  ]);
  const messages = ((rows ?? []) as Message[]).reverse();
  const paths = messages.flatMap((m) => m.files.map((f) => f.storage_path));
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("messages").createSignedUrls(paths, 60 * 60);
    const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const m of messages) for (const f of m.files) f.url = url.get(f.storage_path) ?? undefined;
  }
  return { thread, messages, canWrite: access === "write", truncated: messages.length === 300 };
}

export async function unreadMessageCount(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("unread_message_count");
  return typeof data === "number" ? data : 0;
}

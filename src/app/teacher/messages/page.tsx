import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { listThreads } from "@/lib/messages";
import { openConversation } from "@/lib/message-actions";
import { ThreadList } from "@/components/messages/ThreadList";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Messages" };

export default async function TeacherMessagesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { error } = await searchParams;
  const [threads, students] = await Promise.all([listThreads(supabase, profile), getMyStudents(supabase, profile.id)]);

  return (
    <>
      <PageHeader title="Messages" description="Conversations with your students. Class conversations start from a class page." />
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {students.length > 0 && (
        <form action={openConversation} className="card mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="with">
              Message a student
            </label>
            <select id="with" name="with" className="input" required>
              {students.map(({ student }) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton pendingText="Opening…">Open conversation</SubmitButton>
        </form>
      )}
      <ThreadList threads={threads} viewer={profile} empty="No messages yet." />
    </>
  );
}

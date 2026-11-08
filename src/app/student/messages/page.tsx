import { requireRole } from "@/lib/auth";
import { getMyTeachers } from "@/lib/student-data";
import { listThreads } from "@/lib/messages";
import { openConversation } from "@/lib/message-actions";
import { ThreadList } from "@/components/messages/ThreadList";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Messages" };

export default async function StudentMessagesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { error } = await searchParams;
  const [threads, teachers] = await Promise.all([listThreads(supabase, profile), getMyTeachers(supabase, profile.id)]);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Ask your teacher about classes and homework. To change a class time or for payments, contact the school office."
        action={
          teachers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {teachers.map((t) => (
                <form key={t.id} action={openConversation}>
                  <input type="hidden" name="with" value={t.id} />
                  <SubmitButton pendingText="Opening…">{`Message ${t.full_name.split(" ")[0]}`}</SubmitButton>
                </form>
              ))}
            </div>
          )
        }
      />
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ThreadList threads={threads} viewer={profile} empty="No messages yet. Use the button above to write to your teacher." />
    </>
  );
}

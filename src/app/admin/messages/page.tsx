import { requireRole } from "@/lib/auth";
import { listThreads } from "@/lib/messages";
import { ThreadList } from "@/components/messages/ThreadList";
import { PageHeader, Pager, paginate } from "@/components/ui";

export const metadata = { title: "Messages" };

// Read-only view of every teacher-student conversation (safeguarding). Each conversation an admin
// opens is written to the audit log.
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ page?: string; student?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { page, student } = await searchParams;
  const studentId = student && /^[0-9a-f-]{36}$/.test(student) ? student : undefined;
  const p = paginate(await listThreads(supabase, profile, { limit: 1000, studentId }), page);
  return (
    <>
      <PageHeader
        title="Messages"
        description="All conversations between teachers and students, newest first. Read only; opening a conversation is recorded in the audit log."
      />
      <ThreadList threads={p.rows} viewer={profile} empty="No conversations yet." />
      <Pager {...p} base="/admin/messages" params={{ student: studentId }} />
    </>
  );
}

import { requireRole } from "@/lib/auth";
import { listHomework } from "@/lib/homework";
import { isOverdue } from "@/lib/homework-shared";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { Tabs } from "@/components/homework/Tabs";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Homework" };

// HW-S08: one list, nearest deadline first, filtered by state.
export default async function StudentHomeworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { tab = "todo" } = await searchParams;
  const all = await listHomework(supabase, { studentId: profile.id });
  const groups = {
    todo: all.filter((h) => h.status === "assigned"),
    revision: all.filter((h) => h.status === "needs_revision"),
    submitted: all.filter((h) => h.status === "submitted" || h.status === "under_review"),
    completed: all.filter((h) => h.status === "completed").reverse(),
  };
  const active = (Object.keys(groups) as (keyof typeof groups)[]).includes(tab as keyof typeof groups) ? (tab as keyof typeof groups) : "todo";
  const overdue = [...groups.todo, ...groups.revision].filter((h) => isOverdue(h) && h.is_required).length;

  return (
    <>
      <PageHeader title="Homework" description={overdue ? `You have ${overdue} overdue piece${overdue > 1 ? "s" : ""} of homework.` : "Nearest deadline first."} />
      <Tabs
        base="/student/homework"
        active={active}
        tabs={[
          { key: "todo", label: "To do", count: groups.todo.length },
          { key: "revision", label: "Needs revision", count: groups.revision.length },
          { key: "submitted", label: "Submitted", count: groups.submitted.length },
          { key: "completed", label: "Completed", count: groups.completed.length },
        ]}
      />
      <HomeworkTable rows={groups[active]} viewer="student" tz={profile.timezone} empty="Nothing here." />
    </>
  );
}

import { requireRole } from "@/lib/auth";
import { countCompletedHomework, listHomework, OPEN_HOMEWORK, OPEN_LIMIT } from "@/lib/homework";
import { isOverdue } from "@/lib/homework-shared";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { Tabs } from "@/components/homework/Tabs";
import { PageHeader, Pager, paginate, PER_PAGE } from "@/components/ui";

export const metadata = { title: "Homework" };

// HW-S08: one list, nearest deadline first, filtered by state.
export default async function StudentHomeworkPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { tab = "todo", page } = await searchParams;
  const [open, completed, completedTotal] = await Promise.all([
    listHomework(supabase, { studentId: profile.id, statuses: OPEN_HOMEWORK, limit: OPEN_LIMIT }),
    listHomework(supabase, { studentId: profile.id, statuses: ["completed"], newestFirst: true, limit: PER_PAGE * 4 }),
    countCompletedHomework(supabase, { studentId: profile.id }),
  ]);
  const groups = {
    todo: open.filter((h) => h.status === "assigned"),
    revision: open.filter((h) => h.status === "needs_revision"),
    submitted: open.filter((h) => h.status === "submitted" || h.status === "under_review"),
    completed,
  };
  const active = (Object.keys(groups) as (keyof typeof groups)[]).includes(tab as keyof typeof groups) ? (tab as keyof typeof groups) : "todo";
  const list = paginate(groups[active], page);
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
          { key: "completed", label: "Completed", count: completedTotal },
        ]}
      />
      <HomeworkTable rows={list.rows} viewer="student" tz={profile.timezone} empty="Nothing here." />
      <Pager {...list} base="/student/homework" params={{ tab: active }} />
    </>
  );
}

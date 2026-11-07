import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { countCompletedHomework, listHomework, latestSubmittedAt, OPEN_HOMEWORK, OPEN_LIMIT } from "@/lib/homework";
import { isOverdue } from "@/lib/homework-shared";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { Tabs } from "@/components/homework/Tabs";
import { PageHeader, Pager, paginate, PER_PAGE } from "@/components/ui";

export const metadata = { title: "Homework" };

export default async function TeacherHomeworkPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { tab = "review", page } = await searchParams;
  const [open, completed, completedTotal] = await Promise.all([
    listHomework(supabase, { teacherId: profile.id, statuses: OPEN_HOMEWORK, limit: OPEN_LIMIT }),
    listHomework(supabase, { teacherId: profile.id, statuses: ["completed"], newestFirst: true, limit: PER_PAGE * 4 }),
    countCompletedHomework(supabase, { teacherId: profile.id }),
  ]);
  const waiting = await latestSubmittedAt(supabase, open.filter((h) => h.status === "submitted" || h.status === "under_review").map((h) => h.id));

  // HW-S16: review queue, oldest submission first.
  const review = open
    .filter((h) => h.status === "submitted" || h.status === "under_review")
    .sort((a, b) => Date.parse(waiting.get(a.id) ?? a.due_at) - Date.parse(waiting.get(b.id) ?? b.due_at));
  const withStudent = open.filter((h) => h.status === "assigned" || h.status === "needs_revision");
  const overdue = withStudent.filter((h) => isOverdue(h) && h.is_required).length;

  const list = paginate(tab === "student" ? withStudent : tab === "completed" ? completed : review, page);
  return (
    <>
      <PageHeader
        title="Homework"
        description={overdue ? `${overdue} required piece${overdue > 1 ? "s are" : " is"} overdue.` : undefined}
        action={
          <Link href="/teacher/homework/new" className="btn-primary">
            Assign homework
          </Link>
        }
      />
      <Tabs
        base="/teacher/homework"
        active={["student", "completed"].includes(tab) ? tab : "review"}
        tabs={[
          { key: "review", label: "To review", count: review.length },
          { key: "student", label: "With student", count: withStudent.length },
          { key: "completed", label: "Completed", count: completedTotal },
        ]}
      />
      <HomeworkTable
        rows={list.rows}
        viewer="teacher"
        tz={profile.timezone}
        waitingSince={waiting}
        empty={tab === "student" ? "No open homework." : tab === "completed" ? "Nothing completed yet." : "Nothing waiting for review."}
      />
      <Pager {...list} base="/teacher/homework" params={{ tab }} />
    </>
  );
}

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listHomework, latestSubmittedAt } from "@/lib/homework";
import { isOverdue } from "@/lib/homework-shared";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { Tabs } from "@/components/homework/Tabs";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Homework" };

export default async function TeacherHomeworkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { tab = "review" } = await searchParams;
  const all = await listHomework(supabase, { teacherId: profile.id });
  const waiting = await latestSubmittedAt(supabase, all.filter((h) => h.status === "submitted" || h.status === "under_review").map((h) => h.id));

  // HW-S16: review queue, oldest submission first.
  const review = all
    .filter((h) => h.status === "submitted" || h.status === "under_review")
    .sort((a, b) => Date.parse(waiting.get(a.id) ?? a.due_at) - Date.parse(waiting.get(b.id) ?? b.due_at));
  const withStudent = all.filter((h) => h.status === "assigned" || h.status === "needs_revision");
  const completed = all.filter((h) => h.status === "completed").reverse();
  const overdue = withStudent.filter((h) => isOverdue(h) && h.is_required).length;

  const rows = tab === "student" ? withStudent : tab === "completed" ? completed : review;
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
          { key: "completed", label: "Completed", count: completed.length },
        ]}
      />
      <HomeworkTable
        rows={rows}
        viewer="teacher"
        tz={profile.timezone}
        waitingSince={waiting}
        empty={tab === "student" ? "No open homework." : tab === "completed" ? "Nothing completed yet." : "Nothing waiting for review."}
      />
    </>
  );
}

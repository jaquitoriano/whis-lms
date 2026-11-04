import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listHomework, latestSubmittedAt } from "@/lib/homework";
import { isOverdue, type HomeworkStatus } from "@/lib/homework-shared";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Homework monitoring" };

const STATUSES: HomeworkStatus[] = ["assigned", "submitted", "under_review", "needs_revision", "completed"];

// HW-S25: homework across the school, with overdue work and review backlogs flagged.
export default async function AdminHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string; student?: string; status?: string; flag?: string }>;
}) {
  const { supabase, profile } = await requireRole("admin");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as HomeworkStatus) ? (sp.status as HomeworkStatus) : undefined;

  const [all, { data: teachers }, { data: students }] = await Promise.all([
    listHomework(supabase, { teacherId: sp.teacher || undefined, studentId: sp.student || undefined, statuses: status ? [status] : undefined, limit: 500 }),
    supabase.from("profiles").select("id, full_name").eq("role", "teacher").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
  ]);
  const waiting = await latestSubmittedAt(supabase, all.filter((h) => h.status === "submitted" || h.status === "under_review").map((h) => h.id));
  const now = Date.now();
  const overdue = all.filter((h) => h.is_required && isOverdue(h, now));
  const slow = all.filter((h) => (h.status === "submitted" || h.status === "under_review") && now - Date.parse(waiting.get(h.id) ?? h.due_at) > 48 * 3600000);
  const rows = sp.flag === "overdue" ? overdue : sp.flag === "slow" ? slow : all;

  return (
    <>
      <PageHeader title="Homework monitoring" description="View only. Teachers set and review homework." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open with students" value={all.filter((h) => h.status === "assigned" || h.status === "needs_revision").length} />
        <StatCard label="Waiting for review" value={all.filter((h) => h.status === "submitted" || h.status === "under_review").length} />
        <StatCard label="Overdue (required)" value={overdue.length} href="/admin/homework?flag=overdue" />
        <StatCard label="Waiting > 48 h for review" value={slow.length} href="/admin/homework?flag=slow" />
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="teacher" defaultValue={sp.teacher ?? ""} className="input w-auto" aria-label="Teacher">
          <option value="">All teachers</option>
          {(teachers ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <select name="student" defaultValue={sp.student ?? ""} className="input w-auto" aria-label="Student">
          <option value="">All students</option>
          {(students ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input w-auto" aria-label="Status">
          <option value="">Any status</option>
          <option value="assigned">To do</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="needs_revision">Needs revision</option>
          <option value="completed">Completed</option>
        </select>
        <button className="btn-secondary" type="submit">
          Filter
        </button>
        {sp.flag && (
          <Link href="/admin/homework" className="btn-secondary">
            Clear flag
          </Link>
        )}
      </form>
      <HomeworkTable rows={rows} viewer="admin" tz={profile.timezone} waitingSince={waiting} empty="No homework matches." />
    </>
  );
}

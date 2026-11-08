import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { getProgressDue, getProgressSummaries } from "@/lib/progress";
import { ProgressTable } from "@/components/progress/ProgressTable";
import { PageHeader, Pager, paginate } from "@/components/ui";

export const metadata = { title: "Student progress" };

// Admin overview of progress reporting (PRG-02, GOAL-03): who is due a report, and each student's
// latest level and IELTS band.
export default async function AdminProgressPage({ searchParams }: { searchParams: Promise<{ page?: string; due?: string }> }) {
  const { supabase } = await requireRole("admin");
  const { page, due: onlyDue } = await searchParams;
  const [{ data: students }, { data: links }, due] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url, student_profile:student_profiles(course:courses(name))").eq("role", "student").neq("status", "inactive").order("full_name"),
    supabase.from("teacher_students").select("student_id, teacher:profiles!teacher_students_teacher_id_fkey(full_name)").eq("active", true),
    getProgressDue(supabase),
  ]);
  const list = (students ?? []) as unknown as { id: string; full_name: string; avatar_url: string | null; student_profile: { course: { name: string } | null } | null }[];
  const dueMap = new Map(due.map((d) => [d.student_id, d.since]));
  const teachers = new Map<string, string[]>();
  for (const l of (links ?? []) as unknown as { student_id: string; teacher: { full_name: string } | null }[]) {
    teachers.set(l.student_id, [...(teachers.get(l.student_id) ?? []), l.teacher?.full_name ?? ""]);
  }
  const filtered = onlyDue ? list.filter((s) => dueMap.has(s.id)) : list;
  const p = paginate(filtered, page);
  const summaries = await getProgressSummaries(supabase, p.rows.map((s) => s.id));
  const rows = p.rows.map((s) => {
    const sum = summaries.get(s.id);
    return {
      student: s,
      course: s.student_profile?.course?.name,
      teacher: teachers.get(s.id)?.join(", ") || null,
      report: sum?.report,
      ielts: sum?.ielts,
      dueSince: dueMap.get(s.id),
    };
  });

  return (
    <>
      <PageHeader
        title="Student progress"
        description={`${due.length} student${due.length === 1 ? " is" : "s are"} due a progress report.`}
        action={
          <Link href={onlyDue ? "/admin/progress" : "/admin/progress?due=1"} className="btn-secondary">
            {onlyDue ? "Show all students" : "Show only due"}
          </Link>
        }
      />
      <ProgressTable rows={rows} base="/admin/progress" showTeacher />
      <Pager {...p} base="/admin/progress" params={{ due: onlyDue }} />
    </>
  );
}

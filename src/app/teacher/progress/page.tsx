import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { getProgressDue, getProgressSummaries } from "@/lib/progress";
import { ProgressTable } from "@/components/progress/ProgressTable";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Student Progress" };

export default async function TeacherProgressPage() {
  const { supabase, profile } = await requireRole("teacher");
  const students = await getMyStudents(supabase, profile.id);
  const ids = students.map((s) => s.student.id);
  const [summaries, due] = await Promise.all([getProgressSummaries(supabase, ids), getProgressDue(supabase)]);
  const dueMap = new Map(due.map((d) => [d.student_id, d.since]));
  const rows = students
    .map(({ student }) => ({
      student,
      course: student.student_profile?.course?.name,
      ...summaries.get(student.id),
      dueSince: dueMap.get(student.id),
    }))
    .sort((a, b) => Number(!!b.dueSince) - Number(!!a.dueSince) || a.student.full_name.localeCompare(b.student.full_name));

  return (
    <>
      <PageHeader
        title="Student progress"
        description={due.length ? `${due.length} student${due.length > 1 ? "s are" : " is"} due a progress report.` : "Progress reports and IELTS results for your students."}
      />
      <ProgressTable rows={rows} base="/teacher/progress" />
      <p className="mt-3 text-xs text-muted">A report is due when a student has had classes for more than a month since their last report.</p>
    </>
  );
}

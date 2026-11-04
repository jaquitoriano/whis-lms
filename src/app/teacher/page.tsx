import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { Avatar, ComingSoon, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Teacher dashboard" };

export default async function TeacherDashboard() {
  const { supabase, profile } = await requireRole("teacher");
  const students = await getMyStudents(supabase, profile.id);
  const firstName = profile.full_name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description="Here's your teaching overview." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assigned students" value={students.length} href="/teacher/students" />
        <StatCard label="Today's classes" value="—" />
        <StatCard label="Homework to review" value="—" />
        <StatCard label="Progress updates due" value="—" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">My students</h2>
            <Link href="/teacher/students" className="text-sm text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {students.length === 0 ? (
            <p className="text-sm text-muted">No students are assigned to you yet. The school office will assign them.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {students.slice(0, 6).map(({ student }) => (
                <li key={student.id}>
                  <Link href={`/teacher/students/${student.id}`} className="flex items-center gap-3 py-2 hover:text-brand-700">
                    <Avatar profile={student} size={32} />
                    <span className="flex-1">{student.full_name}</span>
                    <span className="text-xs text-muted">{student.student_profile?.course?.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="space-y-3">
          <ComingSoon phase={2}>Today&apos;s and upcoming classes will appear here.</ComingSoon>
          <ComingSoon phase={3}>Homework waiting for your review will appear here.</ComingSoon>
          <ComingSoon phase={4}>School announcements will appear here.</ComingSoon>
        </div>
      </div>
    </>
  );
}

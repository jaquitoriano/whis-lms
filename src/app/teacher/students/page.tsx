import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { Avatar, EmptyState, PageHeader, StatusBadge, formatDate } from "@/components/ui";

export const metadata = { title: "My Students" };

export default async function MyStudentsPage() {
  const { supabase, profile } = await requireRole("teacher");
  const students = await getMyStudents(supabase, profile.id);

  return (
    <>
      <PageHeader title="My students" description={`${students.length} assigned`} />
      {students.length === 0 ? (
        <EmptyState>No students are assigned to you yet.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map(({ student, assigned_at }) => (
            <Link key={student.id} href={`/teacher/students/${student.id}`} className="card flex items-start gap-3 transition hover:ring-2 hover:ring-brand-100">
              <Avatar profile={student} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{student.full_name}</p>
                <p className="text-sm text-muted">
                  {student.student_profile?.course?.name ?? "No course"}
                  {student.student_profile?.class_level && ` · ${student.student_profile.class_level}`}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <StatusBadge status={student.status} />
                  <span>since {formatDate(assigned_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

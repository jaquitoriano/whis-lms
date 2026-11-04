import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Avatar, ComingSoon, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import type { Contact, Course, Guardian, Profile, StudentProfile } from "@/lib/types";

export const metadata = { title: "Student" };

export default async function TeacherStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireRole("teacher");
  const { id } = await params;

  // RLS returns nothing unless this student is currently assigned to the teacher,
  // so an unassigned student's URL simply shows "not found".
  const { data: student } = await supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle<Profile>();
  if (!student) notFound();

  const [{ data: sp }, { data: contact }, { data: guardians }] = await Promise.all([
    supabase.from("student_profiles").select("*, course:courses(name, default_duration_min)").eq("user_id", id).maybeSingle(),
    supabase.from("profile_contacts").select("*").eq("user_id", id).maybeSingle<Contact>(),
    supabase.from("guardians").select("*").eq("student_id", id),
  ]);
  const s = sp as (StudentProfile & { course: Pick<Course, "name" | "default_duration_min"> | null }) | null;

  return (
    <>
      <Link href="/teacher/students" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← My students
      </Link>
      <div className="mb-6 flex items-center gap-4">
        <Avatar profile={student} size={64} />
        <div>
          <PageHeader title={student.full_name} />
          <div className="-mt-5 flex items-center gap-2 text-sm text-muted">
            <StatusBadge status={student.status} />
            <span>Local time zone: {student.timezone}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Enrollment</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Course</dt>
              <dd>{s?.course?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Level</dt>
              <dd>{s?.class_level || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Enrolled</dt>
              <dd>{formatDate(s?.enrollment_date)}</dd>
            </div>
            <div>
              <dt className="text-muted">Class length</dt>
              <dd>{s?.course ? `${s.course.default_duration_min} min` : "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Contact</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted">Email</dt>
              <dd>{contact?.email}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>{contact?.phone || "—"}</dd>
            </div>
            {((guardians ?? []) as Guardian[]).map((g) => (
              <div key={g.id}>
                <dt className="text-muted">Guardian{g.relationship && ` (${g.relationship})`}</dt>
                <dd>
                  {g.full_name}
                  <span className="block text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <ComingSoon phase={2}>This student&apos;s class history and lesson records will appear here.</ComingSoon>
        <ComingSoon phase={3}>Homework and submissions will appear here.</ComingSoon>
      </div>
    </>
  );
}

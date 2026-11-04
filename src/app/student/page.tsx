import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMyEnrollment, getMyTeachers } from "@/lib/student-data";
import { Avatar, ComingSoon, PageHeader } from "@/components/ui";

export const metadata = { title: "Student dashboard" };

export default async function StudentDashboard() {
  const { supabase, profile } = await requireRole("student");
  const [teachers, enrollment] = await Promise.all([getMyTeachers(supabase, profile.id), getMyEnrollment(supabase, profile.id)]);
  const teacher = teachers[0];

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name.split(" ")[0]}`} description={enrollment?.course ? `${enrollment.course.name}${enrollment.class_level ? ` · Level ${enrollment.class_level}` : ""}` : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card">
          <h2 className="mb-3 font-semibold">My teacher</h2>
          {teacher ? (
            <Link href="/student/teacher" className="flex items-center gap-3 hover:text-brand-700">
              <Avatar profile={teacher} size={48} />
              <span>
                <span className="block font-medium">{teacher.full_name}</span>
                <span className="text-sm text-muted">{teacher.teacher_profile?.specializations.join(" · ")}</span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted">Your teacher will be assigned soon. The school office will let you know.</p>
          )}
        </section>
        <div className="space-y-3">
          <ComingSoon phase={2}>Your next class, meeting link and lesson materials will appear here.</ComingSoon>
          <ComingSoon phase={3}>Upcoming homework and your teacher&apos;s latest feedback will appear here.</ComingSoon>
          <ComingSoon phase={4}>School announcements will appear here.</ComingSoon>
        </div>
      </div>
    </>
  );
}

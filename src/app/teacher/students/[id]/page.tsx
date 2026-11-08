import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Avatar, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { LessonList } from "@/components/class/LessonList";
import { SessionList } from "@/components/class/SessionList";
import { getLessonHistory } from "@/lib/lesson-history";
import { getSessions } from "@/lib/sessions";
import { listHomework } from "@/lib/homework";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { SubmitButton } from "@/components/SubmitButton";
import { openConversation } from "@/lib/message-actions";
import { getProgressSummaries } from "@/lib/progress";
import { cefrLabel, fmtBand, formatPlainDate } from "@/lib/progress-shared";
import type { Contact, Course, Guardian, Profile, StudentProfile } from "@/lib/types";

export const metadata = { title: "Student" };

export default async function TeacherStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { id } = await params;

  // RLS returns nothing unless this student is currently assigned to the teacher,
  // so an unassigned student's URL simply shows "not found".
  const { data: student } = await supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle<Profile>();
  if (!student) notFound();

  const [{ data: sp }, { data: contact }, { data: guardians }, history, upcoming, { data: classesLeft }] = await Promise.all([
    supabase.from("student_profiles").select("*, course:courses(name, default_duration_min)").eq("user_id", id).maybeSingle(),
    supabase.from("profile_contacts").select("*").eq("user_id", id).maybeSingle<Contact>(),
    supabase.from("guardians").select("*").eq("student_id", id),
    getLessonHistory(supabase, { studentId: id, limit: 50 }),
    getSessions(supabase, { from: new Date(), to: new Date(Date.now() + 60 * 86400000), studentId: id }),
    // Teachers see only how many classes are left in the student's package, never prices.
    supabase.rpc("classes_left", { p_student: id }),
  ]);
  const [homework, summaries] = await Promise.all([listHomework(supabase, { studentId: id }), getProgressSummaries(supabase, [id])]);
  const progress = summaries.get(id);
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
        <form action={openConversation} className="ml-auto">
          <input type="hidden" name="with" value={id} />
          <SubmitButton className="btn-secondary" pendingText="Opening…">
            Message
          </SubmitButton>
        </form>
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
              <dt className="text-muted">Classes left in package</dt>
              <dd className={typeof classesLeft === "number" && classesLeft <= 2 ? "font-semibold text-amber-700" : ""}>{classesLeft ?? "No package"}</dd>
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
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Progress</h2>
            <Link href={`/teacher/progress/${id}`} className="text-sm text-brand-700 hover:underline">
              Reports and IELTS
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Level (last report)</dt>
              <dd className="font-medium">{progress?.report ? `${cefrLabel(progress.report.overall)} · ${formatPlainDate(progress.report.period_end)}` : "No report yet"}</dd>
            </div>
            <div>
              <dt className="text-muted">Latest IELTS band</dt>
              <dd className="font-medium">{progress?.ielts ? fmtBand(progress.ielts.overall) : "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Upcoming classes</h2>
          <SessionList sessions={upcoming.filter((u) => u.status === "scheduled").slice(0, 6)} viewer="teacher" tz={profile.timezone} empty="Nothing scheduled." />
        </section>
      </div>
      <div className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Homework</h2>
        <Link href={`/teacher/homework/new?student=${id}`} className="btn-secondary">
          Assign homework
        </Link>
      </div>
      <HomeworkTable rows={[...homework].reverse()} viewer="teacher" tz={profile.timezone} empty="No homework yet." />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Lesson history</h2>
      <p className="mb-3 text-sm text-muted">Includes classes with previous teachers, so you can review before the next lesson.</p>
      <LessonList rows={history} viewer="teacher" tz={profile.timezone} empty="No past classes yet." />
    </>
  );
}

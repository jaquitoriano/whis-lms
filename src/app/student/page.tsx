import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { getMyEnrollment, getMyTeachers } from "@/lib/student-data";
import { getSessions } from "@/lib/sessions";
import { getLessonHistory } from "@/lib/lesson-history";
import { formatDateTime, minutesBetween, tzLabel } from "@/lib/time";
import { SessionList } from "@/components/class/SessionList";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { listHomework } from "@/lib/homework";
import { AnnouncementsPanel } from "@/components/portal/Announcements";
import { Avatar, PageHeader } from "@/components/ui";

export const metadata = { title: "Student dashboard" };

export default async function StudentDashboard({ searchParams }: { searchParams: Promise<{ policies?: string }> }) {
  const { policies } = await searchParams;
  const { supabase, profile } = await requireRole("student");
  const tz = profile.timezone;
  const now = new Date();
  const [teachers, enrollment, upcoming, history, openHomework, { data: toSign }, { data: openInvoices }] = await Promise.all([
    getMyTeachers(supabase, profile.id),
    getMyEnrollment(supabase, profile.id),
    getSessions(supabase, { from: new Date(now.getTime() - 60 * 60000), to: new Date(now.getTime() + 60 * 86400000), studentId: profile.id }),
    getLessonHistory(supabase, { studentId: profile.id, limit: 10 }),
    listHomework(supabase, { studentId: profile.id, statuses: ["assigned", "needs_revision"] }),
    supabase.from("contracts").select("id, title, signer_kind, signer_name").eq("status", "sent").limit(1),
    supabase.from("invoices").select("id, due_date").in("status", ["unpaid", "partially_paid"]),
  ]);
  const contractToSign = (toSign ?? []).find((c) => c.signer_kind === "self");
  const overdueCount = (openInvoices ?? []).filter((i) => i.due_date < now.toISOString().slice(0, 10)).length;
  const teacher = teachers[0];
  const scheduled = upcoming.filter((s) => s.status === "scheduled" && Date.parse(s.ends_at) > now.getTime());
  const next = scheduled[0];
  const lastFeedback = history.find((h) => h.lesson?.feedback_overall);

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name.split(" ")[0]}`}
        description={enrollment?.course ? `${enrollment.course.name}${enrollment.class_level ? ` · Level ${enrollment.class_level}` : ""}` : undefined}
      />
      {contractToSign && (
        <Link href="/student/contract" className="mb-4 block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
          <strong>Please sign your enrollment agreement.</strong> {contractToSign.title} is ready for you to read and sign →
        </Link>
      )}
      {overdueCount > 0 && (
        <Link href="/student/billing" className="mb-4 block rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 hover:bg-red-100">
          You have {overdueCount} overdue invoice{overdueCount > 1 ? "s" : ""}. See Classes and payments →
        </Link>
      )}
      {policies === "accepted" && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Thank you. You have accepted the class policies.</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card border-brand-100">
          <h2 className="mb-2 font-semibold">Next class</h2>
          {next ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xl font-semibold">{formatDateTime(next.starts_at, tz)}</p>
                <p className="text-sm text-muted">
                  {minutesBetween(next.starts_at, next.ends_at)} min · {next.course?.name} with {next.teacher?.full_name} · {tzLabel(tz)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/student/classes/${next.id}`} className="btn-secondary">
                  Materials
                </Link>
                {next.meeting_url && (
                  <a href={next.meeting_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                    Join class
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No upcoming classes. The school office will schedule your next class.</p>
          )}
        </section>

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
            <p className="text-sm text-muted">Your teacher will be assigned soon.</p>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Coming up</h2>
          <SessionList sessions={scheduled.slice(1, 6)} viewer="student" tz={tz} empty="Nothing else scheduled yet." />
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Latest feedback</h2>
          {lastFeedback ? (
            <div className="text-sm">
              <p className="text-muted">{formatDateTime(lastFeedback.starts_at, tz)}</p>
              <p className="mt-1">{lastFeedback.lesson!.feedback_overall}</p>
              <Link href={`/student/classes/${lastFeedback.id}`} className="mt-2 inline-block text-brand-700 hover:underline">
                Read full notes →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted">Feedback from your teacher will appear here after each class.</p>
          )}
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">Homework to do</h2>
          <HomeworkTable rows={openHomework.slice(0, 6)} viewer="student" tz={tz} empty="No homework right now." />
        </section>
        <AnnouncementsPanel supabase={supabase} role="student" tz={tz} />
      </div>
    </>
  );
}

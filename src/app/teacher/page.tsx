import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { getMyStudents } from "@/lib/teacher-data";
import { getSessions } from "@/lib/sessions";
import { getLessonHistory } from "@/lib/lesson-history";
import { addDays, todayStr, zonedToUtc } from "@/lib/time";
import { SessionList } from "@/components/class/SessionList";
import { HomeworkTable } from "@/components/homework/HomeworkTable";
import { listHomework } from "@/lib/homework";
import { AnnouncementsPanel } from "@/components/portal/Announcements";
import { Avatar, PageHeader, StatCard } from "@/components/ui";

export const metadata = { title: "Teacher dashboard" };

export default async function TeacherDashboard() {
  const { supabase, profile } = await requireRole("teacher");
  const tz = profile.timezone;
  const today = todayStr(tz);
  const [students, todays, upcoming, history, toReview] = await Promise.all([
    getMyStudents(supabase, profile.id),
    getSessions(supabase, { from: zonedToUtc(today, "00:00", tz), to: zonedToUtc(addDays(today, 1), "00:00", tz), teacherId: profile.id }),
    getSessions(supabase, { from: zonedToUtc(addDays(today, 1), "00:00", tz), to: zonedToUtc(addDays(today, 8), "00:00", tz), teacherId: profile.id }),
    getLessonHistory(supabase, { teacherId: profile.id, limit: 50 }),
    listHomework(supabase, { teacherId: profile.id, statuses: ["submitted", "under_review"] }),
  ]);
  const todayActive = todays.filter((s) => s.status !== "cancelled" && s.status !== "rescheduled");
  const upcomingActive = upcoming.filter((s) => s.status === "scheduled");
  const needsNotes = history.filter(
    (r) => (r.status === "completed" && !(r.lesson?.feedback_overall || r.lesson?.today_topics)) || (r.status === "scheduled" && Date.parse(r.ends_at) < Date.now()),
  );

  return (
    <>
      <PageHeader
        title={`Hello, ${profile.full_name.split(" ")[0]}`}
        description="Here's your teaching overview."
        action={
          <Link href="/teacher/calendar/new" className="btn-primary">
            Schedule a class
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Today's classes" value={todayActive.length} href={`/teacher/calendar?view=day&date=${today}`} />
        <StatCard label="Next 7 days" value={upcomingActive.length} href="/teacher/calendar" />
        <StatCard label="Assigned students" value={students.length} href="/teacher/students" />
        <StatCard label="Classes needing notes" value={needsNotes.length} href="/teacher/lessons" />
        <StatCard label="Homework to review" value={toReview.length} href="/teacher/homework" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Today</h2>
          <SessionList sessions={todays} viewer="teacher" tz={tz} empty="No classes today." />
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Upcoming</h2>
          <SessionList sessions={upcomingActive.slice(0, 8)} viewer="teacher" tz={tz} empty="Nothing scheduled in the next 7 days." />
        </section>
        {needsNotes.length > 0 && (
          <section className="card border-amber-200">
            <h2 className="mb-2 font-semibold">Needs your attention</h2>
            <p className="mb-2 text-sm text-muted">Past classes that are still open or have no lesson notes.</p>
            <SessionList sessions={needsNotes.slice(0, 6)} viewer="teacher" tz={tz} empty="" />
          </section>
        )}
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">My students</h2>
            <Link href="/teacher/students" className="text-sm text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {students.length === 0 ? (
            <p className="text-sm text-muted">No students are assigned to you yet.</p>
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
        <section className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">Homework to review</h2>
          <HomeworkTable rows={toReview.slice(0, 6)} viewer="teacher" tz={tz} empty="Nothing waiting for review." />
        </section>
        <AnnouncementsPanel supabase={supabase} role="teacher" tz={tz} />
      </div>
    </>
  );
}

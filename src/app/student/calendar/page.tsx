import { requireRole } from "@/lib/auth";
import { Calendar, calendarRange, parseCalendarParams } from "@/components/Calendar";
import { PageHeader } from "@/components/ui";
import { getSessions } from "@/lib/sessions";

export const metadata = { title: "My Calendar" };

export default async function StudentCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { view, date } = parseCalendarParams(await searchParams, profile.timezone);
  const { from, to } = calendarRange(view, date, profile.timezone);
  const [sessions, { data: due }] = await Promise.all([
    getSessions(supabase, { from, to, studentId: profile.id }),
    // STU-05: homework deadlines on the calendar.
    supabase
      .from("homework_assignments")
      .select("id, title, due_at, status")
      .eq("student_id", profile.id)
      .gte("due_at", from.toISOString())
      .lt("due_at", to.toISOString()),
  ]);
  const deadlines = (due ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    due_at: d.due_at,
    href: `/student/homework/${d.id}`,
    done: d.status !== "assigned" && d.status !== "needs_revision",
  }));

  return (
    <>
      <PageHeader title="My calendar" description="To reschedule or cancel a class, contact your teacher or the school office." />
      <Calendar sessions={sessions} view={view} date={date} tz={profile.timezone} viewer="student" basePath="/student/calendar" deadlines={deadlines} />
    </>
  );
}

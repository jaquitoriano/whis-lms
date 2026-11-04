import { requireRole } from "@/lib/auth";
import { Calendar, calendarRange, parseCalendarParams } from "@/components/Calendar";
import { PageHeader } from "@/components/ui";
import { getSessions } from "@/lib/sessions";

export const metadata = { title: "My Calendar" };

export default async function StudentCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const { view, date } = parseCalendarParams(await searchParams, profile.timezone);
  const { from, to } = calendarRange(view, date, profile.timezone);
  const sessions = await getSessions(supabase, { from, to, studentId: profile.id });

  return (
    <>
      <PageHeader title="My calendar" description="To reschedule or cancel a class, contact your teacher or the school office." />
      <Calendar sessions={sessions} view={view} date={date} tz={profile.timezone} viewer="student" basePath="/student/calendar" />
    </>
  );
}

import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { Calendar, calendarRange, parseCalendarParams, type Availability, type Blackout } from "@/components/Calendar";
import { PageHeader } from "@/components/ui";
import { getSessions } from "@/lib/sessions";

export const metadata = { title: "My Calendar" };

export default async function TeacherCalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const { supabase, profile } = await requireRole("teacher");
  const { view, date } = parseCalendarParams(await searchParams, profile.timezone);
  const { from, to } = calendarRange(view, date, profile.timezone);

  const [sessions, { data: av }, { data: bl }] = await Promise.all([
    getSessions(supabase, { from, to, teacherId: profile.id }),
    supabase.from("teacher_availability").select("weekday, start_time, end_time").eq("teacher_id", profile.id),
    supabase.from("teacher_blackouts").select("id, starts_at, ends_at, reason").eq("teacher_id", profile.id).gt("ends_at", from.toISOString()).lt("starts_at", to.toISOString()),
  ]);

  return (
    <>
      <PageHeader
        title="My calendar"
        action={
          <div className="flex gap-2">
            <Link href="/teacher/availability" className="btn-secondary">
              Available hours
            </Link>
            <Link href={`/teacher/calendar/new?date=${date}`} className="btn-primary">
              Schedule a class
            </Link>
          </div>
        }
      />
      <Calendar
        sessions={sessions}
        view={view}
        date={date}
        tz={profile.timezone}
        viewer="teacher"
        basePath="/teacher/calendar"
        availability={(av ?? []) as Availability[]}
        blackouts={(bl ?? []) as Blackout[]}
        newHref={(d) => `/teacher/calendar/new?date=${d}`}
      />
    </>
  );
}

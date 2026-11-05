import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { Calendar, calendarRange, parseCalendarParams } from "@/components/Calendar";
import { PageHeader } from "@/components/ui";
import { getSessions } from "@/lib/sessions";

export const metadata = { title: "Class schedules" };

export default async function AdminSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; teacher?: string; student?: string }>;
}) {
  const { supabase, profile } = await requireRole("admin");
  const sp = await searchParams;
  const { view, date } = parseCalendarParams(sp, profile.timezone);
  const { from, to } = calendarRange(view, date, profile.timezone);

  const [sessions, { data: teachers }, { data: students }] = await Promise.all([
    getSessions(supabase, { from, to, teacherId: sp.teacher || undefined, studentId: sp.student || undefined }),
    supabase.from("profiles").select("id, full_name").eq("role", "teacher").order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
  ]);
  const counts = sessions.reduce<Record<string, number>>((acc, s) => ((acc[s.status] = (acc[s.status] ?? 0) + 1), acc), {});

  return (
    <>
      <PageHeader
        title="Class schedules"
        description={`${sessions.length} classes in view · ${counts.completed ?? 0} completed · ${counts.cancelled ?? 0} cancelled · ${(counts.student_absent ?? 0) + (counts.teacher_absent ?? 0)} absences`}
        action={
          <Link href={`/admin/schedules/new?date=${date}`} className="btn-primary">
            Schedule a class
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={date} />
        <select name="teacher" defaultValue={sp.teacher ?? ""} className="input w-auto" aria-label="Teacher">
          <option value="">All teachers</option>
          {(teachers ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <select name="student" defaultValue={sp.student ?? ""} className="input w-auto" aria-label="Student">
          <option value="">All students</option>
          {(students ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <button className="btn-secondary" type="submit">
          Filter
        </button>
      </form>
      <Calendar
        sessions={sessions}
        view={view}
        date={date}
        tz={profile.timezone}
        viewer="admin"
        basePath="/admin/schedules"
        query={{ teacher: sp.teacher, student: sp.student }}
        newHref={(d) => `/admin/schedules/new?date=${d}`}
      />
    </>
  );
}

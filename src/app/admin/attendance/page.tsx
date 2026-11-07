import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader, Pager, paginate } from "@/components/ui";
import { getBillingSettings, monthRange } from "@/lib/billing";
import { attendanceLabel, attendanceStyle, isMonthKey, monthLabel, nextMonthKey, type AttendanceMark } from "@/lib/billing-shared";
import { statusLabel, type SessionStatus } from "@/lib/sessions";
import { formatDateTime, todayStr, tzLabel } from "@/lib/time";

export const metadata = { title: "Attendance" };

type Row = {
  id: string;
  starts_at: string;
  status: SessionStatus;
  counts_as_used: boolean;
  late_cancel: boolean;
  student_id: string;
  student: { full_name: string } | null;
  teacher: { full_name: string } | null;
  attendance: { mark: AttendanceMark; minutes_late: number | null } | null;
};

// ATT-01..02: every closed class with its attendance mark, by month.
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string; teacher?: string; student?: string; page?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getBillingSettings(supabase);
  const month = isMonthKey(sp.month) ? sp.month : todayStr(settings.school_timezone).slice(0, 7);
  const { from, to } = monthRange(month, settings.school_timezone);
  const tz = profile.timezone;

  let q = supabase
    .from("class_sessions")
    .select(
      "id, starts_at, status, counts_as_used, late_cancel, student_id, student:profiles!class_sessions_student_id_fkey(full_name), teacher:profiles!class_sessions_teacher_id_fkey(full_name), attendance(mark, minutes_late)",
    )
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at", { ascending: false });
  if (sp.teacher) q = q.eq("teacher_id", sp.teacher);
  if (sp.student) q = q.eq("student_id", sp.student);
  const [{ data }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "student"]).order("full_name")]);
  const rows = (data ?? []) as unknown as Row[];
  const closed = rows.filter((r) => r.status !== "scheduled");
  const unclosed = rows.filter((r) => r.status === "scheduled" && Date.parse(r.starts_at) < new Date().getTime());

  // Per-student summary for the month.
  const summary = new Map<string, { name: string; present: number; late: number; absent: number; cancelled: number; lateCancel: number; used: number }>();
  for (const r of closed) {
    const s = summary.get(r.student_id) ?? { name: r.student?.full_name ?? "", present: 0, late: 0, absent: 0, cancelled: 0, lateCancel: 0, used: 0 };
    const m = r.attendance?.mark;
    if (m === "present") s.present++;
    if (m === "late") s.late++;
    if (m === "absent") s.absent++;
    if (m === "cancelled") s.cancelled++;
    if (r.late_cancel) s.lateCancel++;
    if (r.counts_as_used) s.used++;
    summary.set(r.student_id, s);
  }
  const page = paginate(closed, sp.page);
  const params = { month, teacher: sp.teacher, student: sp.student };
  const qs = (m: string) => `/admin/attendance?${new URLSearchParams(Object.entries({ ...params, month: m }).filter((e): e is [string, string] => !!e[1]))}`;

  return (
    <>
      <PageHeader title="Attendance" description={`Marked by the teacher when each class is closed. Times in ${tzLabel(tz)}.`} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link className="btn-secondary px-3" href={qs(nextMonthKey(month, -1))} aria-label="Previous month">
            ←
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Link className="btn-secondary px-3" href={qs(nextMonthKey(month, 1))} aria-label="Next month">
            →
          </Link>
        </div>
        <form className="flex flex-wrap items-end gap-3" action="/admin/attendance">
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="label" htmlFor="teacher">Teacher</label>
            <select className="input" id="teacher" name="teacher" defaultValue={sp.teacher ?? ""}>
              <option value="">All</option>
              {(people ?? []).filter((p) => p.role === "teacher").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="student">Student</label>
            <select className="input" id="student" name="student" defaultValue={sp.student ?? ""}>
              <option value="">All</option>
              {(people ?? []).filter((p) => p.role === "student").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>

      {unclosed.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unclosed.length} past class{unclosed.length === 1 ? " is" : "es are"} still marked scheduled, so {unclosed.length === 1 ? "it has" : "they have"} no attendance yet.
        </p>
      )}

      {summary.size > 0 && (
        <section className="card mb-6 overflow-x-auto">
          <h2 className="mb-3 font-semibold">Summary</h2>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="py-1.5 font-medium">Student</th>
                <th className="py-1.5 text-right font-medium">Present</th>
                <th className="py-1.5 text-right font-medium">Late</th>
                <th className="py-1.5 text-right font-medium">Absent</th>
                <th className="py-1.5 text-right font-medium">Cancelled (late)</th>
                <th className="py-1.5 text-right font-medium">Classes used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...summary.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, s]) => (
                <tr key={id}>
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.present}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.late}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.absent}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.cancelled} ({s.lateCancel})
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{s.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {closed.length === 0 ? (
        <EmptyState>No closed classes in {monthLabel(month)}.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Class</th>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Teacher</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/classes/${r.id}`} className="text-brand-700 hover:underline">
                      {formatDateTime(r.starts_at, tz)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.student?.full_name}</td>
                  <td className="px-4 py-2">{r.teacher?.full_name}</td>
                  <td className="px-4 py-2">
                    {statusLabel[r.status]}
                    {r.late_cancel && <span className="text-muted"> (late, used)</span>}
                  </td>
                  <td className="px-4 py-2">
                    {r.attendance ? (
                      <span className={`badge ${attendanceStyle[r.attendance.mark]}`}>
                        {attendanceLabel[r.attendance.mark]}
                        {r.attendance.minutes_late ? ` ${r.attendance.minutes_late} min` : ""}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...page} base="/admin/attendance" params={params} />
    </>
  );
}

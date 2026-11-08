import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { getBillingSettings } from "@/lib/billing";
import { money } from "@/lib/billing-shared";
import { attendanceRate, getAttention, getMonthly, getTeacherReport, MONTH_CHOICES, parseMonths } from "@/lib/reports";
import { formatDateTime } from "@/lib/time";
import { ColumnChart } from "@/components/reports/ColumnChart";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Reports" };

const monthLabel = (m: string, long = false) =>
  new Date(`${m}T00:00:00Z`).toLocaleDateString("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });

// Chart axis: just "Nov" (the year is in the table and the header), so 12 months fit on a phone.
const axisLabel = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Csv({ name, months }: { name: string; months: number }) {
  return (
    <a href={`/api/reports/${name}?months=${months}`} className="text-sm text-brand-700 hover:underline" download>
      Download CSV
    </a>
  );
}

const th = "px-3 py-3 font-medium";
const thn = "px-3 py-3 text-right font-medium";
const td = "px-3 py-2";
const tdn = "px-3 py-2 text-right tabular-nums";

// Admin reports: the school's month-by-month numbers, teacher workload and students who need a
// look (GOAL-03: monitor without collecting figures by hand).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const months = parseMonths((await searchParams).months);
  const [monthly, settings, attention] = await Promise.all([getMonthly(supabase, months), getBillingSettings(supabase), getAttention(supabase)]);
  const from = monthly.at(-1)!.month;
  const teachers = await getTeacherReport(supabase, from);
  const cur = settings.currency;
  const [thisMonth, lastMonth] = monthly;
  const rate = attendanceRate(thisMonth);
  const ascending = [...monthly].reverse();
  const tz = profile.timezone;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`From ${monthLabel(from, true)} to today. Months follow the school time zone (${settings.school_timezone}).`}
        action={
          <nav className="flex gap-1" aria-label="Period">
            {MONTH_CHOICES.map((m) => (
              <Link
                key={m}
                href={`/admin/reports?months=${m}`}
                aria-current={m === months ? "page" : undefined}
                className={m === months ? "btn-primary px-3 py-1.5" : "btn-secondary px-3 py-1.5"}
              >
                {`${m} months`}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Classes completed this month" value={thisMonth.completed} sub={lastMonth ? `${lastMonth.completed} last month` : undefined} />
        <Tile label="Attendance this month" value={rate === null ? "—" : `${rate}%`} sub={`${thisMonth.student_absent} no-show${thisMonth.student_absent === 1 ? "" : "s"}`} />
        <Tile label="Hours taught this month" value={thisMonth.hours_taught} sub={lastMonth ? `${lastMonth.hours_taught} last month` : undefined} />
        <Tile label="Payments this month" value={money(thisMonth.collected, cur)} sub={lastMonth ? `${money(lastMonth.collected, cur)} last month` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold">Classes completed</h2>
          <p className="mb-4 text-sm text-muted">Per month</p>
          <ColumnChart label="Classes completed per month" data={ascending.map((r) => ({ key: r.month, label: axisLabel(r.month), value: r.completed, detail: `${r.hours_taught} h` }))} />
        </section>
        <section className="card">
          <h2 className="font-semibold">Payments received</h2>
          <p className="mb-4 text-sm text-muted">Per month, in {cur}</p>
          <ColumnChart
            label={`Payments received per month in ${cur}`}
            format={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v)))}
            data={ascending.map((r) => ({ key: r.month, label: axisLabel(r.month), value: r.collected, detail: money(r.collected, cur) }))}
          />
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Month by month</h2>
          <Csv name="monthly" months={months} />
        </div>
        <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className={th}>Month</th>
                <th className={thn}>Completed</th>
                <th className={thn}>Hours</th>
                <th className={thn}>No-shows</th>
                <th className={thn}>Attendance</th>
                <th className={thn} title="Cancelled at the student's request (late ones use up a class)">Student cancels (late)</th>
                <th className={thn} title="Cancelled by the teacher or school, and teacher absences">Teacher/school cancels</th>
                <th className={thn}>Moved</th>
                <th className={thn}>Homework set</th>
                <th className={thn}>Handed in (late)</th>
                <th className={thn}>Invoiced</th>
                <th className={thn}>Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthly.map((r) => {
                const a = attendanceRate(r);
                return (
                  <tr key={r.month}>
                    <td className={`${td} whitespace-nowrap font-medium`}>{monthLabel(r.month, true)}</td>
                    <td className={tdn}>{r.completed}</td>
                    <td className={tdn}>{r.hours_taught}</td>
                    <td className={tdn}>{r.student_absent}</td>
                    <td className={tdn}>{a === null ? "—" : `${a}%`}</td>
                    <td className={tdn}>
                      {r.cancelled_by_student} ({r.late_cancels})
                    </td>
                    <td className={tdn}>{r.cancelled_other + r.teacher_absent}</td>
                    <td className={tdn}>{r.rescheduled}</td>
                    <td className={tdn}>{r.homework_set}</td>
                    <td className={tdn}>
                      {r.homework_handed_in} ({r.homework_late})
                    </td>
                    <td className={`${tdn} whitespace-nowrap`}>{money(r.invoiced, cur)}</td>
                    <td className={`${tdn} whitespace-nowrap`}>{money(r.collected, cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Classes are counted in the month they were scheduled for; homework when it was set; invoices by issue date; payments by payment date.</p>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Teachers</h2>
          <Csv name="teachers" months={months} />
        </div>
        {teachers.length === 0 ? (
          <EmptyState>No teachers yet.</EmptyState>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className={th}>Teacher</th>
                  <th className={thn}>Students</th>
                  <th className={thn}>Classes</th>
                  <th className={thn}>Hours</th>
                  <th className={thn} title="Completed classes with no lesson notes">Missing notes</th>
                  <th className={thn} title="Cancelled by the teacher or school, plus teacher absences">Cancels / absences</th>
                  <th className={thn}>Homework set</th>
                  <th className={thn}>Reviews</th>
                  <th className={thn} title="From hand-in to feedback sent">Avg review time</th>
                  <th className={thn}>Progress reports</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teachers.map((t) => (
                  <tr key={t.teacher_id}>
                    <td className={`${td} whitespace-nowrap font-medium`}>
                      <Link href={`/admin/users/${t.teacher_id}?role=teacher`} className="hover:text-brand-700">
                        {t.full_name}
                      </Link>
                    </td>
                    <td className={tdn}>{t.active_students}</td>
                    <td className={tdn}>{t.completed}</td>
                    <td className={tdn}>{t.hours_taught}</td>
                    <td className={`${tdn} ${t.classes_without_notes ? "font-semibold text-amber-700" : ""}`}>{t.classes_without_notes}</td>
                    <td className={tdn}>
                      {t.cancelled} / {t.teacher_absent}
                    </td>
                    <td className={tdn}>{t.homework_set}</td>
                    <td className={tdn}>{t.reviews_sent}</td>
                    <td className={`${tdn} ${t.avg_review_hours !== null && t.avg_review_hours > 48 ? "font-semibold text-amber-700" : ""}`}>
                      {t.avg_review_hours === null ? "—" : `${t.avg_review_hours} h`}
                    </td>
                    <td className={tdn}>{t.progress_reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">For the same period as above. Amber marks completed classes without lesson notes, and reviews taking more than 48 hours on average.</p>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Students who need a look</h2>
            <p className="text-sm text-muted">Nothing booked in the next 14 days, 2 or fewer classes left, an overdue invoice, 2+ overdue homework, or a progress report due.</p>
          </div>
          <Csv name="attention" months={months} />
        </div>
        {attention.length === 0 ? (
          <EmptyState>Every active student is on track.</EmptyState>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className={th}>Student</th>
                  <th className={th}>Teacher</th>
                  <th className={th}>Next class</th>
                  <th className={thn}>Classes left</th>
                  <th className={thn}>Overdue</th>
                  <th className={thn}>Overdue homework</th>
                  <th className={th}>Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attention.map((s) => {
                  const noNext = s.nothing_booked;
                  return (
                    <tr key={s.student_id}>
                      <td className={`${td} font-medium`}>
                        <Link href={`/admin/users/${s.student_id}?role=student`} className="hover:text-brand-700">
                          {s.full_name}
                        </Link>
                      </td>
                      <td className={td}>{s.teachers ?? <span className="text-amber-700">None</span>}</td>
                      <td className={`${td} whitespace-nowrap ${noNext ? "font-semibold text-amber-700" : ""}`}>
                        {s.next_class ? formatDateTime(s.next_class, tz) : "Nothing booked"}
                      </td>
                      <td className={`${tdn} ${s.classes_left === null || s.classes_left <= 2 ? "font-semibold text-amber-700" : ""}`}>
                        {s.classes_left ?? "No package"}
                      </td>
                      <td className={`${tdn} whitespace-nowrap ${s.overdue_amount > 0 ? "font-semibold text-red-700" : ""}`}>
                        {s.overdue_amount > 0 ? money(s.overdue_amount, cur) : "—"}
                      </td>
                      <td className={`${tdn} ${s.overdue_homework >= 2 ? "font-semibold text-amber-700" : ""}`}>{s.overdue_homework}</td>
                      <td className={td}>{s.report_due ? <span className="badge bg-amber-50 text-amber-700">Due</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

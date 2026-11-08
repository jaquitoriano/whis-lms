import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getBillingSettings } from "@/lib/billing";
import { attendanceRate, getAttention, getMonthly, getTeacherReport, parseMonths, toCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

// GET /api/reports/{monthly|teachers|attention}.csv?months=3|6|12  (admins only; the database
// functions refuse everyone else too)
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const { supabase, profile } = session;
  if (profile.role !== "admin" || profile.status === "inactive") return new NextResponse("Not found", { status: 404 });
  const { name } = await params;
  const months = parseMonths(req.nextUrl.searchParams.get("months") ?? undefined);
  const { currency } = await getBillingSettings(supabase);
  let csv: string;

  if (name === "monthly") {
    const rows = await getMonthly(supabase, months);
    csv = toCsv(
      ["Month", "Classes completed", "Hours taught", "Student no-shows", "Attendance %", "Cancelled by student", "Late cancellations", "Cancelled by teacher or school", "Teacher absences", "Moved", "Classes used from packages", "Homework set", "Homework handed in", "Handed in late", `Invoiced (${currency})`, `Received (${currency})`],
      rows.map((r) => [r.month.slice(0, 7), r.completed, r.hours_taught, r.student_absent, attendanceRate(r), r.cancelled_by_student, r.late_cancels, r.cancelled_other, r.teacher_absent, r.rescheduled, r.classes_used, r.homework_set, r.homework_handed_in, r.homework_late, r.invoiced.toFixed(2), r.collected.toFixed(2)]),
    );
  } else if (name === "teachers") {
    const from = (await getMonthly(supabase, months)).at(-1)!.month;
    const rows = await getTeacherReport(supabase, from);
    csv = toCsv(
      ["Teacher", "Account", "Active students", "Classes completed", "Hours taught", "Completed classes without notes", "Cancelled by teacher or school", "Teacher absences", "Homework set", "Reviews sent", "Average review time (hours)", "Progress reports published"],
      rows.map((t) => [t.full_name, t.status, t.active_students, t.completed, t.hours_taught, t.classes_without_notes, t.cancelled, t.teacher_absent, t.homework_set, t.reviews_sent, t.avg_review_hours, t.progress_reports]),
    );
  } else if (name === "attention") {
    const rows = await getAttention(supabase);
    csv = toCsv(
      ["Student", "Teachers", "Last class (UTC)", "Next class (UTC)", "Nothing booked in 14 days", "Classes left", `Overdue (${currency})`, "Overdue homework", "Progress report due"],
      rows.map((s) => [s.full_name, s.teachers, s.last_class, s.next_class, s.nothing_booked ? "yes" : "no", s.classes_left, s.overdue_amount.toFixed(2), s.overdue_homework, s.report_due ? "yes" : "no"]),
    );
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-report-${months}-months.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

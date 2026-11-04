import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader, StatCard, formatDate } from "@/components/ui";
import { addDays, todayStr, zonedToUtc } from "@/lib/time";

export const metadata = { title: "Admin dashboard" };

const actionLabel: Record<string, string> = {
  "profile.privileged_update": "Role or status changed",
  "assignment.insert": "Student assigned to teacher",
  "assignment.update": "Assignment changed",
  "assignment.delete": "Assignment removed",
  "session.status": "Class status changed",
};

export default async function AdminDashboard() {
  const { supabase, profile } = await requireRole("admin");
  const today = todayStr(profile.timezone);

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [teachers, students, onHold, newInquiries, assignments, audit] = await Promise.all([
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("status", "active")),
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("status", "active")),
    count(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "on_hold")),
    count(supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new")),
    supabase.from("teacher_students").select("student_id").eq("active", true),
    supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(8),
  ]);
  const [classesToday, openPast] = await Promise.all([
    count(
      supabase
        .from("class_sessions")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", zonedToUtc(today, "00:00", profile.timezone).toISOString())
        .lt("starts_at", zonedToUtc(addDays(today, 1), "00:00", profile.timezone).toISOString())
        .not("status", "in", "(cancelled,rescheduled)"),
    ),
    count(supabase.from("class_sessions").select("id", { count: "exact", head: true }).eq("status", "scheduled").lt("ends_at", new Date(Date.now() - 86400000).toISOString())),
  ]);

  const { data: activeStudents } = await supabase.from("profiles").select("id").eq("role", "student").eq("status", "active");
  const assigned = new Set((assignments.data ?? []).map((a) => a.student_id));
  const unassigned = (activeStudents ?? []).filter((s) => !assigned.has(s.id)).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="School overview"
        action={
          <Link href="/admin/users/new" className="btn-primary">
            Add user
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Classes today" value={classesToday} href={`/admin/schedules?view=day&date=${today}`} />
        <StatCard label="Past classes not closed" value={openPast} href="/admin/lessons" />
        <StatCard label="Active teachers" value={teachers} href="/admin/users?role=teacher" />
        <StatCard label="Active students" value={students} href="/admin/users?role=student" />
        <StatCard label="Students without a teacher" value={unassigned} href="/admin/users?role=student&filter=unassigned" />
        <StatCard label="Accounts on hold" value={onHold} href="/admin/users?status=on_hold" />
        <StatCard label="New inquiries" value={newInquiries} href="/admin/inquiries" />
      </div>

      <section className="card mt-6">
        <h2 className="font-semibold">Recent changes</h2>
        {(audit.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted">No changes recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {audit.data!.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 py-2">
                <span>{actionLabel[a.action] ?? a.action}</span>
                <span className="shrink-0 text-muted">{formatDate(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

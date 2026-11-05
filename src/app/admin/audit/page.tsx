import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader, Pager, paginate } from "@/components/ui";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Audit log" };

const label: Record<string, string> = {
  "profile.privileged_update": "Role or account status changed",
  "assignment.insert": "Student assigned to teacher",
  "assignment.update": "Teacher assignment changed",
  "assignment.delete": "Teacher assignment removed",
  "session.status": "Class status changed",
  "homework.status": "Homework status changed",
  "policy.publish": "Class policies published",
};
const groups = [
  { key: "", label: "All" },
  { key: "profile", label: "Accounts" },
  { key: "assignment", label: "Assignments" },
  { key: "session", label: "Classes" },
  { key: "homework", label: "Homework" },
  { key: "policy", label: "Policies" },
];

function entityLink(entity: string, id: string) {
  if (entity === "profiles") return `/admin/users/${id}`;
  if (entity === "class_sessions") return `/admin/classes/${id}`;
  if (entity === "homework_assignments") return `/admin/homework/${id}`;
  if (entity === "policies") return "/admin/policies";
  if (entity === "teacher_students") return `/admin/users/${id.split(":")[1]}`;
  return null;
}

function change(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!after) return "removed";
  if (!before) return Object.entries(after).filter(([k]) => ["status", "role", "active", "title"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(", ");
  return Object.keys(after)
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && !["assigned_at", "ended_at", "updated_at"].includes(k))
    .map((k) => `${k}: ${before[k] ?? "—"} → ${after[k] ?? "—"}`)
    .join(", ");
}

// NFR-27: who changed what, and when.
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ group?: string; page?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const { group = "", page } = await searchParams;
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(300);
  if (groups.some((g) => g.key === group) && group) q = q.like("action", `${group}.%`);
  const { data } = await q;
  const list = paginate(data ?? [], page);
  const rows = list.rows;
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const name = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <>
      <PageHeader title="Audit log" description="Important changes, newest first (last 300)." />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter">
        {groups.map((g) => (
          <Link key={g.key} href={g.key ? `/admin/audit?group=${g.key}` : "/admin/audit"} className={g.key === group ? "btn-primary" : "btn-secondary"}>
            {g.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState>Nothing recorded yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const href = entityLink(r.entity, r.entity_id);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDateTime(r.at, profile.timezone, { year: "numeric" })}</td>
                    <td className="px-4 py-2">{r.actor_id ? (name.get(r.actor_id) ?? "Unknown user") : "System"}</td>
                    <td className="px-4 py-2">{href ? <Link href={href} className="text-brand-700 hover:underline">{label[r.action] ?? r.action}</Link> : (label[r.action] ?? r.action)}</td>
                    <td className="px-4 py-2 text-muted">{change(r.before, r.after)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...list} base="/admin/audit" params={{ group }} />
    </>
  );
}

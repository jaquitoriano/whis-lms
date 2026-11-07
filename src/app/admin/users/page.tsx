import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { Avatar, EmptyState, PageHeader, Pager, StatusBadge, formatDate, paginate } from "@/components/ui";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Users" };

const titles = { teacher: "Teachers", student: "Students", admin: "Administrators" } as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; q?: string; filter?: string; page?: string }>;
}) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const role = sp.role === "teacher" || sp.role === "admin" || sp.role === "student" ? sp.role : undefined;

  let query = supabase.from("profiles").select("*, contact:profile_contacts(email)").order("full_name");
  if (role) query = query.eq("role", role);
  if (sp.status === "active" || sp.status === "inactive" || sp.status === "on_hold") query = query.eq("status", sp.status);
  if (sp.q) query = query.ilike("full_name", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  let users = (data ?? []) as (Profile & { contact: { email: string } | null })[];

  const { data: links } = await supabase.from("teacher_students").select("teacher_id, student_id").eq("active", true);
  const studentsPerTeacher = new Map<string, number>();
  const teacherOfStudent = new Set<string>();
  for (const l of links ?? []) {
    studentsPerTeacher.set(l.teacher_id, (studentsPerTeacher.get(l.teacher_id) ?? 0) + 1);
    teacherOfStudent.add(l.student_id);
  }
  if (sp.filter === "unassigned") users = users.filter((u) => u.role === "student" && !teacherOfStudent.has(u.id));
  const list = paginate(users, sp.page);

  return (
    <>
      <PageHeader
        title={role ? titles[role] : "All users"}
        description={sp.filter === "unassigned" ? "Students without an assigned teacher" : undefined}
        action={
          <Link href={`/admin/users/new${role ? `?role=${role}` : ""}`} className="btn-primary">
            Add {role ?? "user"}
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        {role && <input type="hidden" name="role" value={role} />}
        <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search by name" />
        <select className="input w-auto" name="status" defaultValue={sp.status ?? ""}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="btn-secondary" type="submit">
          Filter
        </button>
      </form>

      {list.total === 0 ? (
        <EmptyState>No users match.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                {!role && <th className="px-4 py-3 font-medium">Role</th>}
                {role !== "admin" && <th className="px-4 py-3 font-medium">{role === "student" ? "Teacher" : "Students"}</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}${role ? `?role=${role}` : ""}`} className="flex items-center gap-3 font-medium hover:text-brand-700">
                      <Avatar profile={u} size={28} />
                      {u.full_name || "(no name)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{u.contact?.email}</td>
                  {!role && <td className="px-4 py-3 capitalize">{u.role}</td>}
                  {role !== "admin" && (
                    <td className="px-4 py-3">
                      {u.role === "teacher"
                        ? studentsPerTeacher.get(u.id) ?? 0
                        : u.role === "student"
                          ? teacherOfStudent.has(u.id)
                            ? "Assigned"
                            : <span className="text-amber-700">None</span>
                          : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...list} base="/admin/users" params={{ role: sp.role, status: sp.status, q: sp.q, filter: sp.filter }} />
    </>
  );
}

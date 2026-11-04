import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Avatar, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  addGuardian,
  assignTeacher,
  endAssignment,
  removeGuardian,
  setPassword,
  updateAccount,
  updateStudentDetails,
  updateTeacherDetails,
} from "../actions";
import type { Contact, Course, Guardian, Profile, StudentProfile, TeacherProfile } from "@/lib/types";

export const metadata = { title: "User details" };

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; role?: string }>;
}) {
  const { supabase } = await requireRole("admin");
  const { id } = await params;
  const { created } = await searchParams;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle<Profile>();
  if (!profile) notFound();
  const { data: contact } = await supabase.from("profile_contacts").select("*").eq("user_id", id).maybeSingle<Contact>();

  return (
    <>
      <Link href={`/admin/users?role=${profile.role}`} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Back to {profile.role}s
      </Link>
      <PageHeader
        title={profile.full_name || "(no name)"}
        description={`${profile.role[0].toUpperCase() + profile.role.slice(1)} · added ${formatDate(profile.created_at)}`}
        action={<StatusBadge status={profile.status} />}
      />
      {created && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Account created. Remember to share the temporary password with them securely.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-4 flex items-center gap-3">
            <Avatar profile={profile} size={48} />
            <h2 className="font-semibold">Account</h2>
          </div>
          <ActionForm action={updateAccount.bind(null, id)}>
            <div>
              <label className="label" htmlFor="full_name">Full name</label>
              <input className="input" id="full_name" name="full_name" defaultValue={profile.full_name} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">Email (login)</label>
                <input className="input" id="email" name="email" type="email" defaultValue={contact?.email} required />
              </div>
              <div>
                <label className="label" htmlFor="phone">Contact number</label>
                <input className="input" id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="status">Account status</label>
                <select className="input" id="status" name="status" defaultValue={profile.status}>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="inactive">Inactive (cannot log in)</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="timezone">Time zone</label>
                <input className="input" id="timezone" name="timezone" defaultValue={profile.timezone} placeholder="Asia/Manila" required />
              </div>
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Reset password</h2>
          <ActionForm action={setPassword.bind(null, id)} submitLabel="Set new password" resetOnSuccess>
            <div>
              <label className="label" htmlFor="password">New temporary password</label>
              <input className="input font-mono" id="password" name="password" minLength={10} required autoComplete="off" />
              <p className="mt-1 text-xs text-muted">The user can also reset it themselves from the login page.</p>
            </div>
          </ActionForm>
        </section>

        {profile.role === "teacher" && <TeacherSection id={id} />}
        {profile.role === "student" && <StudentSection id={id} />}
      </div>
    </>
  );
}

async function TeacherSection({ id }: { id: string }) {
  const { supabase } = await requireRole("admin");
  const [{ data: t }, { data: notes }, { data: links }] = await Promise.all([
    supabase.from("teacher_profiles").select("*").eq("user_id", id).maybeSingle<TeacherProfile>(),
    supabase.from("teacher_admin_notes").select("notes").eq("user_id", id).maybeSingle(),
    supabase
      .from("teacher_students")
      .select("student_id, assigned_at, student:profiles!teacher_students_student_id_fkey(id, full_name, avatar_url, status)")
      .eq("teacher_id", id)
      .eq("active", true),
  ]);
  type Link = { student_id: string; assigned_at: string; student: Pick<Profile, "id" | "full_name" | "avatar_url" | "status"> };

  return (
    <>
      <section className="card">
        <h2 className="mb-4 font-semibold">Teacher profile</h2>
        <ActionForm action={updateTeacherDetails.bind(null, id)}>
          <div>
            <label className="label" htmlFor="bio">Short biography</label>
            <textarea className="input min-h-24" id="bio" name="bio" defaultValue={t?.bio} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="education">Education</label>
              <input className="input" id="education" name="education" defaultValue={t?.education} />
            </div>
            <div>
              <label className="label" htmlFor="qualifications">Qualifications</label>
              <input className="input" id="qualifications" name="qualifications" defaultValue={t?.qualifications} />
            </div>
            <div>
              <label className="label" htmlFor="experience_years">Years of experience</label>
              <input className="input" id="experience_years" name="experience_years" type="number" min={0} max={60} defaultValue={t?.experience_years ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="specializations">Specializations</label>
              <input className="input" id="specializations" name="specializations" defaultValue={t?.specializations.join(", ")} placeholder="IELTS, Business English" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="admin_notes">Admin-only notes</label>
            <textarea className="input min-h-16" id="admin_notes" name="admin_notes" defaultValue={notes?.notes ?? ""} placeholder="Never shown to the teacher or students" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="show_on_website" defaultChecked={t?.show_on_website} /> Show on the public Teachers page
          </label>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Assigned students</h2>
        {((links ?? []) as unknown as Link[]).length ? (
          <ul className="divide-y divide-border text-sm">
            {(links as unknown as Link[]).map((l) => (
              <li key={l.student_id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/users/${l.student_id}?role=student`} className="flex items-center gap-2 hover:text-brand-700">
                  <Avatar profile={l.student} size={28} />
                  {l.student.full_name}
                </Link>
                <span className="text-xs text-muted">since {formatDate(l.assigned_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No students assigned. Assign a teacher from a student&apos;s page.</p>
        )}
      </section>
    </>
  );
}

async function StudentSection({ id }: { id: string }) {
  const { supabase } = await requireRole("admin");
  const [{ data: s }, { data: courses }, { data: teachers }, { data: links }, { data: guardians }] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("user_id", id).maybeSingle<StudentProfile>(),
    supabase.from("courses").select("*").order("sort_order"),
    supabase.from("profiles").select("id, full_name").eq("role", "teacher").eq("status", "active").order("full_name"),
    supabase
      .from("teacher_students")
      .select("teacher_id, assigned_at, teacher:profiles!teacher_students_teacher_id_fkey(id, full_name, avatar_url)")
      .eq("student_id", id)
      .eq("active", true),
    supabase.from("guardians").select("*").eq("student_id", id).order("created_at"),
  ]);
  type Link = { teacher_id: string; assigned_at: string; teacher: Pick<Profile, "id" | "full_name" | "avatar_url"> };
  const current = (links ?? []) as unknown as Link[];
  const available = (teachers ?? []).filter((t) => !current.some((c) => c.teacher_id === t.id));

  return (
    <>
      <section className="card">
        <h2 className="mb-4 font-semibold">Enrollment</h2>
        <ActionForm action={updateStudentDetails.bind(null, id)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="course_id">Course / program</label>
              <select className="input" id="course_id" name="course_id" defaultValue={s?.course_id ?? ""}>
                <option value="">Not set</option>
                {((courses ?? []) as Course[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="class_level">Class level</label>
              <input className="input" id="class_level" name="class_level" defaultValue={s?.class_level} placeholder="e.g. B1, IELTS 6.0" />
            </div>
            <div>
              <label className="label" htmlFor="enrollment_date">Enrollment date</label>
              <input className="input" id="enrollment_date" name="enrollment_date" type="date" defaultValue={s?.enrollment_date} />
            </div>
            <div>
              <label className="label" htmlFor="birthday">Birthday (optional)</label>
              <input className="input" id="birthday" name="birthday" type="date" defaultValue={s?.birthday ?? ""} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_minor" defaultChecked={s?.is_minor} /> Student is a minor (guardian details required)
          </label>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Assigned teacher</h2>
        {current.length > 0 ? (
          <ul className="mb-4 divide-y divide-border text-sm">
            {current.map((l) => (
              <li key={l.teacher_id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/users/${l.teacher_id}?role=teacher`} className="flex items-center gap-2 hover:text-brand-700">
                  <Avatar profile={l.teacher} size={28} />
                  {l.teacher.full_name}
                </Link>
                <form action={endAssignment.bind(null, l.teacher_id, id)}>
                  <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="Removing…">
                    Unassign
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-amber-700">No teacher assigned yet.</p>
        )}
        {available.length > 0 && (
          <ActionForm action={assignTeacher.bind(null, id)} submitLabel="Assign" className="flex flex-wrap items-start gap-2">
            <select className="input w-auto min-w-48" name="teacher_id" aria-label="Teacher" required defaultValue="">
              <option value="" disabled>
                Choose a teacher
              </option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </ActionForm>
        )}
        <p className="mt-3 text-xs text-muted">A teacher can see a student&apos;s profile only while assigned. Unassigning removes their access immediately.</p>
      </section>

      <section className="card lg:col-span-2">
        <h2 className="mb-4 font-semibold">Parent / guardian {s?.is_minor && <span className="badge ml-1 bg-amber-50 text-amber-700">Minor</span>}</h2>
        {((guardians ?? []) as Guardian[]).length > 0 && (
          <ul className="mb-4 divide-y divide-border text-sm">
            {(guardians as Guardian[]).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{g.full_name}</span>
                  {g.relationship && <span className="text-muted"> · {g.relationship}</span>}
                  <span className="block text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <form action={removeGuardian.bind(null, g.id, id)}>
                  <SubmitButton className="btn-danger px-2 py-1 text-xs" pendingText="Removing…">
                    Remove
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addGuardian.bind(null, id)} submitLabel="Add guardian" resetOnSuccess className="grid gap-3 sm:grid-cols-4">
          <input className="input" name="full_name" placeholder="Full name" aria-label="Guardian full name" required />
          <input className="input" name="relationship" placeholder="Relationship" aria-label="Relationship" />
          <input className="input" name="email" type="email" placeholder="Email" aria-label="Guardian email" />
          <input className="input" name="phone" placeholder="Phone" aria-label="Guardian phone" />
        </ActionForm>
      </section>
    </>
  );
}

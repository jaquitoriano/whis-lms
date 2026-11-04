import { requireRole } from "@/lib/auth";
import { getMyEnrollment } from "@/lib/student-data";
import { MyAccountForms } from "@/components/MyAccountForms";
import { PageHeader, StatusBadge, formatDate } from "@/components/ui";
import type { Contact, Guardian } from "@/lib/types";

export const metadata = { title: "My Profile" };

export default async function StudentProfilePage() {
  const { supabase, profile } = await requireRole("student");
  const [enrollment, { data: contact }, { data: guardians }] = await Promise.all([
    getMyEnrollment(supabase, profile.id),
    supabase.from("profile_contacts").select("*").eq("user_id", profile.id).maybeSingle<Contact>(),
    supabase.from("guardians").select("*").eq("student_id", profile.id),
  ]);

  return (
    <>
      <PageHeader title="My profile" description="To change your name, course or guardian details, contact the school office." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Enrollment</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Name</dt>
              <dd>{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-muted">Account</dt>
              <dd>
                <StatusBadge status={profile.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Course</dt>
              <dd>{enrollment?.course?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Level</dt>
              <dd>{enrollment?.class_level || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Enrolled</dt>
              <dd>{formatDate(enrollment?.enrollment_date)}</dd>
            </div>
            <div>
              <dt className="text-muted">Birthday</dt>
              <dd>{formatDate(enrollment?.birthday)}</dd>
            </div>
          </dl>
          {((guardians ?? []) as Guardian[]).length > 0 && (
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="mb-2 font-medium">Parent / guardian</p>
              {(guardians as Guardian[]).map((g) => (
                <p key={g.id}>
                  {g.full_name}
                  {g.relationship && <span className="text-muted"> · {g.relationship}</span>}
                </p>
              ))}
            </div>
          )}
        </section>
        <MyAccountForms profile={profile} contact={contact} />
      </div>
    </>
  );
}

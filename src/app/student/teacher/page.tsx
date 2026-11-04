import { requireRole } from "@/lib/auth";
import { getMyTeachers } from "@/lib/student-data";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My Teacher" };

export default async function MyTeacherPage() {
  const { supabase, profile } = await requireRole("student");
  const teachers = await getMyTeachers(supabase, profile.id);

  return (
    <>
      <PageHeader title={teachers.length > 1 ? "My teachers" : "My teacher"} />
      {teachers.length === 0 ? (
        <EmptyState>Your teacher will be assigned soon.</EmptyState>
      ) : (
        <div className="space-y-4">
          {teachers.map((t) => (
            <section key={t.id} className="card max-w-2xl">
              <div className="flex items-center gap-4">
                <Avatar profile={t} size={72} />
                <div>
                  <h2 className="text-lg font-semibold">{t.full_name}</h2>
                  <p className="text-sm text-muted">{t.teacher_profile?.specializations.join(" · ")}</p>
                </div>
              </div>
              {t.teacher_profile?.bio && <p className="mt-4 text-sm">{t.teacher_profile.bio}</p>}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {t.teacher_profile?.qualifications && (
                  <div>
                    <dt className="text-muted">Qualifications</dt>
                    <dd>{t.teacher_profile.qualifications}</dd>
                  </div>
                )}
                {t.teacher_profile?.experience_years != null && (
                  <div>
                    <dt className="text-muted">Experience</dt>
                    <dd>{t.teacher_profile.experience_years} years</dd>
                  </div>
                )}
                {t.contact ? (
                  <>
                    <div>
                      <dt className="text-muted">Email</dt>
                      <dd>{t.contact.email}</dd>
                    </div>
                    {t.contact.phone && (
                      <div>
                        <dt className="text-muted">Phone</dt>
                        <dd>{t.contact.phone}</dd>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Contact</dt>
                    <dd>Please contact your teacher through the school office. In-site messaging arrives in a later update.</dd>
                  </div>
                )}
              </dl>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

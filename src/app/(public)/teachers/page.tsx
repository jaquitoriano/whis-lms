import { getPublicTeachers } from "@/lib/public-data";
import { Avatar, EmptyState } from "@/components/ui";

export const metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const teachers = await getPublicTeachers();
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Our teachers</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {teachers.length === 0 && <EmptyState>Teacher profiles will appear here soon.</EmptyState>}
        {teachers.map((t) => (
          <div key={t.user_id} className="card">
            <div className="flex items-center gap-4">
              <Avatar profile={t.profile} size={64} />
              <div>
                <h2 className="text-lg font-semibold">{t.profile.full_name}</h2>
                <p className="text-sm text-muted">{t.specializations.join(" · ")}</p>
              </div>
            </div>
            <p className="mt-4 text-sm">{t.bio}</p>
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {t.qualifications && (
                <div>
                  <dt className="text-xs text-muted">Qualifications</dt>
                  <dd>{t.qualifications}</dd>
                </div>
              )}
              {t.experience_years != null && (
                <div>
                  <dt className="text-xs text-muted">Experience</dt>
                  <dd>{t.experience_years} years</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

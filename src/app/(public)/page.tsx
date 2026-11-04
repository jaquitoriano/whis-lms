import Link from "next/link";
import { site, courseTypeLabel } from "@/config/site";
import { getActiveCourses, getPublicTeachers } from "@/lib/public-data";
import { Avatar } from "@/components/ui";

export default async function HomePage() {
  const [courses, teachers] = await Promise.all([getActiveCourses(), getPublicTeachers()]);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-medium text-brand-700">Online English · IELTS Preparation · Business English</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">{site.tagline}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Live one-to-one lessons, a record of every class, homework with detailed feedback, and progress you can see.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact#trial" className="btn-primary px-6 py-3 text-base">
              Book a free trial class
            </Link>
            <Link href="/classes" className="btn-secondary px-6 py-3 text-base">
              See our courses
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold">Courses</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <div key={c.id} className="card">
              <span className="badge bg-brand-50 text-brand-700">{courseTypeLabel[c.type]}</span>
              <h3 className="mt-3 text-lg font-semibold">{c.name}</h3>
              <p className="mt-2 text-sm text-muted">{c.description}</p>
              <p className="mt-3 text-xs text-muted">{c.default_duration_min}-minute classes</p>
            </div>
          ))}
        </div>
      </section>

      {teachers.length > 0 && (
        <section className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="flex items-end justify-between">
              <h2 className="text-2xl font-semibold">Meet our teachers</h2>
              <Link href="/teachers" className="text-sm text-brand-700 hover:underline">
                All teachers →
              </Link>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.slice(0, 3).map((t) => (
                <div key={t.user_id} className="card flex gap-4">
                  <Avatar profile={t.profile} size={56} />
                  <div>
                    <p className="font-semibold">{t.profile.full_name}</p>
                    <p className="text-xs text-muted">{t.specializations.join(" · ")}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-muted">{t.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold">What our students say</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {site.testimonials.map((t) => (
            <figure key={t.name} className="card">
              <blockquote className="text-sm">“{t.quote}”</blockquote>
              <figcaption className="mt-3 text-xs text-muted">— {t.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="faq" className="bg-background">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
          <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
            {site.faq.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-muted transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

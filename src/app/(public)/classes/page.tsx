import Link from "next/link";
import { courseTypeLabel } from "@/config/site";
import { getActiveCourses } from "@/lib/public-data";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Classes" };

export default async function ClassesPage() {
  const courses = await getActiveCourses();
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Classes and courses</h1>
      <p className="mt-2 text-muted">All classes are live, one-to-one online lessons.</p>
      <div className="mt-8 space-y-4">
        {courses.length === 0 && <EmptyState>Courses will be listed here soon.</EmptyState>}
        {courses.map((c) => (
          <div key={c.id} className="card sm:flex sm:items-start sm:justify-between sm:gap-6">
            <div>
              <span className="badge bg-brand-50 text-brand-700">{courseTypeLabel[c.type]}</span>
              <h2 className="mt-2 text-xl font-semibold">{c.name}</h2>
              <p className="mt-2 text-sm text-muted">{c.description}</p>
              <p className="mt-2 text-xs text-muted">{c.default_duration_min}-minute classes</p>
            </div>
            <Link href={`/contact?course=${c.type}#trial`} className="btn-secondary mt-4 shrink-0 sm:mt-0">
              Ask about this course
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { createCourse, updateCourse } from "./actions";
import type { Course } from "@/lib/types";

export const metadata = { title: "Courses" };

function CourseFields({ c }: { c?: Course }) {
  const p = c?.id ?? "new";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_0.6fr]">
        <div>
          <label className="label" htmlFor={`name-${p}`}>Name</label>
          <input className="input" id={`name-${p}`} name="name" defaultValue={c?.name} required />
        </div>
        <div>
          <label className="label" htmlFor={`type-${p}`}>Type</label>
          <select className="input" id={`type-${p}`} name="type" defaultValue={c?.type ?? "general_english"}>
            <option value="general_english">General English</option>
            <option value="ielts">IELTS</option>
            <option value="business_english">Business English</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`dur-${p}`}>Class length (min)</label>
          <input className="input" id={`dur-${p}`} name="default_duration_min" type="number" min={15} max={240} defaultValue={c?.default_duration_min ?? 50} required />
        </div>
        <div>
          <label className="label" htmlFor={`sort-${p}`}>Order</label>
          <input className="input" id={`sort-${p}`} name="sort_order" type="number" defaultValue={c?.sort_order ?? 0} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`desc-${p}`}>Description (shown on the website)</label>
        <textarea className="input min-h-16" id={`desc-${p}`} name="description" defaultValue={c?.description} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Active (offered and shown on the website)
      </label>
    </>
  );
}

export default async function CoursesPage() {
  const { supabase } = await requireRole("admin");
  const { data } = await supabase.from("courses").select("*").order("sort_order");
  const courses = (data ?? []) as Course[];
  return (
    <>
      <PageHeader title="Courses" description="Tuition rates and class packages are under Payments and billing → Class packages." />
      <div className="space-y-4">
        {courses.map((c) => (
          <details key={c.id} className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <span className="font-medium">
                {c.name} {!c.active && <span className="badge ml-1 bg-slate-100 text-slate-600">Inactive</span>}
              </span>
              <span className="text-sm text-brand-700 group-open:hidden">Edit</span>
            </summary>
            <div className="mt-4">
              <ActionForm action={updateCourse.bind(null, c.id)}>
                <CourseFields c={c} />
              </ActionForm>
            </div>
          </details>
        ))}
        <section className="card">
          <h2 className="mb-4 font-semibold">Add a course</h2>
          <ActionForm action={createCourse} submitLabel="Add course" resetOnSuccess>
            <CourseFields />
          </ActionForm>
        </section>
      </div>
    </>
  );
}

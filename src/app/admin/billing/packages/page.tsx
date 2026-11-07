import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { BillingNav } from "@/components/billing/BillingNav";
import { getBillingSettings, type ClassPackage } from "@/lib/billing";
import { money } from "@/lib/billing-shared";
import { savePackage } from "@/lib/billing-actions";

export const metadata = { title: "Class packages" };

function Fields({ p, courses, currency }: { p?: ClassPackage; courses: { id: string; name: string }[]; currency: string }) {
  const k = p?.id ?? "new";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`name-${k}`}>Name</label>
          <input className="input" id={`name-${k}`} name="name" defaultValue={p?.name} required placeholder="e.g. IELTS 20 classes" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`course-${k}`}>Course</label>
          <select className="input" id={`course-${k}`} name="course_id" defaultValue={p?.course_id ?? ""}>
            <option value="">Any course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`classes-${k}`}>Number of classes</label>
          <input className="input" id={`classes-${k}`} name="classes_count" type="number" min={1} max={500} defaultValue={p?.classes_count ?? 10} required />
        </div>
        <div>
          <label className="label" htmlFor={`min-${k}`}>Class length (min)</label>
          <input className="input" id={`min-${k}`} name="class_minutes" type="number" min={15} max={240} defaultValue={p?.class_minutes ?? 50} required />
        </div>
        <div>
          <label className="label" htmlFor={`price-${k}`}>Price</label>
          <div className="flex gap-2">
            <input className="input w-20 uppercase" name="currency" aria-label="Currency" defaultValue={p?.currency ?? currency} maxLength={3} required />
            <input className="input text-right" id={`price-${k}`} name="price" inputMode="decimal" defaultValue={p?.price ?? ""} required />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`valid-${k}`}>Valid for (days)</label>
          <input className="input" id={`valid-${k}`} name="validity_days" type="number" min={1} max={1500} defaultValue={p?.validity_days ?? ""} placeholder="No limit" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="label" htmlFor={`desc-${k}`}>Description</label>
          <input className="input" id={`desc-${k}`} name="description" defaultValue={p?.description} />
        </div>
        <div>
          <label className="label" htmlFor={`sort-${k}`}>Order</label>
          <input className="input" id={`sort-${k}`} name="sort_order" type="number" defaultValue={p?.sort_order ?? 0} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Offered (can be chosen for new students)
      </label>
    </>
  );
}

export default async function PackagesPage() {
  const { supabase } = await requireRole("admin");
  const [{ data }, { data: courses }, settings] = await Promise.all([
    supabase.from("class_packages").select("*").order("sort_order").order("name"),
    supabase.from("courses").select("id, name").order("sort_order"),
    getBillingSettings(supabase),
  ]);
  const packages = (data ?? []) as ClassPackage[];
  const courseName = (id: string | null) => (courses ?? []).find((c) => c.id === id)?.name ?? "Any course";
  return (
    <>
      <PageHeader
        title="Payments and billing"
        description="Class packages and tuition rates (ADM-21). A student's package keeps the price it was sold at, even if you change it here later."
      />
      <BillingNav active="/admin/billing/packages" />
      <div className="space-y-4">
        {packages.map((p) => (
          <details key={p.id} className="card group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{p.name}</span> {!p.active && <span className="badge ml-1 bg-slate-100 text-slate-600">Not offered</span>}
                <span className="block text-sm text-muted">
                  {courseName(p.course_id)} · {p.classes_count} × {p.class_minutes} min · {money(p.price, p.currency)}
                  {p.validity_days ? ` · ${p.validity_days} days` : ""}
                </span>
              </span>
              <span className="text-sm text-brand-700 group-open:hidden">Edit</span>
            </summary>
            <div className="mt-4">
              <ActionForm action={savePackage.bind(null, p.id)}>
                <Fields p={p} courses={courses ?? []} currency={settings.currency} />
              </ActionForm>
            </div>
          </details>
        ))}
        <section className="card">
          <h2 className="mb-4 font-semibold">Add a package</h2>
          <ActionForm action={savePackage.bind(null, null)} submitLabel="Add package" resetOnSuccess>
            <Fields courses={courses ?? []} currency={settings.currency} />
          </ActionForm>
        </section>
      </div>
    </>
  );
}

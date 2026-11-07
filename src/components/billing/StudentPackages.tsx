import Link from "@/components/Link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { getBillingSettings, getEnrollments, getStudentInvoices, type ClassPackage } from "@/lib/billing";
import { contractStatusLabel, formatDateOnly, money, type ContractStatus } from "@/lib/billing-shared";
import { createEnrollment, updateEnrollment } from "@/lib/billing-actions";
import { todayStr } from "@/lib/time";

// Admin view of one student's packages, balance and contract (on the student's account page).
export async function StudentPackages({ supabase, studentId }: { supabase: SupabaseClient; studentId: string }) {
  const [enrollments, billing, settings, { data: packages }, { data: contracts }] = await Promise.all([
    getEnrollments(supabase, studentId),
    getStudentInvoices(supabase, studentId),
    getBillingSettings(supabase),
    supabase.from("class_packages").select("*").eq("active", true).order("sort_order"),
    supabase.from("contracts").select("id, contract_number, status").eq("student_id", studentId).order("created_at", { ascending: false }).limit(3),
  ]);
  const today = todayStr(settings.school_timezone);

  return (
    <section className="card lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Packages, payments and contract</h2>
          <p className="text-sm text-muted">
            Balance due: <span className="font-medium text-foreground">{money(billing.outstanding, settings.currency)}</span>
            {contracts?.[0] && (
              <>
                {" "}
                · Contract{" "}
                <Link className="text-brand-700 hover:underline" href={`/admin/contracts/${contracts[0].id}`}>
                  {contracts[0].contract_number}
                </Link>{" "}
                ({contractStatusLabel[contracts[0].status as ContractStatus]})
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="btn-secondary" href={`/admin/billing?student=${studentId}&status=all`}>
            Invoices
          </Link>
          <Link className="btn-secondary" href={`/admin/billing/statements?student=${studentId}`}>
            Statement
          </Link>
          <Link className="btn-secondary" href={`/admin/contracts/new?student=${studentId}`}>
            New contract
          </Link>
        </div>
      </div>

      {enrollments.length === 0 ? (
        <p className="mb-4 text-sm text-muted">No packages yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {enrollments.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {e.package_name}
                  {e.status !== "active" && <span className="badge ml-2 bg-slate-100 text-slate-600">{e.status}</span>}
                </span>
                <span className="text-sm tabular-nums">
                  <span className={e.usage!.remaining <= 2 && e.status === "active" ? "font-semibold text-amber-700" : ""}>{e.usage!.remaining} left</span>
                  <span className="text-muted">
                    {" "}
                    · {e.usage!.used} of {e.classes_total} used · {e.usage!.booked} booked
                  </span>
                </span>
              </div>
              <p className="text-xs text-muted">
                {money(e.price, e.currency)} · {e.class_minutes} min · {formatDateOnly(e.starts_on)} – {e.ends_on ? formatDateOnly(e.ends_on) : "no end date"}
                {e.course?.name && ` · ${e.course.name}`}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-700">Change</summary>
                <ActionForm action={updateEnrollment.bind(null, e.id, studentId)} className="mt-2 grid gap-3 sm:grid-cols-4" submitLabel="Save">
                  <div>
                    <label className="label" htmlFor={`st-${e.id}`}>Status</label>
                    <select className="input" id={`st-${e.id}`} name="status" defaultValue={e.status}>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`ct-${e.id}`}>Classes</label>
                    <input className="input" id={`ct-${e.id}`} name="classes_total" type="number" min={1} defaultValue={e.classes_total} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`end-${e.id}`}>Ends on</label>
                    <input className="input" id={`end-${e.id}`} name="ends_on" type="date" defaultValue={e.ends_on ?? ""} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`nt-${e.id}`}>Notes</label>
                    <input className="input" id={`nt-${e.id}`} name="notes" defaultValue={e.notes} />
                  </div>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Add a package</summary>
        <ActionForm action={createEnrollment.bind(null, studentId)} className="mt-3 space-y-3" submitLabel="Add package" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="package_id">Package</label>
              <select className="input" id="package_id" name="package_id" defaultValue={(packages ?? [])[0]?.id ?? ""}>
                {((packages ?? []) as ClassPackage[]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.classes_count} classes · {money(p.price, p.currency)}
                  </option>
                ))}
                <option value="">Custom (fill in below)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="starts_on">Starts on</label>
              <input className="input" id="starts_on" name="starts_on" type="date" defaultValue={today} required />
            </div>
          </div>
          <p className="text-xs text-muted">Leave these empty to use the package&apos;s own values.</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <input className="input sm:col-span-2" name="package_name" placeholder="Name" aria-label="Package name" />
            <input className="input" name="classes_total" type="number" min={1} placeholder="Classes" aria-label="Number of classes" />
            <input className="input" name="price" inputMode="decimal" placeholder="Price" aria-label="Price" />
            <input className="input" name="classes_per_week" type="number" min={1} max={14} placeholder="Per week" aria-label="Classes per week" />
          </div>
          <input type="date" className="input sm:w-48" name="ends_on" aria-label="Ends on (default: package validity)" title="Ends on (default: package validity)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="create_invoice" defaultChecked /> Create and send the invoice for this package now
          </label>
        </ActionForm>
      </details>
    </section>
  );
}

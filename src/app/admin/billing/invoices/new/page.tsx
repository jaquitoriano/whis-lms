import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { createInvoice } from "@/lib/billing-actions";
import { getBillingSettings, getEnrollments } from "@/lib/billing";
import { money } from "@/lib/billing-shared";
import { addDays, todayStr } from "@/lib/time";

export const metadata = { title: "New invoice" };

const LINES = 6;

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ student?: string; enrollment?: string }> }) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getBillingSettings(supabase);
  const today = todayStr(settings.school_timezone);
  const { data: students } = await supabase.from("profiles").select("id, full_name").eq("role", "student").neq("status", "inactive").order("full_name");
  const student = (students ?? []).find((s) => s.id === sp.student);
  const enrollments = student ? await getEnrollments(supabase, student.id) : [];
  const enrollment = enrollments.find((e) => e.id === sp.enrollment);

  return (
    <>
      <Link href="/admin/billing" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Back to billing
      </Link>
      <PageHeader title="New invoice" description="The student is notified when the invoice is created. Totals and balances are worked out automatically." />

      <section className="card mb-6">
        <form action="/admin/billing/invoices/new" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="pick-student">Student</label>
            <select className="input" id="pick-student" name="student" defaultValue={student?.id ?? ""} required>
              <option value="" disabled>
                Choose a student
              </option>
              {(students ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          {student && enrollments.length > 0 && (
            <div>
              <label className="label" htmlFor="pick-enrollment">Fill in from a package</label>
              <select className="input" id="pick-enrollment" name="enrollment" defaultValue={enrollment?.id ?? ""}>
                <option value="">No package</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.package_name} · {money(e.price, e.currency)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn-secondary">{student ? "Update" : "Continue"}</button>
        </form>
      </section>

      {student && (
        <section className="card">
          <h2 className="mb-4 font-semibold">Invoice for {student.full_name}</h2>
          <ActionForm action={createInvoice} submitLabel="Create and send invoice" pendingText="Creating…">
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="enrollment_id" value={enrollment?.id ?? ""} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="issue_date">Invoice date</label>
                <input className="input" id="issue_date" name="issue_date" type="date" defaultValue={today} required />
              </div>
              <div>
                <label className="label" htmlFor="due_date">Due date</label>
                <input className="input" id="due_date" name="due_date" type="date" defaultValue={addDays(today, settings.invoice_due_days)} required />
              </div>
              <div>
                <span className="label">Currency</span>
                <p className="py-2 text-sm">{settings.currency}</p>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="label">Lines (use a minus price for a discount)</legend>
              <div className="hidden grid-cols-[1fr_6rem_9rem] gap-2 text-xs text-muted sm:grid">
                <span>Description</span>
                <span>Quantity</span>
                <span>Unit price</span>
              </div>
              {Array.from({ length: LINES }, (_, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_7rem] gap-2 sm:grid-cols-[1fr_6rem_9rem]">
                  <input
                    className="input"
                    name={`desc_${i}`}
                    aria-label={`Line ${i + 1} description`}
                    placeholder={i === 0 ? "e.g. IELTS 20 classes" : ""}
                    defaultValue={i === 0 && enrollment ? `${enrollment.package_name} (${enrollment.classes_total} classes, ${enrollment.class_minutes} min)` : ""}
                  />
                  <input className="input" name={`qty_${i}`} aria-label={`Line ${i + 1} quantity`} inputMode="decimal" defaultValue={i === 0 ? "1" : ""} />
                  <input
                    className="input text-right"
                    name={`price_${i}`}
                    aria-label={`Line ${i + 1} unit price`}
                    inputMode="decimal"
                    defaultValue={i === 0 && enrollment ? String(enrollment.price) : ""}
                  />
                </div>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="notes">Notes (printed on the invoice)</label>
              <textarea className="input min-h-16" id="notes" name="notes" maxLength={2000} placeholder="e.g. Bank details or GCash number for payment" />
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}

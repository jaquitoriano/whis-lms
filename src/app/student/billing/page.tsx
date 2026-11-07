import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { InvoiceBadge } from "@/components/billing/BillingNav";
import { StatementView } from "@/components/billing/StatementView";
import { balanceOf, buildStatement, getBillingSettings, getEnrollments, getStudentInvoices, isOverdue } from "@/lib/billing";
import { formatDateOnly, isMonthKey, methodLabel, money } from "@/lib/billing-shared";
import { todayStr } from "@/lib/time";

export const metadata = { title: "Classes and payments" };

// PAY-01..04 and package usage for the student: classes left, invoices, payments and receipts,
// and the monthly statement with attendance.
export default async function StudentBillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, profile } = await requireRole("student");
  const sp = await searchParams;
  const settings = await getBillingSettings(supabase);
  const today = todayStr(settings.school_timezone);
  const month = isMonthKey(sp.month) ? sp.month : today.slice(0, 7);
  const [enrollments, billing, statement] = await Promise.all([
    getEnrollments(supabase, profile.id),
    getStudentInvoices(supabase, profile.id),
    buildStatement(supabase, profile.id, month, settings.school_timezone, settings.currency),
  ]);
  const active = enrollments.filter((e) => e.status === "active");
  const open = billing.invoices.filter((i) => i.status === "unpaid" || i.status === "partially_paid");

  return (
    <>
      <PageHeader title="Classes and payments" description="Your class packages, invoices, payments and monthly statements." />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">My classes</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted">No active package. The school office will set one up.</p>
          ) : (
            <ul className="space-y-4">
              {active.map((e) => {
                const pct = Math.min(100, Math.round((e.usage!.used / e.classes_total) * 100));
                return (
                  <li key={e.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{e.package_name}</span>
                      <span className="text-2xl font-semibold tabular-nums">
                        {e.usage!.remaining} <span className="text-sm font-normal text-muted">classes left</span>
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={e.usage!.used} aria-valuemin={0} aria-valuemax={e.classes_total} aria-label="Classes used">
                      <div className="h-2 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {e.usage!.used} of {e.classes_total} used · {e.usage!.booked} booked · {e.ends_on ? `valid until ${formatDateOnly(e.ends_on)}` : "no end date"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">
            A class uses up one of your classes when it takes place, when you miss it, or when you cancel less than {settings.late_cancel_hours} hours before it starts.
          </p>
        </section>

        <section className={`card ${billing.outstanding > 0 ? "border-amber-200" : ""}`}>
          <h2 className="mb-1 font-semibold">Balance due</h2>
          <p className="text-3xl font-semibold tabular-nums">{money(billing.outstanding, settings.currency)}</p>
          {open.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {open.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {i.invoice_number} · due {formatDateOnly(i.due_date)} <InvoiceBadge status={i.status} overdue={isOverdue(i, today)} />
                  </span>
                  <span className="tabular-nums">{money(balanceOf(i), i.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing to pay right now. Thank you.</p>
          )}
          <p className="mt-4 text-xs text-muted">To pay, follow the instructions on your invoice or contact the school office. Payments appear here once the office records them.</p>
        </section>
      </div>

      <section className="card mb-6">
        <h2 className="mb-3 font-semibold">Invoices and receipts</h2>
        {billing.invoices.length === 0 ? (
          <EmptyState>No invoices yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th className="py-2 font-medium">Invoice</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Receipts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {billing.invoices.map((i) => {
                  const receipts = billing.payments.filter((p) => p.invoice_id === i.id && !p.voided_at);
                  return (
                    <tr key={i.id}>
                      <td className="py-2">
                        <a href={`/api/pdf/invoice/${i.id}`} target="_blank" rel="noopener" className="font-medium text-brand-700 hover:underline">
                          {i.invoice_number}
                        </a>
                      </td>
                      <td className="py-2">{formatDateOnly(i.issue_date)}</td>
                      <td className="py-2 text-right tabular-nums">{money(i.total, i.currency)}</td>
                      <td className="py-2">
                        <InvoiceBadge status={i.status} overdue={isOverdue(i, today)} />
                      </td>
                      <td className="py-2">
                        {receipts.length === 0
                          ? "—"
                          : receipts.map((p) => (
                              <a key={p.id} href={`/api/pdf/receipt/${p.id}`} target="_blank" rel="noopener" className="mr-3 text-brand-700 hover:underline" title={`${methodLabel(p.method)} · ${formatDateOnly(p.paid_on)}`}>
                                {p.receipt_number}
                              </a>
                            ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 className="mb-3 font-semibold">Monthly statement</h2>
      <StatementView s={statement} tz={profile.timezone} base="/student/billing" />
    </>
  );
}

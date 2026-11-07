import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState, PageHeader, Pager, StatCard, paginate } from "@/components/ui";
import { BillingNav, InvoiceBadge } from "@/components/billing/BillingNav";
import { INVOICE_SELECT, balanceOf, getBillingSettings, isOverdue, type Invoice } from "@/lib/billing";
import { formatDateOnly, money, num } from "@/lib/billing-shared";
import { saveBillingSettings } from "@/lib/billing-actions";
import { startOfMonth, todayStr } from "@/lib/time";

export const metadata = { title: "Payments and billing" };

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
  { key: "all", label: "All" },
];

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string; student?: string; page?: string }> }) {
  const { supabase } = await requireRole("admin");
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "open";
  const settings = await getBillingSettings(supabase);
  const today = todayStr(settings.school_timezone);
  const monthStart = startOfMonth(today);

  let q = supabase.from("invoices").select(INVOICE_SELECT).order("issue_date", { ascending: false }).order("invoice_number", { ascending: false });
  if (status === "open" || status === "overdue") q = q.in("status", ["unpaid", "partially_paid"]);
  if (status === "overdue") q = q.lt("due_date", today);
  if (status === "paid" || status === "void") q = q.eq("status", status);
  if (sp.student) q = q.eq("student_id", sp.student);

  const [{ data: rows }, { data: open }, { data: monthPayments }, { data: students }] = await Promise.all([
    q,
    supabase.from("invoices").select("total, amount_paid, status, due_date").in("status", ["unpaid", "partially_paid"]),
    supabase.from("payments").select("amount").is("voided_at", null).gte("paid_on", monthStart),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
  ]);
  const invoices = (rows ?? []) as Invoice[];
  const openRows = (open ?? []) as Pick<Invoice, "total" | "amount_paid" | "status" | "due_date">[];
  const outstanding = openRows.reduce((s, i) => s + balanceOf(i), 0);
  const overdue = openRows.filter((i) => isOverdue(i, today));
  const collected = (monthPayments ?? []).reduce((s, p) => s + num(p.amount), 0);
  const page = paginate(invoices, sp.page);
  const cur = settings.currency;

  return (
    <>
      <PageHeader
        title="Payments and billing"
        description="Invoices, payments, statements, packages and teacher pay. Payments are recorded here when the school receives them."
        action={
          <Link href={`/admin/billing/invoices/new${sp.student ? `?student=${sp.student}` : ""}`} className="btn-primary">
            New invoice
          </Link>
        }
      />
      <BillingNav active="/admin/billing" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={money(outstanding, cur)} href="/admin/billing?status=open" />
        <StatCard label={`Overdue (${overdue.length})`} value={money(overdue.reduce((s, i) => s + balanceOf(i), 0), cur)} href="/admin/billing?status=overdue" />
        <StatCard label="Collected this month" value={money(collected, cur)} />
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/billing">
        <input type="hidden" name="status" value={status} />
        <div>
          <label className="label" htmlFor="student">Student</label>
          <select className="input" id="student" name="student" defaultValue={sp.student ?? ""}>
            <option value="">All students</option>
            {(students ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filter</button>
      </form>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Invoice status">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/billing?status=${f.key}${sp.student ? `&student=${sp.student}` : ""}`}
            aria-current={f.key === status ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${f.key === status ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {page.rows.length === 0 ? (
        <EmptyState>No invoices here.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Invoice</th>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Issued</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/billing/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                      {i.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{i.student?.full_name}</td>
                  <td className="px-4 py-2">{formatDateOnly(i.issue_date)}</td>
                  <td className="px-4 py-2">{formatDateOnly(i.due_date)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(i.total, i.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(balanceOf(i), i.currency)}</td>
                  <td className="px-4 py-2">
                    <InvoiceBadge status={i.status} overdue={isOverdue(i, today)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager {...page} base="/admin/billing" params={{ status, student: sp.student }} />

      <details className="card mt-8">
        <summary className="cursor-pointer font-semibold">Billing settings</summary>
        <ActionForm action={saveBillingSettings} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="currency">Currency</label>
              <input className="input uppercase" id="currency" name="currency" defaultValue={settings.currency} maxLength={3} required />
            </div>
            <div>
              <label className="label" htmlFor="invoice_due_days">Invoices due after (days)</label>
              <input className="input" id="invoice_due_days" name="invoice_due_days" type="number" min={0} max={90} defaultValue={settings.invoice_due_days} required />
            </div>
            <div>
              <label className="label" htmlFor="late_cancel_hours">Late cancellation cutoff (hours)</label>
              <input className="input" id="late_cancel_hours" name="late_cancel_hours" type="number" min={0} max={168} step="0.5" defaultValue={settings.late_cancel_hours} required />
            </div>
            <div>
              <label className="label" htmlFor="school_timezone">School time zone</label>
              <input className="input" id="school_timezone" name="school_timezone" defaultValue={settings.school_timezone} required />
            </div>
          </div>
          <p className="text-xs text-muted">
            A class the student cancels less than the cutoff before it starts uses up one of their classes. The school time zone decides which month a class or payment
            belongs to, and the dates on invoices.
          </p>
        </ActionForm>
      </details>
    </>
  );
}

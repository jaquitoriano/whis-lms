import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { InvoiceBadge } from "@/components/billing/BillingNav";
import { INVOICE_SELECT, balanceOf, getBillingSettings, isOverdue, type Invoice, type InvoiceItem, type Payment } from "@/lib/billing";
import { PAYMENT_METHODS, formatDateOnly, methodLabel, money, num } from "@/lib/billing-shared";
import { recordPayment, voidInvoice, voidPayment } from "@/lib/billing-actions";
import { todayStr } from "@/lib/time";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { supabase } = await requireRole("admin");
  const { id } = await params;
  const { created } = await searchParams;
  const [{ data: inv }, { data: items }, { data: payments }, settings] = await Promise.all([
    supabase.from("invoices").select(INVOICE_SELECT).eq("id", id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on").order("created_at"),
    getBillingSettings(supabase),
  ]);
  if (!inv) notFound();
  const i = inv as Invoice;
  const lines = (items ?? []) as InvoiceItem[];
  const pays = (payments ?? []) as Payment[];
  const today = todayStr(settings.school_timezone);
  const balance = balanceOf(i);
  const hasPayments = pays.some((p) => !p.voided_at);

  return (
    <>
      <Link href={`/admin/billing?student=${i.student_id}&status=all`} className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← {i.student?.full_name}&apos;s invoices
      </Link>
      <PageHeader
        title={`Invoice ${i.invoice_number}`}
        description={`${i.student?.full_name} · issued ${formatDateOnly(i.issue_date)} · due ${formatDateOnly(i.due_date)}`}
        action={
          <div className="flex items-center gap-2">
            <InvoiceBadge status={i.status} overdue={isOverdue(i, today)} />
            <a className="btn-secondary" href={`/api/pdf/invoice/${i.id}`} target="_blank" rel="noopener">
              Download PDF
            </a>
          </div>
        }
      />
      {created && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Invoice created. {i.student?.full_name} has been notified.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right tabular-nums">{num(l.quantity)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.unit_price, i.currency)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.amount, i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(i.total, i.currency)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Paid</dt>
              <dd className="tabular-nums">{money(i.amount_paid, i.currency)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Balance due</dt>
              <dd className="tabular-nums">{money(balance, i.currency)}</dd>
            </div>
          </dl>
          {i.notes && <p className="mt-4 whitespace-pre-line text-sm text-muted">{i.notes}</p>}
          {i.status === "void" && <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">Voided: {i.void_reason}</p>}
        </section>

        <div className="space-y-6">
          {i.status !== "void" && balance > 0 && (
            <section className="card">
              <h2 className="mb-4 font-semibold">Record a payment</h2>
              <ActionForm action={recordPayment.bind(null, i.id)} submitLabel="Record payment" pendingText="Recording…" resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="amount">Amount ({i.currency})</label>
                    <input className="input text-right" id="amount" name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="paid_on">Date received</label>
                    <input className="input" id="paid_on" name="paid_on" type="date" defaultValue={today} max={today} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="method">Method</label>
                    <select className="input" id="method" name="method" required defaultValue="bank_transfer">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="reference">Reference</label>
                    <input className="input" id="reference" name="reference" maxLength={200} placeholder="Transaction number" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="pay-note">Note (admin only)</label>
                  <input className="input" id="pay-note" name="note" maxLength={1000} />
                </div>
              </ActionForm>
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 font-semibold">Payments</h2>
            {pays.length === 0 ? (
              <p className="text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {pays.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className={p.voided_at ? "text-muted line-through" : "font-medium"}>
                        {money(p.amount, i.currency)} · {methodLabel(p.method)}
                      </span>
                      <a href={`/api/pdf/receipt/${p.id}`} target="_blank" rel="noopener" className="text-brand-700 hover:underline">
                        {p.receipt_number}
                      </a>
                    </div>
                    <p className="text-xs text-muted">
                      {formatDateOnly(p.paid_on)}
                      {p.reference && ` · ${p.reference}`}
                      {p.note && ` · ${p.note}`}
                    </p>
                    {p.voided_at ? (
                      <p className="mt-1 text-xs text-red-700">Voided: {p.void_reason}</p>
                    ) : (
                      i.status !== "void" && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Void this payment</summary>
                          <ActionForm action={voidPayment.bind(null, p.id)} submitLabel="Void payment" pendingText="Voiding…" className="mt-2 space-y-2">
                            <input className="input" name="reason" required placeholder="Reason, e.g. entered twice, bounced transfer" aria-label="Reason" />
                          </ActionForm>
                        </details>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {i.status !== "void" && !hasPayments && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Void this invoice</summary>
              <p className="mt-2 text-xs text-muted">Invoices are never deleted. A void invoice stays in the records with its reason, and no longer counts towards the balance.</p>
              <ActionForm action={voidInvoice.bind(null, i.id)} submitLabel="Void invoice" pendingText="Voiding…" className="mt-3 space-y-2">
                <input className="input" name="reason" required placeholder="Reason" aria-label="Reason" />
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

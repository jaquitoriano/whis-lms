import Link from "@/components/Link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { BillingNav } from "@/components/billing/BillingNav";
import { getBillingSettings, monthRange } from "@/lib/billing";
import { formatDateOnly, isMonthKey, money, monthLabel, nextMonthKey, payoutStatusLabel, payoutStatusStyle, type PayBasis, type PayoutStatus } from "@/lib/billing-shared";
import { calculatePayouts, saveTeacherRate, updatePayout } from "@/lib/billing-actions";
import { statusLabel, type SessionStatus } from "@/lib/sessions";
import { formatDateTime, todayStr } from "@/lib/time";

export const metadata = { title: "Teacher pay" };

type Payout = {
  id: string;
  teacher_id: string;
  classes_count: number;
  minutes: number;
  basis: PayBasis;
  rate: number;
  currency: string;
  base_amount: number;
  adjustment: number;
  adjustment_note: string;
  total: number;
  status: PayoutStatus;
  paid_on: string | null;
  reference: string;
  calculated_at: string;
};

// PAY-08: teacher compensation. Admin only; teachers never see this page or these tables.
export default async function TeacherPayPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getBillingSettings(supabase);
  const thisMonth = todayStr(settings.school_timezone).slice(0, 7);
  const month = isMonthKey(sp.month) ? sp.month : nextMonthKey(thisMonth, -1);
  const { from, to } = monthRange(month, settings.school_timezone);

  const [{ data: teachers }, { data: rates }, { data: payouts }, { data: classes }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, status").eq("role", "teacher").order("full_name"),
    supabase.from("teacher_rates").select("*"),
    supabase.from("teacher_payouts").select("*").eq("period_month", `${month}-01`),
    supabase
      .from("class_sessions")
      .select("id, teacher_id, starts_at, ends_at, status, late_cancel, student:profiles!class_sessions_student_id_fkey(full_name)")
      .eq("counts_as_used", true)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
  ]);
  const rateOf = (id: string) => (rates ?? []).find((r) => r.teacher_id === id);
  const payoutOf = (id: string) => ((payouts ?? []) as Payout[]).find((p) => p.teacher_id === id);
  type Cls = { id: string; teacher_id: string; starts_at: string; ends_at: string; status: SessionStatus; late_cancel: boolean; student: { full_name: string } | null };
  const classesOf = (id: string) => ((classes ?? []) as unknown as Cls[]).filter((c) => c.teacher_id === id);
  const tz = profile.timezone;

  return (
    <>
      <PageHeader title="Payments and billing" description="Teacher pay (admin only). Teachers are paid for every class that used up one of a student's classes." />
      <BillingNav active="/admin/billing/teacher-pay" />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link className="btn-secondary px-3" href={`/admin/billing/teacher-pay?month=${nextMonthKey(month, -1)}`} aria-label="Previous month">
            ←
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Link className="btn-secondary px-3" href={`/admin/billing/teacher-pay?month=${nextMonthKey(month, 1)}`} aria-label="Next month">
            →
          </Link>
        </div>
        <ActionForm action={calculatePayouts} submitLabel={`Work out ${monthLabel(month)} pay`} pendingText="Working out…" className="flex flex-col items-end gap-2">
          <input type="hidden" name="month" value={month} />
        </ActionForm>
      </div>

      {(teachers ?? []).length === 0 ? (
        <EmptyState>No teachers yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {(teachers ?? []).map((t) => {
            const rate = rateOf(t.id);
            const payout = payoutOf(t.id);
            const list = classesOf(t.id);
            return (
              <section key={t.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{t.full_name}</h3>
                    <p className="text-sm text-muted">
                      {rate ? `${money(rate.rate, rate.currency)} ${rate.basis === "per_class" ? "per class" : "per hour"}` : "No rate set"} · {list.length} paid class
                      {list.length === 1 ? "" : "es"} in {monthLabel(month)}
                    </p>
                  </div>
                  {payout ? (
                    <div className="text-right">
                      <span className={`badge ${payoutStatusStyle[payout.status]}`}>{payoutStatusLabel[payout.status]}</span>
                      <p className="mt-1 text-xl font-semibold tabular-nums">{money(payout.total, payout.currency)}</p>
                      <p className="text-xs text-muted">
                        {payout.classes_count} classes · {Math.round((payout.minutes / 60) * 10) / 10} h · base {money(payout.base_amount, payout.currency)}
                        {Number(payout.adjustment) !== 0 && ` · adjustment ${money(payout.adjustment, payout.currency)}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{rate ? "Not worked out yet." : "Set a rate to work out pay."}</p>
                  )}
                </div>

                {payout && list.length !== payout.classes_count && payout.status === "draft" && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Classes changed since this was worked out. Work it out again to update it.</p>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {payout?.status === "paid" && (
                    <p className="text-sm text-muted">
                      Paid on {formatDateOnly(payout.paid_on)}
                      {payout.reference && ` · ${payout.reference}`}
                      {payout.adjustment_note && ` · ${payout.adjustment_note}`}. Paid payouts can&apos;t be changed.
                    </p>
                  )}
                  {payout && payout.status !== "paid" && (
                    <ActionForm action={updatePayout.bind(null, payout.id)} className="space-y-3" submitLabel="Save payout">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label" htmlFor={`st-${payout.id}`}>Status</label>
                          <select className="input" id={`st-${payout.id}`} name="status" defaultValue={payout.status}>
                            <option value="draft">Draft</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor={`adj-${payout.id}`}>Adjustment (draft only)</label>
                          <input
                            className="input text-right"
                            id={`adj-${payout.id}`}
                            name="adjustment"
                            inputMode="decimal"
                            defaultValue={String(payout.adjustment)}
                            readOnly={payout.status !== "draft"}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`paid-${payout.id}`}>Paid on</label>
                          <input className="input" id={`paid-${payout.id}`} name="paid_on" type="date" defaultValue={payout.paid_on ?? ""} />
                        </div>
                        <div>
                          <label className="label" htmlFor={`ref-${payout.id}`}>Reference</label>
                          <input className="input" id={`ref-${payout.id}`} name="reference" defaultValue={payout.reference} maxLength={200} />
                        </div>
                      </div>
                      <input className="input" name="adjustment_note" defaultValue={payout.adjustment_note} placeholder="Reason for adjustment" aria-label="Reason for adjustment" readOnly={payout.status !== "draft"} />
                    </ActionForm>
                  )}
                  <details className={payout ? "" : "lg:col-span-2"}>
                    <summary className="cursor-pointer text-sm text-brand-700">Rate</summary>
                    <ActionForm action={saveTeacherRate.bind(null, t.id)} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Save rate">
                      <div>
                        <label className="label" htmlFor={`basis-${t.id}`}>Paid</label>
                        <select className="input" id={`basis-${t.id}`} name="basis" defaultValue={rate?.basis ?? "per_class"}>
                          <option value="per_class">Per class</option>
                          <option value="per_hour">Per hour</option>
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor={`rate-${t.id}`}>Rate ({settings.currency})</label>
                        <input className="input w-32 text-right" id={`rate-${t.id}`} name="rate" inputMode="decimal" defaultValue={rate?.rate ?? ""} required />
                      </div>
                    </ActionForm>
                  </details>
                </div>

                {list.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Classes ({list.length})</summary>
                    <ul className="mt-2 divide-y divide-border text-sm">
                      {list.map((c) => (
                        <li key={c.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                          <Link href={`/admin/classes/${c.id}`} className="hover:text-brand-700">
                            {formatDateTime(c.starts_at, tz)} · {c.student?.full_name}
                          </Link>
                          <span className="text-muted">{statusLabel[c.status]}{c.late_cancel ? " (late)" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

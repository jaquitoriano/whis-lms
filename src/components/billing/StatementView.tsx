import Link from "@/components/Link";
import type { Statement } from "@/lib/billing";
import { attendanceLabel, attendanceStyle, formatDateOnly, invoiceStatusLabel, methodLabel, money, monthLabel, nextMonthKey } from "@/lib/billing-shared";
import { statusLabel } from "@/lib/sessions";
import { formatDateTime, tzLabel } from "@/lib/time";

// Monthly statement (PAY-04), shared by the admin and student portals.
export function StatementView({
  s,
  tz,
  base,
  invoiceHref,
}: {
  s: Statement;
  tz: string;
  base: string; // page URL with any other params, e.g. "/admin/billing/statements?student=…"
  invoiceHref?: (id: string) => string;
}) {
  const sep = base.includes("?") ? "&" : "?";
  const pdf = `/api/pdf/statement?student=${s.student?.id}&month=${s.key}`;
  return (
    <section className="card space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link className="btn-secondary px-3" href={`${base}${sep}month=${nextMonthKey(s.key, -1)}`} aria-label="Previous month">
            ←
          </Link>
          <h2 className="min-w-40 text-center font-semibold">{monthLabel(s.key)}</h2>
          <Link className="btn-secondary px-3" href={`${base}${sep}month=${nextMonthKey(s.key, 1)}`} aria-label="Next month">
            →
          </Link>
        </div>
        <a className="btn-secondary" href={pdf} target="_blank" rel="noopener">
          Download statement (PDF)
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Opening balance", s.opening],
          ["Invoiced", s.invoiced],
          ["Paid", s.paid],
          ["Closing balance", s.closing],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-muted">{k}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{money(v as number, s.currency)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Invoices</h3>
          {s.invoices.length === 0 ? (
            <p className="text-sm text-muted">None this month.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {s.invoices.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {invoiceHref ? (
                      <Link href={invoiceHref(i.id)} className="text-brand-700 hover:underline">
                        {i.invoice_number}
                      </Link>
                    ) : (
                      i.invoice_number
                    )}{" "}
                    <span className="text-muted">· {formatDateOnly(i.issue_date)} · {invoiceStatusLabel[i.status]}</span>
                  </span>
                  <span className="tabular-nums">{money(i.total, i.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Payments</h3>
          {s.payments.length === 0 ? (
            <p className="text-sm text-muted">None this month.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {s.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    <a href={`/api/pdf/receipt/${p.id}`} target="_blank" rel="noopener" className="text-brand-700 hover:underline">
                      {p.receipt_number}
                    </a>{" "}
                    <span className="text-muted">
                      · {formatDateOnly(p.paid_on)} · {methodLabel(p.method)}
                    </span>
                  </span>
                  <span className="tabular-nums">{money(p.amount, s.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Classes ({tzLabel(tz)})</h3>
        {s.classes.length === 0 ? (
          <p className="text-sm text-muted">No classes held this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Date</th>
                  <th className="py-1.5 font-medium">Teacher</th>
                  <th className="py-1.5 font-medium">Class</th>
                  <th className="py-1.5 font-medium">Attendance</th>
                  <th className="py-1.5 text-right font-medium">Used a class</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.classes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5">{formatDateTime(c.starts_at, tz)}</td>
                    <td className="py-1.5">{c.teacher?.full_name}</td>
                    <td className="py-1.5">
                      {statusLabel[c.status]}
                      {c.late_cancel && <span className="text-muted"> (late)</span>}
                    </td>
                    <td className="py-1.5">
                      {c.attendance ? (
                        <span className={`badge ${attendanceStyle[c.attendance.mark]}`}>
                          {attendanceLabel[c.attendance.mark]}
                          {c.attendance.minutes_late ? ` ${c.attendance.minutes_late} min` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 text-right">{c.counts_as_used ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

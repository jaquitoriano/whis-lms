import { requireRole } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/ui";
import { BillingNav } from "@/components/billing/BillingNav";
import { StatementView } from "@/components/billing/StatementView";
import { buildStatement, getBillingSettings } from "@/lib/billing";
import { isMonthKey } from "@/lib/billing-shared";
import { todayStr } from "@/lib/time";

export const metadata = { title: "Statements" };

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ student?: string; month?: string }> }) {
  const { supabase, profile } = await requireRole("admin");
  const sp = await searchParams;
  const settings = await getBillingSettings(supabase);
  const month = isMonthKey(sp.month) ? sp.month : todayStr(settings.school_timezone).slice(0, 7);
  const { data: students } = await supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name");
  const student = (students ?? []).find((s) => s.id === sp.student);
  const statement = student ? await buildStatement(supabase, student.id, month, settings.school_timezone, settings.currency) : null;

  return (
    <>
      <PageHeader title="Payments and billing" description="Monthly statements (PAY-04): opening balance, invoices, payments, closing balance and classes held." />
      <BillingNav active="/admin/billing/statements" />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/billing/statements">
        <input type="hidden" name="month" value={month} />
        <div>
          <label className="label" htmlFor="student">Student</label>
          <select className="input" id="student" name="student" defaultValue={student?.id ?? ""} required>
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
        <button className="btn-secondary">Show statement</button>
      </form>
      {statement ? (
        <StatementView
          s={statement}
          tz={profile.timezone}
          base={`/admin/billing/statements?student=${student!.id}`}
          invoiceHref={(id) => `/admin/billing/invoices/${id}`}
        />
      ) : (
        <EmptyState>Choose a student to see their statement.</EmptyState>
      )}
    </>
  );
}

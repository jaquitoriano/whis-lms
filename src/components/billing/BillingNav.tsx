import Link from "@/components/Link";
import { invoiceStatusLabel, invoiceStatusStyle, type InvoiceStatus } from "@/lib/billing-shared";

const TABS = [
  { href: "/admin/billing", label: "Invoices" },
  { href: "/admin/billing/statements", label: "Statements" },
  { href: "/admin/billing/packages", label: "Class packages" },
  { href: "/admin/billing/teacher-pay", label: "Teacher pay" },
];

export function BillingNav({ active }: { active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Billing">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.href === active ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-muted hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function InvoiceBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue) return <span className="badge bg-red-50 text-red-700">Overdue</span>;
  return <span className={`badge ${invoiceStatusStyle[status]}`}>{invoiceStatusLabel[status]}</span>;
}

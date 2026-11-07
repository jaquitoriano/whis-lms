// Labels and formatting shared by server pages, client components and PDFs (Phase 5).

export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "bank_transfer" | "gcash" | "maya" | "card" | "paypal" | "other";
export type ContractStatus = "draft" | "sent" | "signed" | "expired" | "void";
export type AttendanceMark = "present" | "absent" | "late" | "cancelled" | "rescheduled";
export type PayoutStatus = "draft" | "approved" | "paid";
export type PayBasis = "per_class" | "per_hour";
export type CancelParty = "student" | "teacher" | "school";

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};
export const invoiceStatusStyle: Record<InvoiceStatus, string> = {
  unpaid: "bg-amber-50 text-amber-700",
  partially_paid: "bg-brand-50 text-brand-700",
  paid: "bg-green-50 text-green-700",
  void: "bg-slate-100 text-slate-500",
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "Other" },
];
export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

export const contractStatusLabel: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Waiting for signature",
  signed: "Signed",
  expired: "Expired",
  void: "Void",
};
export const contractStatusStyle: Record<ContractStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-50 text-amber-700",
  signed: "bg-green-50 text-green-700",
  expired: "bg-slate-100 text-slate-500",
  void: "bg-slate-100 text-slate-500 line-through",
};

export const attendanceLabel: Record<AttendanceMark, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};
export const attendanceStyle: Record<AttendanceMark, string> = {
  present: "bg-green-50 text-green-700",
  late: "bg-amber-50 text-amber-700",
  absent: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
  rescheduled: "bg-slate-100 text-slate-500",
};

export const payoutStatusLabel: Record<PayoutStatus, string> = { draft: "Draft", approved: "Approved", paid: "Paid" };
export const payoutStatusStyle: Record<PayoutStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-brand-50 text-brand-700",
  paid: "bg-green-50 text-green-700",
};

export const cancelPartyLabel: Record<CancelParty, string> = {
  student: "the student",
  teacher: "the teacher",
  school: "the school",
};

// Numbers come back from Postgres numeric columns as strings or numbers.
export function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function money(amount: string | number | null | undefined, currency: string) {
  const n = num(amount);
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}${currency} ${s}`;
}

// "2026-11" <-> first day of month.
export function monthKey(date: string) {
  return date.slice(0, 7);
}
export function isMonthKey(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function nextMonthKey(key: string, n = 1) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function formatDateOnly(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

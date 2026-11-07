import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { num, nextMonthKey, type AttendanceMark, type InvoiceStatus, type PaymentMethod } from "@/lib/billing-shared";
import { zonedToUtc } from "@/lib/time";
import type { SessionStatus } from "@/lib/sessions";

export type BillingSettings = { currency: string; late_cancel_hours: number; school_timezone: string; invoice_due_days: number };

export async function getBillingSettings(supabase: SupabaseClient): Promise<BillingSettings> {
  const { data } = await supabase.rpc("billing_settings");
  const d = (data ?? {}) as Partial<BillingSettings>;
  return {
    currency: d.currency ?? "PHP",
    late_cancel_hours: num(d.late_cancel_hours ?? 24),
    school_timezone: d.school_timezone ?? "Asia/Manila",
    invoice_due_days: num(d.invoice_due_days ?? 7),
  };
}

export type ClassPackage = {
  id: string;
  course_id: string | null;
  name: string;
  classes_count: number;
  class_minutes: number;
  price: number;
  currency: string;
  validity_days: number | null;
  description: string;
  active: boolean;
  sort_order: number;
};

export type Enrollment = {
  id: string;
  student_id: string;
  course_id: string | null;
  package_id: string | null;
  package_name: string;
  classes_total: number;
  class_minutes: number;
  classes_per_week: number | null;
  price: number;
  currency: string;
  starts_on: string;
  ends_on: string | null;
  status: "active" | "completed" | "cancelled";
  notes: string;
  course?: { name: string } | null;
  usage?: { used: number; booked: number; remaining: number };
};

export type InvoiceItem = { id: string; position: number; description: string; quantity: number; unit_price: number; amount: number };
export type Payment = {
  id: string;
  receipt_number: string;
  invoice_id: string;
  student_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  paid_on: string;
  note: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};
export type Invoice = {
  id: string;
  invoice_number: string;
  student_id: string;
  enrollment_id: string | null;
  issue_date: string;
  due_date: string;
  currency: string;
  total: number;
  amount_paid: number;
  status: InvoiceStatus;
  notes: string;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  student?: { id: string; full_name: string } | null;
};

export const INVOICE_SELECT = "*, student:profiles!invoices_student_id_fkey(id, full_name)";

export function balanceOf(i: Pick<Invoice, "total" | "amount_paid" | "status">) {
  return i.status === "void" ? 0 : num(i.total) - num(i.amount_paid);
}

export function isOverdue(i: Pick<Invoice, "status" | "due_date">, today: string) {
  return (i.status === "unpaid" || i.status === "partially_paid") && i.due_date < today;
}

// Enrollments with classes used / booked / left.
export async function getEnrollments(supabase: SupabaseClient, studentId: string): Promise<Enrollment[]> {
  const [{ data: rows }, { data: usage }] = await Promise.all([
    supabase.from("enrollments").select("*, course:courses(name)").eq("student_id", studentId).order("starts_on", { ascending: false }),
    supabase.from("enrollment_usage").select("enrollment_id, used, booked, remaining").eq("student_id", studentId),
  ]);
  return ((rows ?? []) as Enrollment[]).map((e) => {
    const u = (usage ?? []).find((x) => x.enrollment_id === e.id);
    return { ...e, usage: { used: u?.used ?? 0, booked: u?.booked ?? 0, remaining: u?.remaining ?? e.classes_total } };
  });
}

export async function getStudentInvoices(supabase: SupabaseClient, studentId: string) {
  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("*").eq("student_id", studentId).order("issue_date", { ascending: false }).order("invoice_number", { ascending: false }),
    supabase.from("payments").select("*").eq("student_id", studentId).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const inv = (invoices ?? []) as Invoice[];
  const pays = (payments ?? []) as Payment[];
  const outstanding = inv.reduce((s, i) => s + balanceOf(i), 0);
  return { invoices: inv, payments: pays, outstanding };
}

export type UsedClass = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
  counts_as_used: boolean;
  late_cancel: boolean;
  cancel_requested_by: string | null;
  enrollment_id: string | null;
  teacher: { full_name: string } | null;
  attendance: { mark: AttendanceMark; minutes_late: number | null } | null;
};

export const USED_CLASS_SELECT =
  "id, starts_at, ends_at, status, counts_as_used, late_cancel, cancel_requested_by, enrollment_id, teacher:profiles!class_sessions_teacher_id_fkey(full_name), attendance(mark, minutes_late)";

export function monthRange(key: string, tz: string) {
  return { from: zonedToUtc(`${key}-01`, "00:00", tz), to: zonedToUtc(`${nextMonthKey(key)}-01`, "00:00", tz) };
}

// Monthly statement (PAY-04): opening balance, what was invoiced and paid in the month,
// closing balance, and the classes held. Built from the records each time, so it always
// matches the invoices and payments exactly.
export async function buildStatement(supabase: SupabaseClient, studentId: string, key: string, tz: string, fallbackCurrency = "PHP") {
  const start = `${key}-01`;
  const end = `${nextMonthKey(key)}-01`;
  const { from, to } = monthRange(key, tz);
  const [{ data: invoices }, { data: payments }, { data: classes }, { data: student }] = await Promise.all([
    supabase.from("invoices").select("*").eq("student_id", studentId).neq("status", "void").lt("issue_date", end).order("issue_date"),
    supabase.from("payments").select("*").eq("student_id", studentId).is("voided_at", null).lt("paid_on", end).order("paid_on"),
    supabase
      .from("class_sessions")
      .select(USED_CLASS_SELECT)
      .eq("student_id", studentId)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .neq("status", "scheduled")
      .order("starts_at"),
    supabase.from("profiles").select("id, full_name, timezone").eq("id", studentId).maybeSingle(),
  ]);
  const inv = (invoices ?? []) as Invoice[];
  const pays = (payments ?? []) as Payment[];
  const before = (d: string) => d < start;
  const opening = inv.filter((i) => before(i.issue_date)).reduce((s, i) => s + num(i.total), 0) - pays.filter((p) => before(p.paid_on)).reduce((s, p) => s + num(p.amount), 0);
  const monthInvoices = inv.filter((i) => !before(i.issue_date));
  const monthPayments = pays.filter((p) => !before(p.paid_on));
  const invoiced = monthInvoices.reduce((s, i) => s + num(i.total), 0);
  const paid = monthPayments.reduce((s, p) => s + num(p.amount), 0);
  // One school currency is assumed (settings.currency); statements don't mix currencies.
  const currency = inv[0]?.currency ?? fallbackCurrency;
  return {
    key,
    student: student as { id: string; full_name: string; timezone: string } | null,
    currency,
    opening,
    invoiced,
    paid,
    closing: opening + invoiced - paid,
    invoices: monthInvoices,
    payments: monthPayments,
    invoiceNumberOf: new Map(inv.map((i) => [i.id, i.invoice_number])),
    classes: (classes ?? []) as unknown as UsedClass[],
  };
}
export type Statement = Awaited<ReturnType<typeof buildStatement>>;

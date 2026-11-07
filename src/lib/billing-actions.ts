"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PAYMENT_METHODS, isMonthKey } from "@/lib/billing-shared";
import { getBillingSettings } from "@/lib/billing";
import { addDays, isDateStr, todayStr } from "@/lib/time";
import type { ActionState } from "@/lib/types";

// Admin-only billing actions (PAY-01..04, PAY-08, ADM-21). Every rule that protects the money
// (totals, balances, no overpayment, no edits after payment, void instead of delete) is
// enforced by the database too, so these checks are for friendly messages.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function parseMoney(s: string): number | null {
  const t = s.replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

function dbMsg(e: { message?: string; code?: string } | null, fallback = "Something went wrong.") {
  if (!e) return fallback;
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to do that.";
  if (e.code === "23505") return "That already exists.";
  // Messages raised by our own database rules are written for people; show them as they are.
  return e.message || fallback;
}

function refresh(studentId?: string) {
  revalidatePath("/admin/billing", "layout");
  revalidatePath("/admin/contracts", "layout");
  revalidatePath("/student", "layout");
  if (studentId) revalidatePath(`/admin/users/${studentId}`);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function saveBillingSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const currency = str(formData, "currency").toUpperCase();
  const hours = Number(formData.get("late_cancel_hours"));
  const dueDays = Number(formData.get("invoice_due_days"));
  const tz = str(formData, "school_timezone");
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency must be a 3-letter code such as PHP or USD." };
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) return { error: "The late-cancellation cutoff must be 0–168 hours." };
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 90) return { error: "Payment due days must be 0–90." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return { error: "That isn't a valid time zone (for example Asia/Manila)." };
  }
  const { error } = await supabase.from("settings").upsert([
    { key: "currency", value: currency },
    { key: "late_cancel_hours", value: hours },
    { key: "invoice_due_days", value: dueDays },
    { key: "school_timezone", value: tz },
  ]);
  if (error) return { error: dbMsg(error) };
  refresh();
  return { ok: true, message: "Billing settings saved." };
}

// ---------------------------------------------------------------------------
// Class packages (ADM-21)
// ---------------------------------------------------------------------------
export async function savePackage(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const name = str(formData, "name");
  const classes = Number(formData.get("classes_count"));
  const minutes = Number(formData.get("class_minutes"));
  const price = parseMoney(str(formData, "price"));
  const validity = str(formData, "validity_days");
  const currency = str(formData, "currency").toUpperCase();
  if (!name) return { error: "Give the package a name." };
  if (!Number.isInteger(classes) || classes < 1 || classes > 500) return { error: "Number of classes must be 1–500." };
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) return { error: "Class length must be 15–240 minutes." };
  if (price == null || price < 0) return { error: "Enter the price, for example 12000 or 12,000.00." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Currency must be a 3-letter code." };
  const row = {
    name,
    course_id: str(formData, "course_id") || null,
    classes_count: classes,
    class_minutes: minutes,
    price,
    currency,
    validity_days: validity ? Number(validity) : null,
    description: str(formData, "description"),
    sort_order: Number(formData.get("sort_order") ?? 0) || 0,
    active: formData.get("active") === "on",
  };
  if (row.validity_days != null && (!Number.isInteger(row.validity_days) || row.validity_days < 1)) return { error: "Validity must be a whole number of days." };
  const { error } = id ? await supabase.from("class_packages").update(row).eq("id", id) : await supabase.from("class_packages").insert(row);
  if (error) return { error: dbMsg(error) };
  refresh();
  return { ok: true, message: id ? "Package saved." : "Package added." };
}

// ---------------------------------------------------------------------------
// Enrollments: a student buys a package
// ---------------------------------------------------------------------------
export async function createEnrollment(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("admin");
  const settings = await getBillingSettings(supabase);
  const packageId = str(formData, "package_id") || null;
  const { data: pkg } = packageId ? await supabase.from("class_packages").select("*").eq("id", packageId).maybeSingle() : { data: null };
  if (packageId && !pkg) return { error: "Package not found." };

  const startsOn = str(formData, "starts_on");
  if (!isDateStr(startsOn)) return { error: "Choose a start date." };
  const endsOn = str(formData, "ends_on") || (pkg?.validity_days ? addDays(startsOn, pkg.validity_days) : null);
  if (endsOn && (!isDateStr(endsOn) || endsOn < startsOn)) return { error: "The end date must be on or after the start date." };

  const classes = Number(str(formData, "classes_total") || pkg?.classes_count);
  const minutes = Number(str(formData, "class_minutes") || pkg?.class_minutes || 50);
  const perWeek = str(formData, "classes_per_week");
  const priceStr = str(formData, "price");
  const price = priceStr ? parseMoney(priceStr) : pkg ? Number(pkg.price) : null;
  const name = str(formData, "package_name") || pkg?.name;
  if (!name) return { error: "Choose a package or give this enrollment a name." };
  if (!Number.isInteger(classes) || classes < 1) return { error: "Enter the number of classes." };
  if (price == null || price < 0) return { error: "Enter the price." };

  const { data: sp } = await supabase.from("student_profiles").select("course_id").eq("user_id", studentId).maybeSingle();
  const row = {
    student_id: studentId,
    course_id: str(formData, "course_id") || pkg?.course_id || sp?.course_id || null,
    package_id: pkg?.id ?? null,
    package_name: name,
    classes_total: classes,
    class_minutes: minutes,
    classes_per_week: perWeek ? Number(perWeek) : null,
    price,
    currency: pkg?.currency ?? settings.currency,
    starts_on: startsOn,
    ends_on: endsOn,
    notes: str(formData, "notes"),
    created_by: profile.id,
  };
  const { data: e, error } = await supabase.from("enrollments").insert(row).select("id").single();
  if (error || !e) return { error: dbMsg(error) };

  // Classes already on the calendar in this period, not yet in any package, join this one.
  let q = supabase
    .from("class_sessions")
    .update({ enrollment_id: e.id })
    .eq("student_id", studentId)
    .is("enrollment_id", null)
    .gte("starts_at", `${startsOn}T00:00:00Z`);
  if (endsOn) q = q.lte("starts_at", `${addDays(endsOn, 1)}T00:00:00Z`);
  await q;

  if (formData.get("create_invoice") === "on" && price > 0) {
    const { error: invErr } = await supabase.rpc("create_invoice", {
      p_student: studentId,
      p_enrollment: e.id,
      p_due: addDays(startsOn > todayStr(settings.school_timezone) ? startsOn : todayStr(settings.school_timezone), settings.invoice_due_days),
      p_currency: row.currency,
      p_notes: "",
      p_items: [{ description: `${name} (${classes} classes, ${minutes} min)`, quantity: 1, unit_price: price }],
    });
    if (invErr) return { error: `Package added, but the invoice failed: ${dbMsg(invErr)}` };
  }
  refresh(studentId);
  return { ok: true, message: formData.get("create_invoice") === "on" ? "Package added and invoice sent." : "Package added." };
}

export async function updateEnrollment(id: string, studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const status = str(formData, "status");
  const classes = Number(formData.get("classes_total"));
  const endsOn = str(formData, "ends_on") || null;
  if (!["active", "completed", "cancelled"].includes(status)) return { error: "Choose a status." };
  if (!Number.isInteger(classes) || classes < 1) return { error: "Enter the number of classes." };
  if (endsOn && !isDateStr(endsOn)) return { error: "Enter a valid end date." };
  const { error } = await supabase
    .from("enrollments")
    .update({ status, classes_total: classes, ends_on: endsOn, notes: str(formData, "notes") })
    .eq("id", id);
  if (error) return { error: dbMsg(error) };
  refresh(studentId);
  return { ok: true, message: "Package updated." };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export async function createInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const settings = await getBillingSettings(supabase);
  const studentId = str(formData, "student_id");
  const due = str(formData, "due_date");
  const issue = str(formData, "issue_date");
  if (!studentId) return { error: "Choose the student." };
  if (!isDateStr(issue)) return { error: "Choose the invoice date." };
  if (!isDateStr(due) || due < issue) return { error: "The due date must be on or after the invoice date." };
  const items: { description: string; quantity: number; unit_price: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const description = str(formData, `desc_${i}`);
    const qty = str(formData, `qty_${i}`) || "1";
    const price = str(formData, `price_${i}`);
    if (!description && !price) continue;
    const q = Number(qty);
    const p = parseMoney(price);
    if (!description) return { error: `Line ${i + 1}: add a description.` };
    if (!Number.isFinite(q) || q <= 0) return { error: `Line ${i + 1}: the quantity must be more than 0.` };
    if (p == null) return { error: `Line ${i + 1}: enter a price (use a minus sign for a discount).` };
    items.push({ description, quantity: q, unit_price: p });
  }
  if (!items.length) return { error: "Add at least one line." };
  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  if (total < 0) return { error: "The total can't be negative." };

  const { data: id, error } = await supabase.rpc("create_invoice", {
    p_student: studentId,
    p_enrollment: str(formData, "enrollment_id") || null,
    p_due: due,
    p_currency: settings.currency,
    p_notes: str(formData, "notes"),
    p_items: items,
    p_issue: issue,
  });
  if (error) return { error: dbMsg(error) };
  refresh(studentId);
  redirect(`/admin/billing/invoices/${id}?created=1`);
}

export async function voidInvoice(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const reason = str(formData, "reason");
  if (!reason) return { error: "Give a reason for voiding the invoice." };
  const { data, error } = await supabase.from("invoices").update({ status: "void", void_reason: reason }).eq("id", id).select("student_id");
  if (error || !data?.length) return { error: dbMsg(error, "Invoice not found.") };
  refresh(data[0].student_id);
  return { ok: true, message: "Invoice voided." };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export async function recordPayment(invoiceId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const settings = await getBillingSettings(supabase);
  const amount = parseMoney(str(formData, "amount"));
  const method = str(formData, "method");
  const paidOn = str(formData, "paid_on");
  if (amount == null || amount <= 0) return { error: "Enter the amount received." };
  if (!PAYMENT_METHODS.some((m) => m.value === method)) return { error: "Choose how it was paid." };
  if (!isDateStr(paidOn)) return { error: "Choose the date it was paid." };
  if (paidOn > todayStr(settings.school_timezone)) return { error: "The payment date can't be in the future." };
  const { data: inv } = await supabase.from("invoices").select("student_id").eq("id", invoiceId).maybeSingle();
  if (!inv) return { error: "Invoice not found." };
  // The database also sets student_id from the invoice, so it can't be mismatched.
  const { data, error } = await supabase
    .from("payments")
    .insert({ invoice_id: invoiceId, student_id: inv.student_id, amount, method, paid_on: paidOn, reference: str(formData, "reference"), note: str(formData, "note") })
    .select("receipt_number, student_id")
    .single();
  if (error || !data) return { error: dbMsg(error) };
  refresh(data.student_id);
  return { ok: true, message: `Payment recorded. Receipt ${data.receipt_number}.` };
}

export async function voidPayment(paymentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const reason = str(formData, "reason");
  if (!reason) return { error: "Give a reason for voiding the payment." };
  const { data, error } = await supabase
    .from("payments")
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", paymentId)
    .select("student_id");
  if (error || !data?.length) return { error: dbMsg(error, "Payment not found.") };
  refresh(data[0].student_id);
  return { ok: true, message: "Payment voided. The invoice balance is updated." };
}

// ---------------------------------------------------------------------------
// Teacher compensation (PAY-08)
// ---------------------------------------------------------------------------
export async function saveTeacherRate(teacherId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const settings = await getBillingSettings(supabase);
  const basis = str(formData, "basis");
  const rate = parseMoney(str(formData, "rate"));
  if (!["per_class", "per_hour"].includes(basis)) return { error: "Choose per class or per hour." };
  if (rate == null || rate < 0) return { error: "Enter the rate." };
  const { error } = await supabase.from("teacher_rates").upsert({ teacher_id: teacherId, basis, rate, currency: settings.currency });
  if (error) return { error: dbMsg(error) };
  revalidatePath("/admin/billing/teacher-pay");
  return { ok: true, message: "Rate saved." };
}

export async function calculatePayouts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const month = str(formData, "month");
  if (!isMonthKey(month)) return { error: "Choose a month." };
  const { data, error } = await supabase.rpc("calculate_teacher_payouts", { p_month: `${month}-01` });
  if (error) return { error: dbMsg(error) };
  revalidatePath("/admin/billing/teacher-pay");
  return { ok: true, message: data ? `Worked out ${data} draft payout${data === 1 ? "" : "s"}. Approved and paid ones were not changed.` : "No draft payouts to update. Add teacher rates first, or move approved payouts back to draft." };
}

export async function updatePayout(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const status = str(formData, "status");
  const adjustment = parseMoney(str(formData, "adjustment") || "0");
  if (!["draft", "approved", "paid"].includes(status)) return { error: "Choose a status." };
  if (adjustment == null) return { error: "Enter the adjustment as a number (negative to deduct)." };
  const paidOn = str(formData, "paid_on") || null;
  if (paidOn && !isDateStr(paidOn)) return { error: "Enter a valid paid date." };
  const { data: cur } = await supabase.from("teacher_payouts").select("status, adjustment, adjustment_note").eq("id", id).single();
  if (!cur) return { error: "Payout not found." };
  const patch: Record<string, unknown> = { status, paid_on: status === "paid" ? paidOn : null, reference: str(formData, "reference") };
  // Amounts change only while the payout is a draft (the database refuses otherwise).
  if (cur.status === "draft" || status === "draft") {
    patch.adjustment = adjustment;
    patch.adjustment_note = str(formData, "adjustment_note");
  }
  const { error } = await supabase.from("teacher_payouts").update(patch).eq("id", id);
  if (error) return { error: dbMsg(error) };
  revalidatePath("/admin/billing/teacher-pay");
  return { ok: true, message: "Payout updated." };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { num } from "@/lib/billing-shared";

// Admin reports (Phase 7). The numbers are worked out by the database (report_* functions, admin
// only); this file shapes them for the page and for the CSV downloads.

export type MonthRow = {
  month: string;
  completed: number;
  student_absent: number;
  teacher_absent: number;
  cancelled_by_student: number;
  late_cancels: number;
  cancelled_other: number;
  rescheduled: number;
  hours_taught: number;
  classes_used: number;
  homework_set: number;
  homework_handed_in: number;
  homework_late: number;
  invoiced: number;
  collected: number;
};

export type TeacherRow = {
  teacher_id: string;
  full_name: string;
  status: string;
  active_students: number;
  completed: number;
  hours_taught: number;
  cancelled: number;
  teacher_absent: number;
  classes_without_notes: number;
  homework_set: number;
  reviews_sent: number;
  avg_review_hours: number | null;
  progress_reports: number;
};

export type AttentionRow = {
  student_id: string;
  full_name: string;
  teachers: string | null;
  last_class: string | null;
  next_class: string | null;
  classes_left: number | null;
  overdue_amount: number;
  overdue_homework: number;
  report_due: boolean;
  nothing_booked: boolean;
};

export const MONTH_CHOICES = [3, 6, 12] as const;
export function parseMonths(v: string | undefined) {
  const n = Number(v);
  return (MONTH_CHOICES as readonly number[]).includes(n) ? n : 6;
}

// Attendance rate: of the classes that were meant to happen, how many the student came to.
export function attendanceRate(r: Pick<MonthRow, "completed" | "student_absent">) {
  const base = r.completed + r.student_absent;
  return base ? Math.round((r.completed / base) * 100) : null;
}

const numeric = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) => {
  const out = { ...row };
  for (const k of keys) if (out[k] !== null) (out as Record<keyof T, unknown>)[k] = num(out[k] as string);
  return out;
};

export async function getMonthly(supabase: SupabaseClient, months: number) {
  const { data, error } = await supabase.rpc("report_monthly", { p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MonthRow[]).map((r) => numeric(r, ["hours_taught", "invoiced", "collected"]));
}

// From the first day of `from`'s month up to today (school time zone).
export async function getTeacherReport(supabase: SupabaseClient, from: string) {
  const { data, error } = await supabase.rpc("report_teachers", { p_from: from });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeacherRow[]).map((r) => numeric(r, ["hours_taught", "avg_review_hours"]));
}

export async function getAttention(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("report_attention");
  if (error) throw new Error(error.message);
  return ((data ?? []) as AttentionRow[]).map((r) => numeric(r, ["overdue_amount"]));
}

// CSV with spreadsheet-formula protection: a cell starting with = + - @ is prefixed with ' so
// Excel or Sheets show it as text instead of running it (names are typed by people).
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

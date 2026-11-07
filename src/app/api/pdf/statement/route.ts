import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { buildStatement, getBillingSettings } from "@/lib/billing";
import { isMonthKey } from "@/lib/billing-shared";
import { statementPdf } from "@/lib/pdf";
import { notFound, pdfResponse } from "@/lib/pdf-response";

export const dynamic = "force-dynamic";

// GET /api/pdf/statement?student=<id>&month=YYYY-MM  (PAY-04)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  const { supabase, profile } = session;
  const student = req.nextUrl.searchParams.get("student") ?? "";
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!isMonthKey(month) || !/^[0-9a-f-]{36}$/i.test(student)) return notFound();
  // Admins: any student. Students: only themselves. Teachers: never (row-level security agrees).
  if (profile.status === "inactive" || !(profile.role === "admin" || (profile.role === "student" && student === profile.id))) return notFound();
  const settings = await getBillingSettings(supabase);
  const s = await buildStatement(supabase, student, month, settings.school_timezone, settings.currency);
  if (!s.student) return notFound();
  const bytes = await statementPdf(s, profile.timezone);
  return pdfResponse(bytes, `statement-${month}-${s.student.full_name}.pdf`);
}

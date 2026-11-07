import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import type { Invoice, InvoiceItem, Payment } from "@/lib/billing";
import type { Contract, Signature } from "@/lib/contracts";
import { contractPdf, invoicePdf, receiptPdf } from "@/lib/pdf";
import { notFound, pdfResponse } from "@/lib/pdf-response";

export const dynamic = "force-dynamic";

// GET /api/pdf/invoice/:id, /api/pdf/receipt/:paymentId, /api/pdf/contract/:id
// Reads with the logged-in user's own client, so row-level security decides who may download
// what: admins anything, a student only their own documents, teachers nothing.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", _req.url));
  const { supabase, profile } = session;
  if (profile.status === "inactive") return notFound();
  const { kind, id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();

  if (kind === "invoice") {
    const [{ data: inv }, { data: items }, { data: pays }] = await Promise.all([
      supabase.from("invoices").select("*, student:profiles!invoices_student_id_fkey(id, full_name)").eq("id", id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
    ]);
    if (!inv) return notFound();
    const { data: contact } = await supabase.from("profile_contacts").select("email").eq("user_id", inv.student_id).maybeSingle();
    const bytes = await invoicePdf(inv as Invoice, (items ?? []) as InvoiceItem[], (pays ?? []) as Payment[], {
      full_name: inv.student?.full_name ?? "",
      email: contact?.email,
    });
    return pdfResponse(bytes, `${inv.invoice_number}.pdf`);
  }

  if (kind === "receipt") {
    const { data: p } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
    if (!p) return notFound();
    const { data: inv } = await supabase.from("invoices").select("*, student:profiles!invoices_student_id_fkey(id, full_name)").eq("id", p.invoice_id).maybeSingle();
    if (!inv) return notFound();
    const bytes = await receiptPdf(p as Payment, inv as Invoice, { full_name: inv.student?.full_name ?? "" });
    return pdfResponse(bytes, `${p.receipt_number}.pdf`);
  }

  if (kind === "contract") {
    const [{ data: c }, { data: sig }] = await Promise.all([
      supabase.from("contracts").select("*, student:profiles!contracts_student_id_fkey(id, full_name)").eq("id", id).maybeSingle(),
      supabase.from("contract_signatures").select("*").eq("contract_id", id).maybeSingle(),
    ]);
    if (!c) return notFound();
    const contract = c as Contract;
    const bytes = await contractPdf(contract, contract.student?.full_name ?? "", sig as Signature | null, profile.timezone);
    return pdfResponse(bytes, `${contract.contract_number}.pdf`);
  }

  return notFound();
}

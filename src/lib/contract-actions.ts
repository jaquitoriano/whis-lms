"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingSettings } from "@/lib/billing";
import { mergeValues, renderTemplate, type Contract, type Signature } from "@/lib/contracts";
import { contractPdf } from "@/lib/pdf";
import { emailConfigured, sendDirectEmail, siteUrl } from "@/lib/email";
import { site } from "@/config/site";
import { isDateStr, todayStr } from "@/lib/time";
import type { ActionState } from "@/lib/types";

// Enrollment contracts (CON-01..03). Admins draft and send; the student signs in the portal,
// or a minor's guardian signs through a one-time emailed link. The signature itself is written
// only by the database function record_contract_signature(), which the server calls with the
// service role after checking who is signing.

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const TOKEN_DAYS = 14;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");  // same as lib/contract-sign.ts

function refresh(id?: string) {
  revalidatePath("/admin/contracts", "layout");
  revalidatePath("/student", "layout");
  if (id) revalidatePath(`/admin/contracts/${id}`);
}

function dbMsg(e: { message?: string; code?: string } | null, fallback = "Something went wrong.") {
  if (!e) return fallback;
  if (e.code === "42501" || e.message?.includes("row-level security")) return "You don't have permission to do that.";
  return e.message || fallback;
}

async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    ua: (h.get("user-agent") ?? "").slice(0, 500) || null,
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export async function addTemplateVersion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("admin");
  const title = str(formData, "title");
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "The template needs a title and text." };
  const { data: last } = await supabase.from("contract_templates").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("contract_templates").insert({ version: (last?.version ?? 0) + 1, title, body, created_by: profile.id });
  if (error) return { error: dbMsg(error) };
  revalidatePath("/admin/contracts/templates");
  return { ok: true, message: `Version ${(last?.version ?? 0) + 1} saved. New contracts will use it.` };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------
export async function createContract(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("admin");
  const settings = await getBillingSettings(supabase);
  const studentId = str(formData, "student_id");
  const enrollmentId = str(formData, "enrollment_id") || null;
  const version = Number(formData.get("template_version"));
  if (!studentId) return { error: "Choose the student." };

  const [{ data: student }, { data: sp }, { data: tpl }, { data: enrollment }, { data: guardians }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", studentId).eq("role", "student").maybeSingle(),
    supabase.from("student_profiles").select("is_minor, course:courses(name)").eq("user_id", studentId).maybeSingle(),
    supabase.from("contract_templates").select("*").eq("version", version).maybeSingle(),
    enrollmentId ? supabase.from("enrollments").select("*, course:courses(name)").eq("id", enrollmentId).eq("student_id", studentId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("guardians").select("id, full_name, email").eq("student_id", studentId),
  ]);
  if (!student) return { error: "Student not found." };
  if (!tpl) return { error: "Choose a contract template." };
  if (enrollmentId && !enrollment) return { error: "That package belongs to a different student." };

  const minor = !!sp?.is_minor;
  const signerKind = minor ? "guardian" : (str(formData, "signer_kind") as "self" | "guardian") || "self";
  const guardian = (guardians ?? []).find((g) => g.id === str(formData, "guardian_id")) ?? (guardians ?? []).find((g) => g.email) ?? null;
  if (signerKind === "guardian" && !guardian) return { error: "Add a parent or guardian (with an email address) to this student first." };

  const validFrom = str(formData, "valid_from") || enrollment?.starts_on || todayStr(settings.school_timezone);
  const validTo = str(formData, "valid_to") || enrollment?.ends_on || null;
  if (!isDateStr(validFrom) || (validTo && (!isDateStr(validTo) || validTo < validFrom))) return { error: "Check the start and end dates." };
  const tuition = enrollment ? Number(enrollment.price) : null;
  const currency = enrollment?.currency ?? settings.currency;
  const paymentTerms = str(formData, "payment_terms") || `Payment within ${settings.invoice_due_days} days of the invoice date.`;
  const signerName = signerKind === "guardian" ? guardian!.full_name : student.full_name;

  const values = mergeValues({
    schoolName: site.name,
    studentName: student.full_name,
    signerName,
    courseName: (enrollment?.course as { name: string } | null)?.name ?? (sp?.course as unknown as { name: string } | null)?.name ?? null,
    packageName: enrollment?.package_name ?? null,
    classesTotal: enrollment?.classes_total ?? null,
    classMinutes: enrollment?.class_minutes ?? null,
    classesPerWeek: enrollment?.classes_per_week ?? null,
    tuition,
    currency,
    paymentTerms,
    validFrom,
    validTo,
    lateCancelHours: settings.late_cancel_hours,
    today: todayStr(settings.school_timezone),
  });

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      student_id: studentId,
      enrollment_id: enrollmentId,
      template_version: tpl.version,
      title: enrollment ? `${tpl.title}: ${enrollment.package_name}` : tpl.title,
      body: renderTemplate(tpl.body, values),
      tuition,
      currency,
      payment_terms: paymentTerms,
      valid_from: validFrom,
      valid_to: validTo,
      signer_kind: signerKind,
      guardian_id: signerKind === "guardian" ? guardian!.id : null,
      signer_name: signerName,
      signer_email: signerKind === "guardian" ? guardian!.email : null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbMsg(error) };
  refresh();
  redirect(`/admin/contracts/${data.id}`);
}

export async function updateContractDraft(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const title = str(formData, "title");
  const body = String(formData.get("body") ?? "").trim();
  const validFrom = str(formData, "valid_from");
  const validTo = str(formData, "valid_to") || null;
  if (!title || !body) return { error: "The contract needs a title and text." };
  if (!isDateStr(validFrom) || (validTo && (!isDateStr(validTo) || validTo < validFrom))) return { error: "Check the start and end dates." };
  const patch: Record<string, unknown> = { title, body, valid_from: validFrom, valid_to: validTo, payment_terms: str(formData, "payment_terms") };
  const guardianId = str(formData, "guardian_id");
  if (guardianId) {
    const { data: g } = await supabase.from("guardians").select("id, full_name, email").eq("id", guardianId).maybeSingle();
    if (!g) return { error: "Guardian not found." };
    Object.assign(patch, { guardian_id: g.id, signer_name: g.full_name, signer_email: g.email });
  }
  const { error, data } = await supabase.from("contracts").update(patch).eq("id", id).eq("status", "draft").select("id");
  if (error) return { error: dbMsg(error) };
  if (!data?.length) return { error: "Only drafts can be edited." };
  refresh(id);
  return { ok: true, message: "Draft saved." };
}

export async function deleteDraftContract(id: string) {
  const { supabase } = await requireRole("admin");
  await supabase.from("contracts").delete().eq("id", id).eq("status", "draft");
  refresh();
  redirect("/admin/contracts");
}

// ---------------------------------------------------------------------------
// Sending (CON-02)
// ---------------------------------------------------------------------------
async function issueGuardianLink(c: Pick<Contract, "id" | "title" | "signer_name" | "signer_email" | "contract_number">, studentName: string) {
  const token = randomBytes(32).toString("base64url");
  const db = createAdminClient();
  const { error } = await db.from("contract_sign_tokens").upsert({
    contract_id: c.id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString(),
  });
  if (error) throw new Error(error.message);
  const url = siteUrl(`/sign/${token}`);
  if (!emailConfigured()) return { url, emailed: false };
  await sendDirectEmail({
    to: c.signer_email!,
    subject: `Please sign: ${c.title}`,
    lines: [
      `Hello ${c.signer_name},`,
      `${site.name} has sent the enrollment agreement for ${studentName} (${c.contract_number}). Please read it and sign it online.`,
      `This link is for you only and works for ${TOKEN_DAYS} days. You don't need an account.`,
    ],
    link: { url, label: "Read and sign" },
  });
  return { url, emailed: true };
}

export async function sendContract(id: string): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const { data: c } = await supabase.from("contracts").select("*, student:profiles!contracts_student_id_fkey(id, full_name)").eq("id", id).maybeSingle();
  if (!c) return { error: "Contract not found." };
  const contract = c as Contract;
  if (contract.status !== "draft") return { error: "This contract was already sent." };
  if (contract.signer_kind === "self") {
    const { data: contact } = await supabase.from("profile_contacts").select("email").eq("user_id", contract.student_id).maybeSingle();
    await supabase.from("contracts").update({ signer_name: contract.student!.full_name, signer_email: contact?.email ?? null }).eq("id", id);
  }
  const { error } = await supabase.from("contracts").update({ status: "sent" }).eq("id", id);
  if (error) return { error: dbMsg(error) };
  refresh(id);
  // Once sent, the page no longer shows the Send section, so its message would vanish with it.
  // Show the outcome on the contract page instead (it may hold the link to share by hand).
  let notice: string;
  let tone = "ok";
  if (contract.signer_kind === "self") notice = "Sent. The student will see it in their portal and get a notification.";
  else {
    try {
      const r = await issueGuardianLink(contract, contract.student!.full_name);
      notice = r.emailed
        ? `Sent. ${contract.signer_name} has been emailed a signing link.`
        : `Sent, but email isn't set up, so nothing was emailed. Share this one-time link with ${contract.signer_name} yourself: ${r.url}`;
    } catch (e) {
      tone = "error";
      notice = `The contract is marked as sent, but the email failed: ${(e as Error).message}. Use "Send a new link".`;
    }
  }
  redirect(`/admin/contracts/${id}?notice=${encodeURIComponent(notice)}&tone=${tone}`);
}

export async function resendGuardianLink(id: string): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const { data: c } = await supabase.from("contracts").select("*, student:profiles!contracts_student_id_fkey(id, full_name)").eq("id", id).maybeSingle();
  if (!c) return { error: "Contract not found." };
  const contract = c as Contract;
  if (contract.status !== "sent" || contract.signer_kind !== "guardian") return { error: "Only contracts waiting for a guardian's signature have a link." };
  try {
    const r = await issueGuardianLink(contract, contract.student!.full_name);
    return r.emailed
      ? { ok: true, message: `A new link was emailed to ${contract.signer_email}. Older links no longer work.` }
      : { ok: true, message: `Email isn't set up. Share this one-time link yourself (older links no longer work): ${r.url}` };
  } catch (e) {
    return { error: `Could not send the link: ${(e as Error).message}` };
  }
}

export async function voidContract(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireRole("admin");
  const reason = str(formData, "reason");
  if (!reason) return { error: "Give a reason for voiding the contract." };
  const { error, data } = await supabase.from("contracts").update({ status: "void", void_reason: reason }).eq("id", id).select("id");
  if (error || !data?.length) return { error: dbMsg(error, "Contract not found.") };
  await createAdminClient().from("contract_sign_tokens").delete().eq("contract_id", id);
  refresh(id);
  return { ok: true, message: "Contract voided." };
}

// ---------------------------------------------------------------------------
// Signing (CON-02..03)
// ---------------------------------------------------------------------------
async function emailSignedCopy(contractId: string, to: string | null, viewerTz: string) {
  if (!to || !emailConfigured()) return;
  const db = createAdminClient();
  const [{ data: c }, { data: sig }] = await Promise.all([
    db.from("contracts").select("*, student:profiles!contracts_student_id_fkey(id, full_name)").eq("id", contractId).single(),
    db.from("contract_signatures").select("*").eq("contract_id", contractId).single(),
  ]);
  if (!c || !sig) return;
  const contract = c as Contract;
  const pdf = await contractPdf(contract, contract.student?.full_name ?? "", sig as Signature, viewerTz);
  await sendDirectEmail({
    to,
    subject: `Signed copy: ${contract.title}`,
    lines: [`Thank you for signing ${contract.contract_number}. Your signed copy is attached. Please keep it for your records.`],
    attachments: [{ filename: `${contract.contract_number}.pdf`, content: pdf }],
  }).catch(() => {});
}

export async function signAsStudent(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireRole("student");
  if (formData.get("agree") !== "on") return { error: "Tick the box to confirm you have read and agree to the contract." };
  const name = str(formData, "signer_name");
  // The student's own access rules decide whether they can see this contract at all.
  const { data: c } = await supabase.from("contracts").select("id, status, signer_kind, signer_email").eq("id", id).maybeSingle();
  if (!c) return { error: "Contract not found." };
  if (c.signer_kind !== "self") return { error: "This contract is signed by your parent or guardian." };
  const meta = await requestMeta();
  const { error } = await createAdminClient().rpc("record_contract_signature", {
    p_contract: id,
    p_user: profile.id,
    p_signer_name: name,
    p_relationship: "self",
    p_ip: meta.ip,
    p_user_agent: meta.ua,
  });
  if (error) return { error: dbMsg(error) };
  await emailSignedCopy(id, c.signer_email, profile.timezone);
  refresh(id);
  redirect("/student/contract?signed=1");
}

export async function signWithToken(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (formData.get("agree") !== "on") return { error: "Tick the box to confirm you have read and agree to the contract." };
  const db = createAdminClient();
  const { data: t } = await db.from("contract_sign_tokens").select("contract_id, expires_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!t || Date.parse(t.expires_at) < Date.now()) return { error: "This link has expired or was replaced. Please ask the school for a new one." };
  const meta = await requestMeta();
  const { data: c } = await db.from("contracts").select("signer_email").eq("id", t.contract_id).single();
  const { error } = await db.rpc("record_contract_signature", {
    p_contract: t.contract_id,
    p_user: null,
    p_signer_name: str(formData, "signer_name"),
    p_relationship: "guardian",
    p_ip: meta.ip,
    p_user_agent: meta.ua,
  });
  if (error) return { error: dbMsg(error) };
  await emailSignedCopy(t.contract_id, c?.signer_email ?? null, (await getBillingSettings(db)).school_timezone);
  refresh(t.contract_id);
  // The link is used up now, so re-rendering /sign/<token> would say it no longer works.
  redirect("/sign/done");
}

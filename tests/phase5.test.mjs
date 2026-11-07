// Phase 5 database tests: privacy of contracts, billing and teacher pay; the money rules
// (totals, balances, no overpayment, void instead of delete); package usage (OD-04);
// attendance (ATT-01..02); and contract signing (CON-02..03).
// Run against the LOCAL database only:  npm run test:rls
// Requires `npx supabase start` + `npx supabase db reset` (loads seed.sql).
// Invoices, payments and signed contracts can't be deleted (by design), so these tests void
// what they create and can be run again without a reset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  for (const line of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const URL = process.env.NEXT_SUPABASE_URL;
const ANON = process.env.NEXT_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(URL && ANON && SERVICE, "Set NEXT_SUPABASE_URL, NEXT_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");
assert.ok(/127\.0\.0\.1|localhost/.test(URL), "Refusing to run against a non-local database");

const ID = {
  admin: "00000000-0000-4000-a000-000000000001",
  maria: "00000000-0000-4000-a000-000000000011",
  james: "00000000-0000-4000-a000-000000000012",
  kenji: "00000000-0000-4000-a000-000000000021",
  ana: "00000000-0000-4000-a000-000000000022",
  minjun: "00000000-0000-4000-a000-000000000023",
};
const INV = { kenji: "50000000-0000-4000-a000-000000000001", ana: "50000000-0000-4000-a000-000000000002", minjun: "50000000-0000-4000-a000-000000000003" };
const CT = { kenji: "40000000-0000-4000-a000-000000000001", ana: "40000000-0000-4000-a000-000000000002", minjun: "40000000-0000-4000-a000-000000000003" };
const ENR = { kenji: "31000000-0000-4000-a000-000000000001", ana: "31000000-0000-4000-a000-000000000002" };

const clients = new Map();
async function as(email) {
  if (clients.has(email)) return clients.get(email);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "Password123!" });
  assert.equal(error, null, `login failed for ${email}`);
  clients.set(email, c);
  return c;
}
const svc = () => createClient(URL, SERVICE, { auth: { persistSession: false } });
const admin = () => as("admin@school.test");
const kenji = () => as("student1@school.test");
const ana = () => as("student2@school.test");
const maria = () => as("teacher1@school.test");
const james = () => as("teacher2@school.test");
const ids = (rows, k = "id") => (rows ?? []).map((r) => r[k]).sort();

// A class at 03:00 Manila time n days from today: never overlaps the seeded classes.
function slot(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 19, 7 + Math.floor(Math.random() * 40))); // 03:xx Manila next day
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 50 * 60000).toISOString() };
}
async function newClass(days, teacher = ID.james, student = ID.ana) {
  const { data, error } = await (await admin()).from("class_sessions").insert({ teacher_id: teacher, student_id: student, ...slot(days) }).select("*").single();
  assert.equal(error, null, error?.message);
  return data;
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------
test("students see only their own packages, invoices, payments and contracts", async () => {
  const k = await kenji();
  assert.deepEqual(ids((await k.from("invoices").select("id")).data), [INV.kenji]);
  assert.ok((await k.from("payments").select("student_id")).data.every((p) => p.student_id === ID.kenji));
  assert.deepEqual(ids((await k.from("enrollments").select("student_id")).data, "student_id"), [ID.kenji]);
  const mine = (await k.from("contracts").select("id, student_id")).data;
  assert.ok(mine.some((c) => c.id === CT.kenji) && mine.every((c) => c.student_id === ID.kenji), "own contracts only");
  assert.equal((await k.from("invoice_items").select("id").eq("invoice_id", INV.ana)).data.length, 0, "can't read another student's invoice lines");
  assert.equal((await k.from("contract_signatures").select("id").eq("contract_id", CT.ana)).data.length, 0, "can't read Ana's signature");
  assert.equal((await k.from("enrollment_usage").select("enrollment_id").eq("enrollment_id", ENR.ana)).data.length, 0);
  assert.equal((await k.from("teacher_rates").select("teacher_id")).data.length, 0, "teacher pay is admin only");
  assert.equal((await k.from("teacher_payouts").select("id")).data.length, 0);
  assert.equal((await k.from("contract_sign_tokens").select("contract_id")).data.length, 0);
});

test("teachers see no prices, invoices, contracts or pay, only classes left for their own students", async () => {
  const m = await maria();
  for (const t of ["invoices", "invoice_items", "payments", "enrollments", "contracts", "contract_signatures", "teacher_rates", "teacher_payouts", "contract_templates"]) {
    assert.equal((await m.from(t).select("*").limit(5)).data.length, 0, `teacher must not read ${t}`);
  }
  assert.equal((await m.rpc("classes_left", { p_student: ID.kenji })).data, 18, "Kenji: 20 classes, 2 used");
  assert.equal((await m.rpc("classes_left", { p_student: ID.ana })).data, null, "Ana isn't Maria's student");
  assert.equal((await m.from("teacher_payouts").select("id").eq("teacher_id", ID.maria)).data.length, 0, "not even their own pay");
});

test("draft contracts are invisible to the student; templates are admin only", async () => {
  const a = await admin();
  const { data: draft } = await a
    .from("contracts")
    .insert({ student_id: ID.kenji, title: "Draft test", body: "Body", valid_from: "2026-01-01", created_by: ID.admin })
    .select("id")
    .single();
  try {
    assert.equal((await (await kenji()).from("contracts").select("id").eq("id", draft.id)).data.length, 0);
    assert.ok((await (await kenji()).from("contract_templates").insert({ version: 999, title: "x", body: "y" })).error, "students can't add templates");
    assert.ok((await a.from("contract_templates").update({ body: "changed" }).eq("version", 1)).error, "templates are immutable");
  } finally {
    await a.from("contracts").delete().eq("id", draft.id);
  }
});

// ---------------------------------------------------------------------------
// Money rules
// ---------------------------------------------------------------------------
test("students can't pay, edit or sign anything themselves", async () => {
  const k = await kenji();
  assert.ok((await k.from("payments").insert({ invoice_id: INV.kenji, student_id: ID.kenji, amount: 6000, method: "cash" })).error);
  const up = await k.from("invoices").update({ status: "paid" }).eq("id", INV.kenji).select();
  assert.ok(up.error || up.data.length === 0, "invoice update must affect no rows");
  assert.ok((await k.from("contract_signatures").insert({ contract_id: CT.kenji, signer_name: "Kenji", signer_relationship: "self", consent: true, document_hash: "x" })).error);
  assert.ok((await k.rpc("record_contract_signature", { p_contract: CT.kenji, p_user: ID.kenji, p_signer_name: "Kenji Tanaka", p_relationship: "self", p_ip: null, p_user_agent: null })).error, "signing goes through the server only");
  assert.ok((await k.rpc("create_invoice", { p_student: ID.kenji, p_enrollment: null, p_due: "2030-01-01", p_currency: "PHP", p_notes: "", p_items: [{ description: "x", unit_price: -1 }] })).error);
  assert.ok((await k.rpc("generate_billing_notifications")).error, "students can't run the billing job");
  const { data } = await (await admin()).from("invoices").select("status, amount_paid").eq("id", INV.kenji).single();
  assert.deepEqual(data, { status: "partially_paid", amount_paid: 6000 });
});

test("invoices: totals and status follow items and payments; no overpaying; void, never delete", async () => {
  const a = await admin();
  const { data: id, error } = await a.rpc("create_invoice", {
    p_student: ID.ana,
    p_enrollment: ENR.ana,
    p_due: "2030-01-31",
    p_currency: "PHP",
    p_notes: "test",
    p_items: [
      { description: "Classes", quantity: 2, unit_price: 1000 },
      { description: "Discount", quantity: 1, unit_price: -250.5 },
    ],
  });
  assert.equal(error, null, error?.message);
  const get = async () => (await a.from("invoices").select("total, amount_paid, status").eq("id", id).single()).data;
  assert.deepEqual(await get(), { total: 1749.5, amount_paid: 0, status: "unpaid" });

  const note = await (await ana()).from("notifications").select("title, body").eq("dedupe_key", `invoice:${id}`).single();
  assert.match(note.data.body, /PHP 1,749\.50/, "student is told the real total");

  // Typing a total or status by hand is ignored: they're always recomputed.
  await a.from("invoices").update({ total: 1, status: "paid" }).eq("id", id);
  assert.deepEqual(await get(), { total: 1749.5, amount_paid: 0, status: "unpaid" });

  const over = await a.from("payments").insert({ invoice_id: id, student_id: ID.ana, amount: 2000, method: "cash" });
  assert.match(over.error?.message ?? "", /more than the balance/);

  const { data: p1 } = await a.from("payments").insert({ invoice_id: id, student_id: ID.kenji, amount: 1000, method: "gcash" }).select("*").single();
  assert.equal(p1.student_id, ID.ana, "payment always belongs to the invoice's student");
  assert.match(p1.receipt_number, /^OR-\d{4}-\d{5}$/);
  assert.deepEqual(await get(), { total: 1749.5, amount_paid: 1000, status: "partially_paid" });

  assert.ok((await a.from("invoice_items").insert({ invoice_id: id, description: "late fee", unit_price: 1 })).error, "items frozen after a payment");
  assert.ok((await a.from("payments").update({ amount: 1 }).eq("id", p1.id)).error, "payments can't be edited");
  // No delete policy for admins, and the trigger refuses even the server (which skips policies).
  assert.equal((await a.from("payments").delete().eq("id", p1.id).select()).data.length, 0, "admins can't delete payments");
  assert.ok((await svc().from("payments").delete().eq("id", p1.id)).error, "even the server can't delete a payment");
  assert.equal((await a.from("invoices").delete().eq("id", id).select()).data.length, 0, "admins can't delete invoices");
  assert.ok((await svc().from("invoices").delete().eq("id", id)).error, "even the server can't delete an invoice");
  assert.ok((await a.from("invoices").update({ status: "void", void_reason: "x" }).eq("id", id)).error, "can't void with payments on it");

  const { data: p2 } = await a.from("payments").insert({ invoice_id: id, student_id: ID.ana, amount: 749.5, method: "cash" }).select("id").single();
  assert.equal((await get()).status, "paid");

  assert.equal((await a.from("payments").update({ voided_at: new Date().toISOString(), void_reason: "entered twice" }).eq("id", p2.id)).error, null);
  assert.deepEqual(await get(), { total: 1749.5, amount_paid: 1000, status: "partially_paid" }, "voiding a payment reopens the balance");
  assert.ok((await a.from("payments").update({ voided_at: null }).eq("id", p2.id)).error, "a void can't be undone");

  await a.from("payments").update({ voided_at: new Date().toISOString(), void_reason: "test cleanup" }).eq("id", p1.id);
  assert.equal((await a.from("invoices").update({ status: "void", void_reason: "test" }).eq("id", id)).error, null);
  assert.ok((await a.from("invoices").update({ notes: "x" }).eq("id", id)).error, "void invoices are final");
  const audit = await a.from("audit_log").select("action").in("entity_id", [id, p1.id, p2.id]);
  assert.deepEqual([...new Set(audit.data.map((r) => r.action))].sort(), ["invoice.create", "invoice.void", "payment.record", "payment.void"]);
});

// ---------------------------------------------------------------------------
// Package usage (OD-04) and attendance (ATT-01..02)
// ---------------------------------------------------------------------------
test("late student cancellations use up a class; early ones, teacher absences and school cancellations don't", async () => {
  const j = await james();
  const a = await admin();
  const made = [];
  try {
    const late = await newClass(-10);
    made.push(late.id);
    assert.equal(late.enrollment_id, ENR.ana, "new classes join the student's current package");
    await j.from("class_sessions").update({ status: "cancelled", status_reason: "sick", cancel_requested_by: "student" }).eq("id", late.id);
    let row = (await a.from("class_sessions").select("counts_as_used, late_cancel, attendance(mark)").eq("id", late.id).single()).data;
    assert.deepEqual(row, { counts_as_used: true, late_cancel: true, attendance: { mark: "cancelled" } });

    const early = await newClass(20);
    made.push(early.id);
    await j.from("class_sessions").update({ status: "cancelled", status_reason: "trip", cancel_requested_by: "student" }).eq("id", early.id);
    row = (await a.from("class_sessions").select("counts_as_used, late_cancel").eq("id", early.id).single()).data;
    assert.deepEqual(row, { counts_as_used: false, late_cancel: false }, "more than 24 h ahead");

    const school = await newClass(-11);
    made.push(school.id);
    await j.from("class_sessions").update({ status: "cancelled", status_reason: "holiday", cancel_requested_by: "school" }).eq("id", school.id);
    assert.equal((await a.from("class_sessions").select("counts_as_used").eq("id", school.id).single()).data.counts_as_used, false);

    const absent = await newClass(-12);
    made.push(absent.id);
    await a.from("class_sessions").update({ status: "teacher_absent" }).eq("id", absent.id);
    row = (await a.from("class_sessions").select("counts_as_used, attendance(mark)").eq("id", absent.id).single()).data;
    assert.deepEqual(row, { counts_as_used: false, attendance: null }, "teacher absence: no charge and no mark");

    const usage = (await (await ana()).from("enrollment_usage").select("used").eq("enrollment_id", ENR.ana).single()).data;
    assert.equal(usage.used, 1, "only the late cancellation counts");
  } finally {
    await a.from("class_sessions").delete().in("id", made);
  }
});

test("attendance follows the class; the teacher can mark late but not change charges", async () => {
  const j = await james();
  const a = await admin();
  const c = await newClass(-13);
  try {
    await j.from("class_sessions").update({ status: "completed" }).eq("id", c.id);
    let att = (await j.from("attendance").select("mark, minutes_late").eq("session_id", c.id).single()).data;
    assert.deepEqual(att, { mark: "present", minutes_late: null });
    assert.equal((await j.from("attendance").update({ mark: "late", minutes_late: 12 }).eq("session_id", c.id)).error, null);
    att = (await (await ana()).from("attendance").select("mark, minutes_late").eq("session_id", c.id).single()).data;
    assert.deepEqual(att, { mark: "late", minutes_late: 12 }, "the student sees their own attendance");
    assert.ok((await j.from("attendance").update({ mark: "absent", minutes_late: null }).eq("session_id", c.id)).error, "mark must match the class status");
    assert.equal((await (await maria()).from("attendance").update({ note: "x" }).eq("session_id", c.id).select()).data.length, 0, "another teacher can't edit");
    assert.equal((await (await maria()).from("attendance").select("session_id").eq("session_id", c.id)).data.length, 0, "or even see it");

    await j.from("class_sessions").update({ counts_as_used: false, enrollment_id: null }).eq("id", c.id);
    let s = (await a.from("class_sessions").select("counts_as_used, enrollment_id").eq("id", c.id).single()).data;
    assert.deepEqual(s, { counts_as_used: true, enrollment_id: ENR.ana }, "teachers can't change charges or packages");

    await a.from("class_sessions").update({ counts_as_used: false }).eq("id", c.id);
    s = (await a.from("class_sessions").select("counts_as_used").eq("id", c.id).single()).data;
    assert.equal(s.counts_as_used, false, "admins can override");
    const log = await a.from("audit_log").select("action").eq("entity_id", c.id).eq("action", "session.usage_override");
    assert.equal(log.data.length, 1, "overrides are audited");

    await a.from("class_sessions").update({ status: "scheduled" }).eq("id", c.id);
    assert.equal((await a.from("attendance").select("session_id").eq("session_id", c.id)).data.length, 0, "reopening clears the mark");
  } finally {
    await a.from("class_sessions").delete().eq("id", c.id);
  }
});

test("a rescheduled class stays in the same package", async () => {
  const a = await admin();
  const c = await newClass(25);
  let moved;
  try {
    const next = slot(26);
    const { data, error } = await (await james()).rpc("reschedule_session", { p_session: c.id, p_starts: next.starts_at, p_ends: next.ends_at });
    assert.equal(error, null, error?.message);
    moved = data;
    const row = (await a.from("class_sessions").select("enrollment_id").eq("id", moved).single()).data;
    assert.equal(row.enrollment_id, ENR.ana);
    assert.equal((await a.from("attendance").select("mark").eq("session_id", c.id).single()).data.mark, "rescheduled");
  } finally {
    if (moved) await a.from("class_sessions").delete().eq("id", moved);
    await a.from("class_sessions").delete().eq("id", c.id);
  }
});

// ---------------------------------------------------------------------------
// Contracts (CON-01..03)
// ---------------------------------------------------------------------------
test("contracts: frozen once sent, signed only through the signing function, then immutable", async () => {
  const a = await admin();
  const s = svc();
  const { data: c } = await a
    .from("contracts")
    .insert({ student_id: ID.ana, title: "Test agreement", body: "## Terms\nBe kind.", valid_from: "2026-01-01", signer_name: "Ana Reyes", created_by: ID.admin })
    .select("id")
    .single();
  try {
    assert.ok((await a.from("contracts").update({ status: "signed" }).eq("id", c.id)).error, "draft can't jump to signed");
    assert.equal((await a.from("contracts").update({ status: "sent" }).eq("id", c.id)).error, null);
    const sent = (await a.from("contracts").select("document_hash, sent_at").eq("id", c.id).single()).data;
    assert.match(sent.document_hash, /^[0-9a-f]{64}$/);
    assert.ok((await a.from("contracts").update({ body: "Different terms" }).eq("id", c.id)).error, "text frozen after sending");
    assert.ok((await a.from("contracts").update({ document_hash: "0".repeat(64) }).eq("id", c.id).select()).data?.[0]?.document_hash !== "0".repeat(64), "hash can't be overwritten");
    assert.ok((await a.from("contracts").update({ status: "signed" }).eq("id", c.id)).error, "admins can't mark it signed");
    assert.ok((await a.from("contracts").delete().eq("id", c.id)).error, "sent contracts can't be deleted");
    assert.equal((await (await ana()).from("contracts").select("id").eq("id", c.id)).data.length, 1, "student sees it once sent");

    const wrong = await s.rpc("record_contract_signature", { p_contract: c.id, p_user: ID.kenji, p_signer_name: "Kenji", p_relationship: "self", p_ip: "1.2.3.4", p_user_agent: "t" });
    assert.match(wrong.error?.message ?? "", /Only the student/);
    const asGuardian = await s.rpc("record_contract_signature", { p_contract: c.id, p_user: null, p_signer_name: "Someone", p_relationship: "guardian", p_ip: null, p_user_agent: null });
    assert.ok(asGuardian.error, "an adult's contract can't be signed as guardian");
    const ok = await s.rpc("record_contract_signature", { p_contract: c.id, p_user: ID.ana, p_signer_name: " Ana Reyes ", p_relationship: "self", p_ip: "1.2.3.4", p_user_agent: "test-agent" });
    assert.equal(ok.error, null, ok.error?.message);
    const signed = (await a.from("contracts").select("status, signed_at").eq("id", c.id).single()).data;
    assert.equal(signed.status, "signed");
    const sig = (await (await ana()).from("contract_signatures").select("signer_name, ip, document_hash, signed_by_user").eq("contract_id", c.id).single()).data;
    assert.deepEqual(sig, { signer_name: "Ana Reyes", ip: "1.2.3.4", document_hash: sent.document_hash, signed_by_user: ID.ana });
    assert.ok((await s.from("contract_signatures").delete().eq("contract_id", c.id)).error, "even the server can't remove a signature");
    assert.ok((await s.rpc("record_contract_signature", { p_contract: c.id, p_user: ID.ana, p_signer_name: "Ana Reyes", p_relationship: "self", p_ip: null, p_user_agent: null })).error, "can't sign twice");
    const notes = await a.from("notifications").select("type").eq("dedupe_key", `contract_signed:${c.id}`).eq("user_id", ID.admin);
    assert.equal(notes.data.length, 1, "admins hear about the signature");
  } finally {
    await a.from("contracts").update({ status: "void", void_reason: "test" }).eq("id", c.id);
  }
});

test("a minor's contract can only be signed as guardian, and only by the server", async () => {
  const s = svc();
  const self = await s.rpc("record_contract_signature", { p_contract: CT.minjun, p_user: ID.minjun, p_signer_name: "Min-jun Park", p_relationship: "self", p_ip: null, p_user_agent: null });
  assert.match(self.error?.message ?? "", /guardian/);
  const mj = await as("student3@school.test");
  assert.ok((await mj.rpc("record_contract_signature", { p_contract: CT.minjun, p_user: null, p_signer_name: "Ji-woo Park", p_relationship: "guardian", p_ip: null, p_user_agent: null })).error);
  const g = (await (await admin()).from("contracts").select("status, signer_kind").eq("id", CT.minjun).single()).data;
  assert.deepEqual(g, { status: "sent", signer_kind: "guardian" });
});

// ---------------------------------------------------------------------------
// Teacher pay (PAY-08) and the billing job
// ---------------------------------------------------------------------------
test("teacher payouts: worked out from used classes; approved and paid ones are protected", async () => {
  const a = await admin();
  // A random far-away month so reruns never collide with an earlier paid payout.
  const month = `${1900 + Math.floor(Math.random() * 100)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`;
  assert.equal((await (await maria()).rpc("calculate_teacher_payouts", { p_month: month })).error?.message.includes("administrator"), true);
  const { data: n, error } = await a.rpc("calculate_teacher_payouts", { p_month: month });
  assert.equal(error, null, error?.message);
  assert.equal(n, 2, "both teachers with a rate");
  const { data: p } = await a.from("teacher_payouts").select("*").eq("period_month", month).eq("teacher_id", ID.maria).single();
  assert.deepEqual([p.classes_count, Number(p.base_amount), p.status], [0, 0, "draft"]);
  await a.from("teacher_payouts").update({ adjustment: 500, adjustment_note: "bonus" }).eq("id", p.id);
  assert.equal(Number((await a.from("teacher_payouts").select("total").eq("id", p.id).single()).data.total), 500);
  assert.ok((await a.from("teacher_payouts").update({ status: "paid" }).eq("id", p.id)).error, "approve before paying");
  await a.from("teacher_payouts").update({ status: "approved" }).eq("id", p.id);
  assert.ok((await a.from("teacher_payouts").update({ adjustment: 9999 }).eq("id", p.id)).error, "approved amounts are locked");
  await a.rpc("calculate_teacher_payouts", { p_month: month });
  assert.equal(Number((await a.from("teacher_payouts").select("adjustment").eq("id", p.id).single()).data.adjustment), 500, "recalculating skips approved payouts");
  await a.from("teacher_payouts").update({ status: "paid" }).eq("id", p.id);
  const paid = (await a.from("teacher_payouts").select("status, paid_on").eq("id", p.id).single()).data;
  assert.equal(paid.status, "paid");
  assert.ok(paid.paid_on, "paid date is filled in");
  assert.ok((await a.from("teacher_payouts").update({ status: "draft" }).eq("id", p.id)).error, "paid is final");
  await a.from("teacher_payouts").delete().eq("period_month", month).eq("status", "draft");
});

test("this month's payout counts Maria's used classes", async () => {
  const a = await admin();
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const existing = (await a.from("teacher_payouts").select("status").eq("period_month", month).eq("teacher_id", ID.maria).maybeSingle()).data;
  if (existing && existing.status !== "draft") return; // left approved/paid by someone testing by hand
  await a.rpc("calculate_teacher_payouts", { p_month: month });
  const { data: p } = await a.from("teacher_payouts").select("classes_count, base_amount, rate").eq("period_month", month).eq("teacher_id", ID.maria).single();
  // Seeded used classes are 2–7 days ago in Asia/Manila; count those that fall in this month.
  const { data: s } = await a.rpc("billing_settings");
  assert.equal(s.school_timezone, "Asia/Manila");
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3600000);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 8 * 3600000);
  const { data: used } = await a.from("class_sessions").select("id").eq("teacher_id", ID.maria).eq("counts_as_used", true).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString());
  assert.equal(p.classes_count, used.length);
  assert.equal(Number(p.base_amount), used.length * Number(p.rate));
  await a.from("teacher_payouts").delete().eq("period_month", month).eq("status", "draft");
});

test("billing job: overdue reminders once a week, due-soon reminders once", async () => {
  const s = svc();
  assert.equal((await s.rpc("generate_billing_notifications")).error, null);
  await s.rpc("generate_billing_notifications");
  const overdue = await s.from("notifications").select("title").eq("user_id", ID.kenji).like("dedupe_key", `inv_overdue:${INV.kenji}:%`);
  assert.equal(overdue.data.length, 1, "Kenji's part-paid invoice is overdue: one reminder this week");
  assert.match(overdue.data[0].title, /overdue/);
  const soon = await s.from("notifications").select("id").eq("user_id", ID.minjun).eq("dedupe_key", `inv_due:${INV.minjun}`);
  assert.equal(soon.data.length, 1, "Min-jun's invoice is due in two days");
  const none = await s.from("notifications").select("id").eq("user_id", ID.ana).eq("type", "payment_reminder");
  assert.equal(none.data.length, 0, "Ana has paid");
});

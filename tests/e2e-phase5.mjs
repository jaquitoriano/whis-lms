// Browser end-to-end test of Phase 5: invoices and payments with PDFs, the student's classes and
// payments page, contract signing by a student and by a guardian (email link via Mailpit),
// teacher attendance (late) and a late student cancellation, and access checks.
// Needs the app running (npm run dev, or npm run build && npm start), `supabase start` (Mailpit)
// and a seeded LOCAL database. First run: npx playwright install chromium
// Then: npm run test:e2e:phase5   (safe to run repeatedly: it voids what it creates)
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_SUPABASE_URL)) throw new Error("E2E tests run against the local database only");
const svc = createClient(env.NEXT_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const ID = {
  james: "00000000-0000-4000-a000-000000000012",
  kenji: "00000000-0000-4000-a000-000000000021",
  ana: "00000000-0000-4000-a000-000000000022",
  minjun: "00000000-0000-4000-a000-000000000023",
};
const INV_KENJI = "50000000-0000-4000-a000-000000000001";
const INV_ANA = "50000000-0000-4000-a000-000000000002";
const ENR_ANA = "31000000-0000-4000-a000-000000000002";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
};
async function login(browser, email, viewport) {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await page.goto(B + "/login");
  await page.fill("#email", email);
  await page.fill("#password", "Password123!");
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  return page;
}
const main = (p) => p.textContent("main");
const isPdf = async (res) => res.status() === 200 && res.headers()["content-type"] === "application/pdf" && (await res.body()).subarray(0, 5).toString() === "%PDF-";
async function newestMail(query) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`)).json();
    const m = (r.messages ?? []).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (m) return (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    await new Promise((res) => setTimeout(res, 300));
  }
  return null;
}
// A class for James and Ana that doesn't overlap anything (tries a few minutes apart).
async function makeClass(fromNowMin) {
  for (let i = 0; i < 12; i++) {
    const start = new Date(Date.now() + (fromNowMin + i * 61) * 60000);
    const { data } = await svc
      .from("class_sessions")
      .insert({ teacher_id: ID.james, student_id: ID.ana, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 50 * 60000).toISOString() })
      .select("id")
      .maybeSingle();
    if (data) return data.id;
  }
  throw new Error("no free slot");
}

// CHROMIUM_PATH: use an already-installed Chromium when the matching Playwright build can't be downloaded.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const made = { contracts: [], classes: [], invoices: [] };
try {
  const admin = await login(browser, "admin@school.test");

  // 1. Admin billing pages render with the seeded data
  await admin.goto(B + "/admin/billing?status=all");
  let text = await main(admin);
  ok("admin sees all seeded invoices", ["INV-2026-00001", "INV-2026-00002", "INV-2026-00003"].every((n) => text.includes(n)));
  ok("overdue invoice is flagged", text.includes("Overdue"));
  for (const path of ["/admin/billing/packages", "/admin/billing/teacher-pay", `/admin/billing/statements?student=${ID.kenji}`, "/admin/attendance", "/admin/contracts?tab=all", "/admin/contracts/templates", `/admin/users/${ID.kenji}?role=student`]) {
    const res = await admin.goto(B + path);
    const body = await main(admin);
    ok(`admin page loads: ${path}`, res.status() === 200 && !/Something went wrong|Application error/.test(body), `status ${res.status()}`);
  }
  await admin.goto(B + `/admin/users/${ID.kenji}?role=student`);
  ok("student page shows classes left", (await main(admin)).includes("18 left"));

  // 2. Admin creates an invoice in the UI, records a part payment, downloads PDFs
  await admin.goto(B + `/admin/billing/invoices/new?student=${ID.ana}&enrollment=${ENR_ANA}`);
  await admin.fill("input[name=desc_1]", "E2E materials");
  await admin.fill("input[name=price_1]", "250");
  await admin.click("button:has-text('Create and send invoice')");
  await admin.waitForURL(/\/admin\/billing\/invoices\/[0-9a-f-]{36}\?created=1/);
  const invoiceId = admin.url().match(/invoices\/([0-9a-f-]{36})/)[1];
  made.invoices.push(invoiceId);
  text = await main(admin);
  ok("invoice total is package + extra line", text.includes("PHP 8,050.00"), text.slice(0, 300));
  await admin.fill("#amount", "1000");
  await admin.selectOption("#method", "gcash");
  await admin.fill("#reference", "E2E-REF");
  await admin.click("button:has-text('Record payment')");
  await admin.waitForSelector("text=/Payment recorded\\. Receipt OR-/");
  text = await main(admin);
  ok("part payment leaves the right balance", text.includes("Partially paid") && text.includes("PHP 7,050.00"));
  ok("invoice PDF downloads", await isPdf(await admin.request.get(`${B}/api/pdf/invoice/${invoiceId}`)));
  const { data: pay } = await svc.from("payments").select("id").eq("invoice_id", invoiceId).single();
  ok("receipt PDF downloads", await isPdf(await admin.request.get(`${B}/api/pdf/receipt/${pay.id}`)));
  ok("statement PDF downloads", await isPdf(await admin.request.get(`${B}/api/pdf/statement?student=${ID.kenji}&month=${new Date().toISOString().slice(0, 7)}`)));
  const anaNote = await svc.from("notifications").select("body").eq("dedupe_key", `invoice:${invoiceId}`).single();
  ok("student was notified of the invoice", anaNote.data?.body.includes("PHP 8,050.00"));

  // 3. Student view and access checks
  const kenji = await login(browser, "student1@school.test");
  await kenji.goto(B + "/student/billing");
  text = await main(kenji);
  ok("student sees classes left and balance", text.includes("18") && text.includes("classes left") && text.includes("PHP 6,000.00"));
  ok("student sees their receipt", text.includes("OR-2026-00001"));
  ok("student can download own invoice", await isPdf(await kenji.request.get(`${B}/api/pdf/invoice/${INV_KENJI}`)));
  ok("student can't download another student's invoice", (await kenji.request.get(`${B}/api/pdf/invoice/${INV_ANA}`)).status() === 404);
  ok("student can't download another student's statement", (await kenji.request.get(`${B}/api/pdf/statement?student=${ID.ana}&month=2026-11`)).status() === 404);
  await kenji.goto(B + "/admin/billing");
  ok("student is kept out of admin billing", !kenji.url().includes("/admin"));

  // 4. Contract signed by the student in the portal
  await admin.goto(B + `/admin/contracts/new?student=${ID.kenji}`);
  await admin.click("button:has-text('Create draft')");
  await admin.waitForURL(/\/admin\/contracts\/[0-9a-f-]{36}$/);
  const cKenji = admin.url().split("/").pop();
  made.contracts.push(cKenji);
  ok("draft is filled in from the template and package", (await admin.inputValue("#body")).includes("IELTS 20 classes") && (await admin.inputValue("#body")).includes("Kenji Tanaka"));
  await admin.click("button:has-text('Send contract')");
  await admin.waitForSelector("text=/Sent\\. The student will see it/");
  await kenji.goto(B + "/student");
  ok("dashboard asks the student to sign", (await main(kenji)).includes("Please sign your enrollment agreement"));
  await kenji.goto(B + "/student/contract");
  await kenji.fill("#signer_name", "Kenji Tanaka");
  await kenji.check("input[name=agree]");
  await kenji.click("button:has-text('Sign contract')");
  await kenji.waitForURL(/signed=1/);
  ok("student sees the signed confirmation", (await main(kenji)).includes("Your contract is signed"));
  const copy = await newestMail(`to:student1@school.test subject:"Signed copy"`);
  ok("signed copy emailed with a PDF", copy?.Attachments?.some((a) => a.ContentType === "application/pdf"));
  const sig = await svc.from("contract_signatures").select("signer_name, ip, user_agent").eq("contract_id", cKenji).single();
  ok("signature recorded with browser details", sig.data?.signer_name === "Kenji Tanaka" && !!sig.data?.user_agent);
  await admin.goto(B + `/admin/contracts/${cKenji}`);
  ok("admin sees the signature", (await main(admin)).includes("Fingerprint matches the sent document") && (await main(admin)).includes("Yes"));

  // 5. Contract signed by a guardian through the emailed link (no login)
  await admin.goto(B + `/admin/contracts/new?student=${ID.minjun}`);
  await admin.click("button:has-text('Create draft')");
  await admin.waitForURL(/\/admin\/contracts\/[0-9a-f-]{36}$/);
  const cMinjun = admin.url().split("/").pop();
  made.contracts.push(cMinjun);
  await admin.click("button:has-text('Send contract')");
  await admin.waitForSelector("text=/has been emailed a signing link/");
  const invite = await newestMail(`to:jiwoo.park@example.com subject:"Please sign"`);
  const link = invite?.Text?.match(/https?:\/\/\S+\/sign\/[A-Za-z0-9_-]+/)?.[0];
  ok("guardian received a signing link", !!link);
  const guardian = await (await browser.newContext()).newPage();
  await guardian.goto(link.replace(/^https?:\/\/[^/]+/, B));
  ok("guardian sees the agreement without logging in", (await guardian.textContent("body")).includes("Sign as parent or guardian"));
  await guardian.fill("#signer_name", "Ji-woo Park");
  await guardian.check("input[name=agree]");
  await guardian.click("button:has-text('Sign contract')");
  const signedOk = await guardian.waitForURL(/\/sign\/done$/, { timeout: 15000 }).then(() => true, () => false);
  if (!signedOk) {
    if (process.env.E2E_SHOTS) await guardian.screenshot({ path: `${process.env.E2E_SHOTS}/guardian-sign.png`, fullPage: true });
    throw new Error(`guardian signing failed: ${(await guardian.textContent("body")).replace(/\s+/g, " ").slice(-600)}`);
  }
  ok("guardian signature recorded", (await svc.from("contracts").select("status").eq("id", cMinjun).single()).data?.status === "signed");
  ok("guardian sees the thank-you page", (await guardian.textContent("main")).includes("The contract is signed"));
  await guardian.goto(link.replace(/^https?:\/\/[^/]+/, B));
  ok("the link stops working after signing", (await guardian.textContent("body")).includes("doesn't work any more"));

  // 6. Teacher: late arrival and a late student cancellation
  const james = await login(browser, "teacher2@school.test");
  const past = await makeClass(-60 * 24 * 9);
  made.classes.push(past);
  await james.goto(B + `/teacher/classes/${past}`);
  await james.click("button:has-text('Completed, student late')");
  await james.fill("#minutes_late", "7");
  await james.click("button:has-text('Mark completed (late)')");
  await james.waitForSelector("text=7 minutes late");
  ok("teacher marks the student late", (await main(james)).includes("Used up a class."));
  const soon = await makeClass(120);
  made.classes.push(soon);
  await james.goto(B + `/teacher/classes/${soon}`);
  await james.click("button:has-text('Cancel class')");
  await james.check("input[name=requested_by][value=student]");
  ok("teacher is warned before a late cancellation", (await main(james)).includes("will use up one of the student's classes"));
  await james.fill("#reason", "Student asked to cancel");
  await james.click("button:has-text('Confirm cancellation')");
  await james.waitForSelector("text=/the student cancelled late/");
  ok("late cancellation used up a class", true);
  ok("teacher can't download invoices", (await james.request.get(`${B}/api/pdf/invoice/${INV_KENJI}`)).status() === 404);
  await james.goto(B + "/admin/billing");
  ok("teacher is kept out of admin billing", !james.url().includes("/admin"));

  // 7. Phone layout: no sideways scrolling on the new student pages
  const phone = await login(browser, "student2@school.test", { width: 390, height: 844 });
  for (const path of ["/student/billing", "/student/contract"]) {
    await phone.goto(B + path);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(`no horizontal scroll on phone: ${path}`, !wide);
  }
} catch (e) {
  ok("unexpected error", false, e.stack ?? e.message);
} finally {
  for (const id of made.contracts) await svc.from("contracts").update({ status: "void", void_reason: "e2e cleanup" }).eq("id", id).in("status", ["sent", "signed"]);
  for (const id of made.contracts) await svc.from("contracts").delete().eq("id", id).eq("status", "draft");
  for (const id of made.invoices) {
    await svc.from("payments").update({ voided_at: new Date().toISOString(), void_reason: "e2e cleanup" }).eq("invoice_id", id).is("voided_at", null);
    await svc.from("invoices").update({ status: "void", void_reason: "e2e cleanup" }).eq("id", id);
  }
  if (made.classes.length) await svc.from("class_sessions").delete().in("id", made.classes);
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

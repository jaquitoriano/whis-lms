// Browser end-to-end test of Phase 6: a teacher writes, saves and publishes a progress report;
// adds an IELTS mock result (live overall band) and deletes it; the student sees the report, chart
// and notification; a class conversation with a file attachment, the reply arriving without a
// reload; the admin's read-only view; and phone layouts.
// Needs the app running (npm run dev, or npm run build && npm start) and a seeded LOCAL database.
// First run: npx playwright install chromium. Then: npm run test:e2e:phase6 (safe to repeat: it
// removes the report, result and conversation it creates).
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
const KENJI = "00000000-0000-4000-a000-000000000021";
const S4 = "20000000-0000-4000-a000-000000000004"; // Kenji + Maria, upcoming
const stamp = Date.now().toString(36);

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

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const made = { reports: [], threads: [] };
try {
  const maria = await login(browser, "teacher1@school.test");
  const kenji = await login(browser, "student1@school.test");

  // 1. Progress report: start from the student's page, save a draft, then publish (PRG-01..02)
  await maria.goto(B + `/teacher/progress/${KENJI}`);
  await maria.click("button:has-text('Write progress report')");
  await maria.waitForURL(/\/teacher\/progress\/reports\//);
  made.reports.push(maria.url().split("/").pop());
  ok("new report starts from the last report's levels", (await maria.inputValue("#lvl-overall")) === "4");
  await maria.selectOption("#lvl-speaking", "5");
  await maria.selectOption("#lvl-overall", "4.5");
  await maria.fill("#summary", `E2E summary ${stamp}`);
  await maria.click("button:has-text('Save draft')");
  await maria.waitForSelector("text=Draft saved");
  ok("draft saved", true);
  await kenji.goto(B + "/student/progress");
  ok("student can't see the draft", !(await main(kenji)).includes(`E2E summary ${stamp}`));
  ok("typed text survives saving", (await maria.inputValue("#summary")) === `E2E summary ${stamp}`);
  await maria.click("button:has-text('Publish to student')");
  await maria.waitForURL(/\/teacher\/progress\/[^/]+\?published=1/);
  ok("published, back on the progress page", (await main(maria)).includes("Report published"));
  await kenji.goto(B + "/student/progress");
  let text = await main(kenji);
  ok("student sees the published report", text.includes(`E2E summary ${stamp}`) && text.includes("B2+"));
  ok("skill change shows the rise in Speaking", text.includes("from B2"));
  await kenji.goto(B + "/student/notifications");
  ok("student was notified", (await main(kenji)).includes("New progress report"));

  // 2. IELTS mock result with the live overall band, then delete it (PRG-03)
  await maria.goto(B + `/teacher/progress/${KENJI}`);
  for (const [k, v] of [["listening", "7"], ["reading", "7"], ["writing", "6.5"], ["speaking", "6.5"]]) await maria.selectOption(`#ielts-${k}`, v);
  ok("overall band shown while typing (6.75 -> 7.0)", (await maria.textContent("[aria-live=polite]")).trim() === "7.0");
  await maria.fill("#ielts-notes", `E2E mock ${stamp}`);
  await maria.click("button:has-text('Save result')");
  await maria.waitForSelector("text=Result saved");
  await maria.reload();
  const row = maria.locator("tr", { hasText: `E2E mock ${stamp}` });
  ok("result is in the table with overall 7.0", (await row.count()) === 1 && (await row.textContent()).includes("7.0"));
  await maria.waitForLoadState("networkidle");
  // Keyboard focus shows the same readout as hovering (and doesn't depend on where the mouse is).
  await maria.locator("#ielts svg[role=img]").first().focus();
  const tip = await maria
    .locator("#ielts [role=status]")
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  ok("IELTS chart shows its readout on keyboard focus", tip);
  await maria.keyboard.press("ArrowLeft");
  ok("arrow keys move the readout to the previous test", /Mock test|Diagnostic/.test((await maria.locator("#ielts [role=status]").first().textContent()) ?? ""));
  await kenji.goto(B + "/student/progress");
  ok("student sees the new result", (await main(kenji)).includes(`E2E mock ${stamp}`));
  await row.locator("button:has-text('Delete')").click();
  const gone = await maria
    .locator("tr", { hasText: `E2E mock ${stamp}` })
    .waitFor({ state: "detached", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  ok("teacher deleted the result", gone);

  // 3. Class conversation with an attachment; the reply arrives without a reload (MSG-01)
  await kenji.goto(B + `/student/classes/${S4}`);
  await kenji.click("button:has-text('Message about this class')");
  await kenji.waitForURL(/\/student\/messages\/[0-9a-f-]{36}$/);
  const thread = kenji.url().split("/").pop();
  made.threads.push(thread);
  ok("conversation is about the class", (await main(kenji)).includes("Class on"));
  await kenji.fill("#message-body", `Question from Kenji ${stamp}`);
  await kenji.setInputFiles("input[type=file]", { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
  await kenji.waitForSelector("text=Ready");
  await kenji.click("button:has-text('Send')");
  await kenji.waitForSelector(`text=Question from Kenji ${stamp}`);
  ok("student's message and file are shown", (await main(kenji)).includes("notes.pdf"));

  await maria.goto(B + "/teacher/messages");
  ok("teacher's menu shows unread conversations", (await maria.locator("nav [aria-label$='unread']").count()) > 0);
  await maria.goto(B + `/teacher/messages/${thread}`);
  text = await main(maria);
  ok("teacher reads the message and attachment", text.includes(`Question from Kenji ${stamp}`) && text.includes("notes.pdf"));
  const href = await maria.locator("a", { hasText: "notes.pdf" }).getAttribute("href");
  ok("attachment opens through a private signed link", /\/storage\/v1\/object\/sign\/messages\//.test(href ?? ""));
  await maria.fill("#message-body", `Reply from Maria ${stamp}`);
  await maria.click("button:has-text('Send')");
  await maria.waitForSelector(`text=Reply from Maria ${stamp}`);
  const arrived = await kenji
    .waitForSelector(`text=Reply from Maria ${stamp}`, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  ok("reply appears on the student's open page within 20 s", arrived);

  // 4. Admin: read-only, and the visit is logged
  const admin = await login(browser, "admin@school.test");
  await admin.goto(B + `/admin/messages/${thread}`);
  ok("admin can read it", (await main(admin)).includes(`Reply from Maria ${stamp}`));
  ok("admin has no reply box", (await admin.locator("#message-body").count()) === 0);
  const { data: logged } = await svc.from("audit_log").select("id").eq("action", "messages.view").eq("entity_id", thread);
  ok("admin's visit is in the audit log", (logged ?? []).length >= 1);

  // 5. Phone layout: no sideways scrolling on the new pages
  const phone = await login(browser, "student1@school.test", { width: 390, height: 844 });
  const tphone = await login(browser, "teacher1@school.test", { width: 390, height: 844 });
  for (const [p, path] of [
    [phone, "/student/progress"],
    [phone, `/student/messages/${thread}`],
    [phone, "/student/messages"],
    [tphone, `/teacher/progress/${KENJI}`],
    [tphone, "/teacher/progress"],
    [tphone, `/teacher/progress/reports/${made.reports[0]}`],
  ]) {
    await p.goto(B + path);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(`no horizontal scroll on phone: ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, !wide);
  }
} catch (e) {
  ok("unexpected error", false, e.stack ?? e.message);
} finally {
  for (const id of made.threads) {
    const { data: files } = await svc.from("message_files").select("storage_path").eq("thread_id", id);
    if (files?.length) await svc.storage.from("messages").remove(files.map((f) => f.storage_path));
    await svc.from("message_threads").delete().eq("id", id);
  }
  if (made.reports.length) await svc.from("progress_reports").delete().in("id", made.reports);
  await svc.from("ielts_results").delete().like("notes", `E2E mock %`);
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

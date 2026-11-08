// Browser end-to-end test of Phase 7 (part 1): a teacher adds a class recording without sharing
// it, the student can't see it, the teacher shares it, the student opens it and is notified; the
// admin reports page with charts, period switch and CSV download; phone layouts.
// Needs the app running and a seeded LOCAL database. Then: npm run test:e2e:phase7 (safe to repeat).
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
const S1 = "20000000-0000-4000-a000-000000000001"; // Kenji + Maria, completed
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
const url = `https://zoom.us/rec/share/e2e-${stamp}`;
try {
  const maria = await login(browser, "teacher1@school.test");
  const kenji = await login(browser, "student1@school.test");

  // 1. Recording: add without sharing, then share (REC-01..02, OD-06)
  await maria.goto(B + `/teacher/classes/${S1}`);
  await maria.fill("input[name=rec_url]", url);
  await maria.fill("input[name=rec_passcode]", "Ab12");
  await maria.uncheck("input[name=rec_shared]");
  await maria.click("button:has-text('Add recording')");
  await maria.waitForSelector("text=The student can't see it until you share it");
  ok("teacher added a recording, not shared", (await main(maria)).includes("Not shared with the student"));
  await kenji.goto(B + `/student/classes/${S1}`);
  ok("student can't see an unshared recording", !(await kenji.content()).includes(url));
  await maria.click("button:has-text('Share with student')");
  await maria.waitForSelector("text=Shared with the student");
  await kenji.goto(B + `/student/classes/${S1}`);
  const link = kenji.locator(`a[href="${url}"]`);
  ok("student sees the shared recording link", (await link.count()) === 1);
  ok("link opens in a new tab safely", (await link.getAttribute("target")) === "_blank" && (await link.getAttribute("rel")).includes("noopener"));
  ok("passcode shown to the student", (await main(kenji)).includes("Ab12"));
  ok("no management buttons for the student", (await kenji.locator("button:has-text('Stop sharing')").count()) === 0);
  await kenji.goto(B + "/student/notifications");
  ok("student was notified", (await main(kenji)).includes("Class recording available"));
  await maria.goto(B + `/teacher/classes/${S1}`);
  await maria.locator("li", { hasText: "Ab12" }).locator("button:has-text('Remove')").click();
  const gone = await maria.locator("li", { hasText: "Ab12" }).waitFor({ state: "detached", timeout: 10000 }).then(() => true).catch(() => false);
  ok("teacher removed the recording", gone);

  // 2. Admin reports
  const admin = await login(browser, "admin@school.test");
  await admin.goto(B + "/admin/reports");
  let text = await main(admin);
  ok("reports page shows all sections", ["Classes completed", "Payments received", "Month by month", "Teachers", "Students who need a look"].every((s) => text.includes(s)));
  ok("6 months by default", (await admin.locator("tbody").first().locator("tr").count()) === 6);
  await admin.click("a:has-text('3 months')");
  await admin.waitForURL(/months=3/);
  ok("period switch to 3 months", (await admin.locator("tbody").first().locator("tr").count()) === 3);
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.locator("a:has-text('Download CSV')").first().click()]);
  const csv = (await (await download.createReadStream()).toArray()).join("");
  ok("monthly CSV downloads", download.suggestedFilename() === "monthly-report-3-months.csv" && csv.includes("Month,Classes completed"));

  // 3. Phone layouts
  const aphone = await login(browser, "admin@school.test", { width: 390, height: 844 });
  const sphone = await login(browser, "student1@school.test", { width: 390, height: 844 });
  for (const [p, path] of [[aphone, "/admin/reports"], [sphone, `/student/classes/${S1}`]]) {
    await p.goto(B + path);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(`no horizontal scroll on phone: ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, !wide);
  }
} catch (e) {
  ok("unexpected error", false, e.stack ?? e.message);
} finally {
  await svc.from("class_recordings").delete().like("url", "https://zoom.us/rec/share/e2e-%");
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

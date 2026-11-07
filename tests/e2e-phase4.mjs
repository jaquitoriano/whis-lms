// Browser end-to-end test of Phase 4: announcements -> bell -> notification centre,
// the scheduled job sending real email (to local Mailpit), email preferences,
// the class-policy gate and acceptance, and publishing a new policy version.
// Needs `npm run dev`, `supabase start` (Mailpit) and a seeded LOCAL database.
// First run: npx playwright install chromium    Then: npm run test:e2e:phase4
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
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
const MINJUN = "00000000-0000-4000-a000-000000000023";
const KENJI = "00000000-0000-4000-a000-000000000021";
const stamp = Date.now().toString(36);

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(cond);
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
};
async function login(browser, email) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(B + "/login");
  await page.fill("#email", email);
  await page.fill("#password", "Password123!");
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  return page;
}
const main = (p) => p.textContent("main");
const bellCount = async (p) => Number((await p.getAttribute("a[aria-label^='Notifications']", "aria-label")).match(/(\d+) unread/)?.[1] ?? 0);
// Remove rows that triggers deliberately protect (published policies), for test cleanup only.
const psql = (sql) =>
  execFileSync("docker", ["exec", "supabase_db_english-ielts-lms", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });

const browser = await chromium.launch();
let announcementId = null;
let publishedV2 = false;
try {
  // 1. Admin sends an announcement to all students
  const admin = await login(browser, "admin@school.test");
  const student = await login(browser, "student1@school.test");
  await student.goto(B + "/student");
  const before = await bellCount(student);

  await admin.goto(B + "/admin/announcements");
  await admin.fill("#title", `E2E maintenance ${stamp}`);
  await admin.fill("#body", "The website will be offline on **Saturday 06:00–07:00**.");
  await admin.selectOption("#audience", "all_students");
  await admin.click("main button:has-text('Send')");
  await admin.waitForURL(/sent=1/, { timeout: 15000 });
  const shown = await admin.waitForSelector(`main h3:has-text("E2E maintenance ${stamp}")`, { timeout: 10000 }).then(() => true, () => false);
  ok("admin sends an announcement", shown);
  announcementId = (await svc.from("announcements").select("id").eq("title", `E2E maintenance ${stamp}`).single()).data?.id;

  // 2. Student sees it: bell, notification centre, dashboard
  await student.goto(B + "/student");
  ok("student's bell count goes up", (await bellCount(student)) === before + 1, `before=${before} after=${await bellCount(student)}`);
  ok("announcement shows on the dashboard", (await main(student)).includes(`E2E maintenance ${stamp}`));
  await student.goto(B + "/student/notifications");
  await student.click(`main button:has-text('E2E maintenance ${stamp}')`);
  await student.waitForURL(/\/student\/announcements/, { timeout: 10000 });
  ok("opening the notification goes to the announcement", (await main(student)).includes("Saturday 06:00–07:00"));
  ok("opening it marks it read", (await bellCount(student)) === before);

  const teacher = await login(browser, "teacher1@school.test");
  await teacher.goto(B + "/teacher/announcements");
  ok("teachers don't see a students-only announcement", !(await main(teacher)).includes(`E2E maintenance ${stamp}`));

  // 3. Scheduled job sends email to Mailpit
  const run = await fetch(`${B}/api/cron/notifications`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  const out = await run.json();
  ok("scheduled job runs and sends email", run.ok && out.sent >= 1, JSON.stringify(out));
  const unauth = await fetch(`${B}/api/cron/notifications`);
  ok("scheduled job refuses calls without the secret", unauth.status === 401);
  const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"E2E maintenance ${stamp}"`)}`)).json();
  const toKenji = (search.messages ?? []).some((m) => m.To?.some((t) => t.Address === "student1@school.test"));
  ok("student received the announcement email", toKenji, `found ${search.messages_count ?? 0} messages`);
  const toTeacher = (search.messages ?? []).some((m) => m.To?.some((t) => t.Address === "teacher1@school.test"));
  ok("teacher did not receive it", !toTeacher);

  // 4. Email preferences
  await student.goto(B + "/student/settings");
  await student.uncheck("main input[name=email_materials_added]");
  await student.click("main button:has-text('Save preferences')");
  await student.waitForFunction(() => /Email preferences saved/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 10000 });
  const pref = (await svc.from("notification_preferences").select("email").eq("user_id", KENJI).eq("type", "materials_added").single()).data;
  ok("student turns off an email type", pref?.email === false);

  // 5. Policy gate: Min-jun must accept before anything else
  const minjun = await login(browser, "student3@school.test");
  await minjun.goto(B + "/student/homework");
  ok("student who hasn't accepted is sent to the policies", minjun.url().endsWith("/accept-policies"));
  await minjun.check("main input[name=agree]");
  await minjun.click("main button:has-text('Accept and continue')");
  await minjun.waitForURL(/policies=accepted/, { timeout: 10000 });
  await minjun.goto(B + "/student/homework");
  ok("after accepting, pages open normally", minjun.url().endsWith("/student/homework") && (await main(minjun)).includes("Past simple practice"));
  const acc = (await svc.from("policy_acceptances").select("ip, user_agent").eq("user_id", MINJUN).eq("version", 1).single()).data;
  ok("acceptance is recorded with browser details", !!acc?.user_agent);

  // 6. Admin publishes v2: students are asked again, teachers notified
  await admin.goto(B + "/admin/policies");
  const body = await admin.inputValue("#body");
  await admin.fill("#summary", "Late arrival changed to 10 minutes");
  await admin.fill("#body", body.replace("more than 15 minutes late", "more than 10 minutes late"));
  await admin.click("main button:has-text('Publish new version')");
  await admin.waitForURL(/published=1/, { timeout: 15000 });
  publishedV2 = true;
  ok("admin publishes version 2", await admin.waitForSelector("main :text('Current: version 2')", { timeout: 10000 }).then(() => true, () => false));
  await student.goto(B + "/student/calendar");
  ok("student is asked to accept the new version", student.url().endsWith("/accept-policies") && (await main(student)).includes("have been updated"));
  ok("new version shows the change", (await main(student)).includes("more than 10 minutes late"));
  await teacher.goto(B + "/teacher/notifications");
  ok("teacher is notified about the update", (await main(teacher)).includes("Class policies updated"));
} catch (e) {
  ok("unexpected error", false, e.message);
} finally {
  if (announcementId) await svc.from("announcements").delete().eq("id", announcementId);
  await svc.from("notification_preferences").delete().eq("user_id", KENJI);
  await svc.from("policy_acceptances").delete().eq("user_id", MINJUN);
  if (publishedV2) {
    psql("set session_replication_role = replica; delete from public.policy_acceptances where version > 1; delete from public.notifications where dedupe_key like 'policy:%' and dedupe_key <> 'policy:1'; delete from public.policies where version > 1;");
  }
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

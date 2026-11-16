// Browser end-to-end test of Phase 7b (automatic Zoom / Google Meet links), using the fake
// meeting service: the admin connects a teacher, books a class and sees the link made
// automatically; a failing account shows the reason and a retry button; the scheduled job
// deletes the meeting of a cancelled class and attaches a recording after class.
// Needs a seeded LOCAL database and the app running in test mode:
//   MEETINGS_FAKE=1 npm run dev     then     npm run test:e2e:phase7b   (safe to repeat)
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
const MARIA = "00000000-0000-4000-a000-000000000011";
const JAMES = "00000000-0000-4000-a000-000000000012";
const KENJI = "00000000-0000-4000-a000-000000000021";
const ANA = "00000000-0000-4000-a000-000000000022";

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
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
const cron = async () => (await fetch(`${B}/api/cron/notifications`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).json();
// Reload until the page shows the text (the link is made just after the response).
async function waitForText(page, text, tries = 15) {
  for (let i = 0; i < tries; i++) {
    if ((await page.textContent("main")).includes(text)) return true;
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "networkidle" });
  }
  return false;
}
async function bookAsAdmin(page, pair, date, time) {
  await page.goto(`${B}/admin/schedules/new`);
  await page.selectOption("#pair", pair);
  await page.fill("#date", date);
  await page.fill("#time", time);
  await page.check("input[name=override]");
  await page.click("main form button[type=submit]");
  await page.waitForURL(/\/admin\/classes\/[0-9a-f-]{36}$/, { timeout: 20000 });
  return page.url().split("/").pop();
}

const made = [];
const cleanup = async () => {
  if (made.length) await svc.from("class_sessions").delete().in("id", made);
  await svc.from("teacher_meeting_accounts").delete().in("teacher_id", [MARIA, JAMES]);
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await cleanup();
  const admin = await login(browser, "admin@school.test");

  // 1. Connect Maria to Zoom from her admin page.
  await admin.goto(`${B}/admin/users/${MARIA}`);
  await admin.selectOption("#provider", "zoom");
  await admin.fill("#account_email", "maria@zoom.example");
  await admin.click("section:has(h2:text('Online meetings')) form button[type=submit] >> nth=0");
  await admin.waitForLoadState("networkidle");
  ok("admin connects a teacher to Zoom", await waitForText(admin, "New classes for this teacher will get a link automatically", 3));
  const { data: acc } = await svc.from("teacher_meeting_accounts").select("provider, account_email").eq("teacher_id", MARIA).maybeSingle();
  ok("account saved", acc?.provider === "zoom" && acc.account_email === "maria@zoom.example", JSON.stringify(acc));

  // 2. Book a class without a link: a Zoom link appears on its own.
  const a = await bookAsAdmin(admin, `${MARIA}|${KENJI}`, "2031-04-07", "09:00");
  made.push(a);
  ok("class page says the link was created", await waitForText(admin, "Zoom link created automatically"));
  const join = await admin.getAttribute("a:text('Join class')", "href");
  ok("Join class opens the new meeting", join?.startsWith("https://meet.example.com/zoom/"), join);

  // 3. A failing account shows the reason and a retry button.
  await svc.from("teacher_meeting_accounts").upsert({ teacher_id: JAMES, provider: "google_meet", account_email: "fail@school.example", active: true });
  const b = await bookAsAdmin(admin, `${JAMES}|${ANA}`, "2031-04-08", "09:00");
  made.push(b);
  ok("failure is explained", await waitForText(admin, "could not be created"));
  ok("retry button offered", (await admin.locator("button:text('Try again now')").count()) === 1);

  // 4. Cancelling: the scheduled job deletes the meeting.
  await svc.from("class_sessions").update({ status: "cancelled", status_reason: "e2e", cancel_requested_by: "school" }).eq("id", a);
  const run1 = await cron();
  const { data: ma } = await svc.from("class_meetings").select("action, deleted_at").eq("session_id", a).single();
  ok("scheduled job deleted the cancelled class's meeting", ma.action === null && ma.deleted_at, JSON.stringify({ ma, run1: run1.meetings }));

  // 5. After class: the scheduled job attaches the recording and tells the student.
  const { data: past, error: pe } = await svc
    .from("class_sessions")
    .insert({ teacher_id: MARIA, student_id: KENJI, starts_at: "2026-01-05T01:00:00Z", ends_at: "2026-01-05T01:50:00Z", status: "completed", meeting_url: "https://meet.example.com/zoom/past" })
    .select("id")
    .single();
  if (pe) throw pe;
  made.push(past.id);
  await svc.from("class_meetings").insert({ session_id: past.id, provider: "zoom", host_email: "maria@zoom.example", external_id: "fake-past", join_url: "https://meet.example.com/zoom/past" });
  const run2 = await cron();
  const { data: recs } = await svc.from("class_recordings").select("source, url, passcode, visible_to_student").eq("session_id", past.id);
  ok("recording attached from Zoom", recs?.length === 1 && recs[0].source === "zoom" && recs[0].passcode === "fake123", JSON.stringify({ recs, run2: run2.meetings }));
  ok("shared with the student by default (setting on)", recs?.[0]?.visible_to_student === true);
  const { data: note } = await svc.from("notifications").select("id").eq("user_id", KENJI).eq("type", "recording_added").like("link", `%${past.id}%`);
  ok("student notified", note?.length === 1);
  const run3 = await cron();
  const { count } = await svc.from("class_recordings").select("id", { count: "exact", head: true }).eq("session_id", past.id);
  ok("not attached twice", count === 1, JSON.stringify(run3.meetings));
} finally {
  await cleanup();
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Browser end-to-end test of the Phase 2 workflows: schedule, double-booking, availability
// warning, autosaved lesson notes, file upload, YouTube embed, complete, student view, reschedule.
// Needs `npm run dev` and a seeded LOCAL database. Creates test classes and deletes them afterwards.
// First run: npx playwright install chromium    Then: npm run test:e2e
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const TMP_PDF = join(tmpdir(), "lms-e2e.pdf");
const APP = process.cwd();
const env = Object.fromEntries(readFileSync(APP + "/.env.local","utf8").split(/\r?\n/).filter(Boolean).map(l=>l.split(/=(.*)/s).slice(0,2)));
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const B = "http://localhost:3000";
const results = []; const ok = (name, cond, extra="") => { results.push([cond, name]); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra); };
const d = new Date(Date.now() + 5*86400000); const date = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(d);
writeFileSync(TMP_PDF, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const browser = await chromium.launch();
async function pick(pg, text) { const v = await pg.$$eval("#pair option", (os, t) => os.find((o) => o.textContent.includes(t))?.value, text); await pg.selectOption("#pair", v); }
const created = [];
try {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  page.on("pageerror", e => console.log("  page error:", e.message));
  // 1. login via the real form
  await page.goto(B + "/login"); await page.fill("#email", "teacher1@school.test"); await page.fill("#password", "Password123!");
  await page.click("button[type=submit]"); await page.waitForURL(B + "/teacher");
  ok("teacher logs in through the form", page.url() === B + "/teacher");
  // 2. schedule a class
  await page.goto(B + `/teacher/calendar/new?date=${date}`);
  await pick(page, "Kenji Tanaka");
  await page.fill("#time", "14:00"); await page.fill("#meeting_url", "https://zoom.us/j/123456");
  await page.click("main button[type=submit]"); await page.waitForURL(/\/teacher\/classes\//, { timeout: 15000 });
  const id = page.url().split("/").pop(); created.push(id);
  ok("scheduling a class opens its class page", /^[0-9a-f-]{36}$/.test(id));
  ok("class shows the Join link", await page.locator("a:has-text('Join class')").getAttribute("href") === "https://zoom.us/j/123456");
  // 3. double booking is refused with a clear message
  const alertText = () => page.locator("main [role=alert]").textContent({ timeout: 10000 }).catch(() => "");
  await page.goto(B + `/teacher/calendar/new?date=${date}`);
  await pick(page, "Min-jun Park"); await page.fill("#time", "14:20"); await page.check("input[name=override]");
  await page.click("main button[type=submit]");
  await page.locator("main [role=alert]").waitFor({ timeout: 10000 }).catch(() => {});
  { const t = await alertText(); ok("overlapping class is refused", t.includes("overlaps"), "alert=" + t); }
  // 4. outside available hours needs confirmation (fresh form)
  await page.goto(B + `/teacher/calendar/new?date=${date}`);
  await pick(page, "Min-jun Park"); await page.fill("#time", "20:00");
  await page.click("main button[type=submit]");
  await page.locator("main [role=alert]").waitFor({ timeout: 10000 }).catch(() => {});
  { const t = await alertText(); ok("class outside available hours asks for confirmation", t.includes("available hours"), "alert=" + t + " url=" + page.url()); if (page.url().includes("/classes/")) created.push(page.url().split("/").pop()); }
  // 5. lesson record autosave
  await page.goto(B + `/teacher/classes/${id}`);
  ok("previous lesson is prefilled", (await page.inputValue("#previous_summary")).length > 0);
  await page.fill("#today_objectives", "E2E objective: Part 3 answers");
  await page.waitForFunction(() => /Saved/.test(document.body.innerText), null, { timeout: 10000 });
  await page.reload();
  ok("lesson notes autosave and survive a reload", (await page.inputValue("#today_objectives")) === "E2E objective: Part 3 answers");
  // 6. upload a material file
  await page.setInputFiles("input[name=file]", TMP_PDF); await page.fill("input[name=title]", "E2E worksheet");
  await page.click("button:has-text('Upload file')"); await page.waitForSelector("a:has-text('E2E worksheet')", { timeout: 15000 });
  ok("teacher uploads a PDF to the class", true);
  // 7. add a YouTube video
  await page.fill("input[name=url][placeholder='YouTube link']", "https://youtu.be/aqz-KE-bpKQ?t=10"); await page.fill("input[name=title][placeholder=Title] >> nth=-1", "E2E video");
  await page.click("button:has-text('Add video')"); await page.waitForSelector("text=E2E video", { timeout: 10000 });
  ok("YouTube link is embedded", (await page.locator("iframe[src*='aqz-KE-bpKQ']").count()) >= 1);
  // 8. complete the class
  await page.click("button:has-text('Mark completed')"); await page.waitForSelector("text=Reopen as scheduled", { state: "detached", timeout: 3000 }).catch(()=>{});
  await page.waitForFunction(() => /Completed/.test(document.querySelector(".badge.border")?.textContent ?? ""), null, { timeout: 10000 });
  ok("teacher marks the class completed", true);
  // 9. student sees it
  const sctx = await browser.newContext(); const sp = await sctx.newPage();
  await sp.goto(B + "/login"); await sp.fill("#email", "student1@school.test"); await sp.fill("#password", "Password123!");
  await sp.click("button[type=submit]"); await sp.waitForURL(B + "/student");
  await sp.goto(B + `/student/classes/${id}`);
  const body = await sp.textContent("body");
  ok("student sees the shared lesson notes", body.includes("E2E objective: Part 3 answers"));
  ok("student can open the uploaded file", (await sp.locator("a:has-text('E2E worksheet')").getAttribute("href"))?.includes("token="));
  ok("student page has no edit controls", !body.includes("Mark completed") && !body.includes("Private notes"));
  // 10. reschedule flow (admin)
  const actx = await browser.newContext(); const ap = await actx.newPage();
  await ap.goto(B + "/login"); await ap.fill("#email", "admin@school.test"); await ap.fill("#password", "Password123!");
  await ap.click("button[type=submit]"); await ap.waitForURL(B + "/admin");
  await ap.goto(B + `/admin/schedules/new?date=${date}`);
  await pick(ap, "Ana Reyes with James Carter"); await ap.fill("#time", "15:00");
  await ap.click("main button[type=submit]"); await ap.waitForURL(/\/admin\/classes\//, { timeout: 15000 });
  const aid = ap.url().split("/").pop(); created.push(aid);
  await ap.click("button:has-text('Reschedule')"); await ap.fill("#r-time", "16:00");
  await ap.click("button:has-text('Move class')"); await ap.waitForURL(u => !u.toString().endsWith(aid), { timeout: 15000 });
  const nid = ap.url().split("/").pop(); created.push(nid);
  ok("admin reschedules; old class links to the new one", nid !== aid);
  await ap.goto(B + `/admin/classes/${aid}`);
  ok("original shows as Rescheduled", (await ap.textContent("body")).includes("Go to the new time"));
} catch (e) { ok("unexpected error", false, e.message); }
finally {
  for (const id of created) {
    const { data: m } = await svc.from("materials").select("storage_path").eq("session_id", id);
    const paths = (m ?? []).map(x => x.storage_path).filter(Boolean); if (paths.length) await svc.storage.from("materials").remove(paths);
  }
  if (created.length) await svc.from("class_sessions").update({ rescheduled_from_id: null }).in("id", created);
  if (created.length) await svc.from("class_sessions").delete().in("id", created);
  await browser.close();
}
const failed = results.filter(r => !r[0]).length; console.log(failed ? `${failed} failed` : "all passed"); process.exit(failed ? 1 : 0);

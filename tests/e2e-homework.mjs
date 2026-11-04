// Browser end-to-end test of the Phase 3 homework loop:
// teacher assigns from a class -> student drafts (autosave), uploads a photo, submits ->
// teacher reviews (Under review), adds corrections + a corrected file, requests revision ->
// student sees feedback, submits version 2 -> teacher completes -> both versions kept.
// Needs `npm run dev` and a seeded LOCAL database. Cleans up what it creates.
// First run: npx playwright install chromium    Then: npm run test:e2e:homework
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_SUPABASE_URL)) throw new Error("E2E tests run against the local database only");
const svc = createClient(env.NEXT_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const B = process.env.BASE_URL ?? "http://localhost:3000";
const CLASS = "20000000-0000-4000-a000-000000000003"; // Kenji's upcoming class with Maria

const PNG = join(tmpdir(), "lms-e2e-page.png");
const PDF = join(tmpdir(), "lms-e2e-marked.pdf");
// 1x1 PNG
writeFileSync(PNG, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
writeFileSync(PDF, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(cond);
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
};
async function login(browser, email, home) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept()); // confirm "Submit homework?"
  await page.goto(B + "/login");
  await page.fill("#email", email);
  await page.fill("#password", "Password123!");
  await page.click("button[type=submit]");
  await page.waitForURL(B + home);
  return page;
}
const body = (p) => p.textContent("main");

const browser = await chromium.launch();
let hwId = null;
try {
  const t = await login(browser, "teacher1@school.test", "/teacher");

  // 1. Assign from the class page
  await t.goto(`${B}/teacher/classes/${CLASS}`);
  await t.click("main a:has-text('Assign homework')");
  await t.waitForURL(/\/teacher\/homework\/new\?session=/);
  await t.fill("#title", "E2E essay: technology");
  await t.fill("#instructions", "Write **two** paragraphs.\n\n- Use linking words\n- 150 words");
  await t.fill("#requirements", "150 words minimum");
  await t.check("main input[name=material_id] >> nth=0");
  await t.click("main button[type=submit]");
  await t.waitForURL(/\/teacher\/homework\/[0-9a-f-]{36}\?created=1/, { timeout: 15000 });
  hwId = t.url().split("/").pop().split("?")[0];
  ok("teacher assigns homework from the class page", !!hwId);
  ok("instructions are formatted (bold + list)", (await t.locator("main strong:has-text('two')").count()) === 1 && (await t.locator("main li:has-text('Use linking words')").count()) === 1);
  ok("class link was attached as reference", (await body(t)).includes("Cambridge IELTS 18"));

  // 2. Student drafts, autosaves, uploads a photo, submits
  const s = await login(browser, "student1@school.test", "/student");
  await s.goto(`${B}/student/homework`);
  ok("homework appears in the student's To do list", (await body(s)).includes("E2E essay: technology"));
  await s.goto(`${B}/student/homework/${hwId}`);
  await s.fill("#answer_text", "Technology helps people learn. However, it can distract us.");
  await s.waitForFunction(() => /Draft saved/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 10000 });
  ok("word count updates", (await body(s)).includes("9 words"));
  await s.reload();
  ok("draft answer autosaves and survives a reload", (await s.inputValue("#answer_text")).startsWith("Technology helps people learn"));
  await s.setInputFiles("main input[type=file][aria-label='Add files or photos']", PNG);
  await s.waitForSelector("main img[alt='lms-e2e-page.png'], main figcaption:has-text('Page 1')", { timeout: 15000 });
  ok("student uploads a photo of their work", true);
  await s.click("main button:has-text('Submit homework')");
  await s.waitForURL(/submitted=1/, { timeout: 15000 });
  ok("student submits; homework shows as Submitted", (await body(s)).includes("Submitted") && !(await body(s)).includes("Submit homework"));

  // 3. Teacher reviews: Under review, comments, corrected file, request revision
  await t.goto(`${B}/teacher/homework`);
  ok("submission appears in the teacher's To review list", (await body(t)).includes("E2E essay: technology"));
  await t.goto(`${B}/teacher/homework/${hwId}`);
  ok("opening it marks it Under review", (await body(t)).includes("Under review"));
  await t.fill("#comments", "Good ideas. Add an example to each paragraph.");
  await t.fill("#corrections", '"helps people learn" → "helps people to learn"');
  await t.waitForFunction(() => /Draft saved/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 10000 });
  await t.setInputFiles("main input[type=file][aria-label='Upload corrected file']", PDF);
  await t.waitForSelector("main a:has-text('lms-e2e-marked.pdf')", { timeout: 15000 });
  ok("teacher uploads a corrected file", true);

  // Student can't see the unsent feedback yet
  await s.goto(`${B}/student/homework/${hwId}`);
  ok("student can't see feedback before it is sent", !(await body(s)).includes("Add an example to each paragraph"));

  await t.goto(`${B}/teacher/homework/${hwId}`);
  ok("review draft survived a reload", (await t.inputValue("#comments")).includes("Add an example"));
  await t.click("main button:has-text('Request revision')");
  await t.waitForURL(/reviewed=needs_revision/, { timeout: 15000 });
  ok("teacher sees a confirmation", (await body(t)).includes("Sent back for revision"));
  ok("teacher requests a revision", true);

  // 4. Student sees feedback, writes version 2
  await s.goto(`${B}/student/homework/${hwId}`);
  const sb = await body(s);
  ok("student sees feedback, corrections and corrected file", sb.includes("Add an example to each paragraph") && sb.includes("helps people to learn") && sb.includes("lms-e2e-marked.pdf"));
  ok("student is asked for version 2", sb.includes("version 2"));
  await s.fill("#answer_text", "Technology helps people to learn, for example with online dictionaries. However, phones can distract us in class.");
  await s.waitForFunction(() => /Draft saved/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 10000 });
  await s.click("main button:has-text('Submit version 2')");
  await s.waitForURL(/submitted=1/, { timeout: 15000 });
  ok("student submits version 2", true);

  // 5. Teacher completes
  await t.goto(`${B}/teacher/homework/${hwId}`);
  ok("teacher reviews version 2", (await body(t)).includes("Review version 2") || (await t.locator("main h2:has-text('Review version')").textContent()).includes("2"));
  await t.fill("#comments", "Excellent improvement.");
  await t.click("main button:has-text('Mark completed')");
  await t.waitForURL(/reviewed=completed/, { timeout: 15000 });
  const tb = await body(t);
  ok("homework is Completed with both versions kept", tb.includes("Completed") && (await t.locator("main article").count()) === 2);
  ok("after submission only the deadline can be changed", tb.includes("Change deadline") && !tb.includes("Withdraw homework"));

  await s.goto(`${B}/student/homework?tab=completed`);
  ok("student sees it under Completed", (await body(s)).includes("E2E essay: technology"));

  // 6. Privacy: another student can't open it
  const ana = await login(browser, "student2@school.test", "/student");
  const res = await ana.goto(`${B}/student/homework/${hwId}`);
  ok("another student gets 404", res.status() === 404);
} catch (e) {
  ok("unexpected error", false, e.message);
} finally {
  if (hwId) {
    const walk = async (prefix) => {
      const { data } = await svc.storage.from("homework").list(prefix, { limit: 100 });
      let out = [];
      for (const o of data ?? []) out = o.id ? [...out, `${prefix}/${o.name}`] : [...out, ...(await walk(`${prefix}/${o.name}`))];
      return out;
    };
    const files = await walk(hwId);
    if (files.length) await svc.storage.from("homework").remove(files);
    await svc.from("homework_assignments").delete().eq("id", hwId);
  }
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);

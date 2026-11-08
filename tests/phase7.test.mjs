// Phase 7 database tests: class recording links (who can add, share and see them; the OD-06
// default; the student's notification) and the admin-only reports.
// Run against the LOCAL database only:  npm run test:rls
// Requires `npx supabase start` + `npx supabase db reset` (loads seed.sql). Safe to repeat: the
// tests remove what they create.
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
const minjun = () => as("student3@school.test");
const maria = () => as("teacher1@school.test");
const james = () => as("teacher2@school.test");
const ids = (rows, k = "id") => (rows ?? []).map((r) => r[k]).sort();

const S1 = "20000000-0000-4000-a000-000000000001"; // Kenji + Maria, completed
const S7b = "20000000-0000-4000-a000-000000000007"; // Ana + James
const rec = (session, extra = {}) => ({ session_id: session, url: "https://zoom.us/rec/share/abc123", ...extra });

test("recordings: the class's teacher or an admin adds them; nobody else", async () => {
  const m = await maria();
  assert.ok((await (await kenji()).from("class_recordings").insert(rec(S1, { added_by: ID.kenji }))).error, "students can't add");
  assert.ok((await (await james()).from("class_recordings").insert(rec(S1, { added_by: ID.james }))).error, "another teacher can't add");
  assert.ok((await m.from("class_recordings").insert(rec(S7b, { added_by: ID.maria }))).error, "not into another teacher's class");
  assert.ok((await m.from("class_recordings").insert(rec(S1, { url: "http://insecure.example/x", added_by: ID.maria }))).error, "https only");
  assert.ok((await m.from("class_recordings").insert(rec(S1, { url: "javascript:alert(1)", added_by: ID.maria }))).error, "no script links");
  const { data, error } = await m.from("class_recordings").insert(rec(S1, { added_by: ID.maria })).select("id, visible_to_student").single();
  assert.equal(error, null, error?.message);
  try {
    assert.equal(data.visible_to_student, true, "shared by default (setting on)");
    const { data: byAdmin } = await (await admin()).from("class_recordings").insert(rec(S7b, { title: "Part 1" })).select("id").single();
    assert.ok(byAdmin, "admins can add to any class");
    await (await admin()).from("class_recordings").delete().eq("id", byAdmin.id);
  } finally {
    await m.from("class_recordings").delete().eq("id", data.id);
  }
});

test("recordings: students see only shared recordings of their own classes, and are told when one is shared", async () => {
  const m = await maria();
  const k = await kenji();
  const { data: hidden } = await m.from("class_recordings").insert(rec(S1, { visible_to_student: false, passcode: "x9", added_by: ID.maria })).select("id").single();
  try {
    assert.equal((await k.from("class_recordings").select("id").eq("id", hidden.id)).data.length, 0, "not shared yet");
    assert.equal((await svc().from("notifications").select("id").eq("dedupe_key", `recording:${hidden.id}`)).data.length, 0, "no notification while hidden");
    await m.from("class_recordings").update({ visible_to_student: true }).eq("id", hidden.id);
    const seen = (await k.from("class_recordings").select("url, passcode").eq("id", hidden.id)).data;
    assert.deepEqual(seen, [{ url: "https://zoom.us/rec/share/abc123", passcode: "x9" }]);
    const n = (await svc().from("notifications").select("user_id, link").eq("dedupe_key", `recording:${hidden.id}`)).data;
    assert.deepEqual(n, [{ user_id: ID.kenji, link: `/student/classes/${S1}#recordings` }]);
    assert.equal((await (await ana()).from("class_recordings").select("id").eq("id", hidden.id)).data.length, 0, "other students never");
    assert.equal((await (await james()).from("class_recordings").select("id").eq("id", hidden.id)).data.length, 0, "nor other teachers");
    const { error } = await k.from("class_recordings").update({ visible_to_student: false }).eq("id", hidden.id).select("id").single();
    assert.ok(error, "students can't change sharing");
    assert.ok((await m.from("class_recordings").update({ session_id: S7b }).eq("id", hidden.id)).error, "can't be moved to another class");
  } finally {
    await m.from("class_recordings").delete().eq("id", hidden.id);
  }
  assert.equal((await svc().from("class_recordings").select("id").eq("id", hidden.id)).data.length, 0, "the teacher can remove it");
});

test("recordings: new links follow the admin's sharing setting (OD-06)", async () => {
  const a = await admin();
  try {
    await a.from("settings").upsert({ key: "recordings_visible_by_default", value: false });
    const { data } = await (await maria()).from("class_recordings").insert(rec(S1, { added_by: ID.maria })).select("id, visible_to_student").single();
    assert.equal(data.visible_to_student, false);
    await a.from("class_recordings").delete().eq("id", data.id);
  } finally {
    await a.from("settings").upsert({ key: "recordings_visible_by_default", value: true });
  }
});

test("reports are for admins only", async () => {
  for (const c of [await maria(), await kenji()]) {
    assert.ok((await c.rpc("report_monthly", { p_months: 6 })).error);
    assert.ok((await c.rpc("report_teachers", { p_from: "2026-01-01" })).error);
    assert.ok((await c.rpc("report_attention")).error);
  }
  assert.ok((await createClient(URL, ANON).rpc("report_monthly", { p_months: 6 })).error, "nor the public");
});

test("monthly report matches the records", async () => {
  const a = await admin();
  const { data, error } = await a.rpc("report_monthly", { p_months: 3 });
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 3, "one row per month, including empty ones");
  assert.ok(data[0].month > data[1].month, "newest first");
  // Count this month's seeded classes directly (school time zone = Asia/Manila).
  const m = data[0].month;
  const start = new Date(`${m}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const { data: rows } = await a.from("class_sessions").select("status").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString());
  assert.equal(data[0].completed, rows.filter((r) => r.status === "completed").length);
  assert.equal(data[0].student_absent, rows.filter((r) => r.status === "student_absent").length);
  const pays = (await a.from("payments").select("amount, paid_on").is("voided_at", null)).data.filter((p) => p.paid_on.startsWith(m.slice(0, 7)));
  assert.equal(Number(data[0].collected), pays.reduce((s, p) => s + Number(p.amount), 0));
});

test("teacher and attention reports", async () => {
  const a = await admin();
  const t = (await a.rpc("report_teachers", { p_from: "2026-01-01" })).data;
  const maria_ = t.find((r) => r.teacher_id === ID.maria);
  assert.equal(maria_.active_students, 2);
  assert.ok(maria_.completed >= 2);
  assert.equal(maria_.progress_reports >= 2, true);
  const att = (await a.rpc("report_attention")).data;
  const k = att.find((r) => r.student_id === ID.kenji);
  assert.ok(k, "Kenji has an overdue invoice");
  assert.equal(Number(k.overdue_amount), 6000);
  assert.ok(att.every((r) => r.overdue_amount > 0 || r.classes_left === null || r.classes_left <= 2 || r.overdue_homework >= 2 || r.report_due || r.nothing_booked));
});

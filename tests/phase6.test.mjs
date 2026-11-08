// Phase 6 database tests: privacy of progress reports, IELTS results and messages; the draft ->
// published flow; the IELTS overall-band rule; "due a progress report"; who can write in a
// conversation; message attachments; and the admin read-only view with its audit trail.
// Run against the LOCAL database only:  npm run test:rls
// Requires `npx supabase start` + `npx supabase db reset` (loads seed.sql). Safe to repeat: the
// tests remove what they create (messages go with their conversation).
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
const R = { kenjiSep: "60000000-0000-4000-a000-000000000001", kenjiOct: "60000000-0000-4000-a000-000000000002", ana: "60000000-0000-4000-a000-000000000003", minjunDraft: "60000000-0000-4000-a000-000000000004" };
const T = { general: "62000000-0000-4000-a000-000000000001", cls: "62000000-0000-4000-a000-000000000002" };
const S1 = "20000000-0000-4000-a000-000000000001"; // Kenji + Maria, completed
const S7 = "20000000-0000-4000-a000-000000000007"; // Ana + James

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

// ---------------------------------------------------------------------------
// Progress reports (PRG-01..02)
// ---------------------------------------------------------------------------
test("progress reports: students see only their own published reports; teachers only their students'", async () => {
  assert.deepEqual(ids((await (await kenji()).from("progress_reports").select("id")).data), [R.kenjiSep, R.kenjiOct]);
  assert.deepEqual(ids((await (await ana()).from("progress_reports").select("id")).data), [R.ana]);
  assert.deepEqual(ids((await (await minjun()).from("progress_reports").select("id")).data), [], "a draft is invisible to the student");
  assert.deepEqual(ids((await (await maria()).from("progress_reports").select("id")).data), [R.kenjiSep, R.kenjiOct, R.minjunDraft].sort(), "Maria: her students + her own draft");
  assert.deepEqual(ids((await (await james()).from("progress_reports").select("id")).data), [R.ana], "James can't see Maria's students");
  assert.equal((await (await admin()).from("progress_reports").select("id")).data.length >= 4, true);
  assert.equal((await createClient(URL, ANON).from("progress_reports").select("id")).data.length, 0, "the public sees nothing");
});

test("progress reports: only an assigned teacher (as the author) or an admin can write one", async () => {
  const base = { period_start: "2026-01-01", period_end: "2026-01-31", overall: 3 };
  assert.ok((await (await maria()).from("progress_reports").insert({ ...base, student_id: ID.ana, author_id: ID.maria })).error, "not her student");
  assert.ok((await (await maria()).from("progress_reports").insert({ ...base, student_id: ID.kenji, author_id: ID.james })).error, "can't sign as someone else");
  assert.ok((await (await kenji()).from("progress_reports").insert({ ...base, student_id: ID.kenji, author_id: ID.kenji })).error, "students can't write reports");
  const { error: upd } = await (await james()).from("progress_reports").update({ summary: "hacked" }).eq("id", R.kenjiOct).select("id").single();
  assert.ok(upd, "James can't change Maria's report");
  assert.ok((await (await maria()).from("progress_reports").insert({ ...base, overall: 3.3, student_id: ID.kenji, author_id: ID.maria })).error, "levels are CEFR steps of 0.5");
  assert.ok((await (await maria()).from("progress_reports").insert({ ...base, period_end: "2025-12-01", student_id: ID.kenji, author_id: ID.maria })).error, "period can't end before it starts");
});

test("progress reports: draft -> published notifies the student once, is locked as published, and is audited", async () => {
  const m = await maria();
  const { data: draft, error } = await m
    .from("progress_reports")
    .insert({ student_id: ID.kenji, author_id: ID.maria, period_start: "2025-06-01", period_end: "2025-06-30", speaking: 4 })
    .select("*")
    .single();
  assert.equal(error, null, error?.message);
  assert.equal(draft.published_at, null);
  try {
    assert.equal((await (await kenji()).from("progress_reports").select("id").eq("id", draft.id)).data.length, 0, "draft hidden from the student");
    assert.ok((await m.from("progress_reports").update({ status: "published" }).eq("id", draft.id)).error, "overall level required to publish");
    assert.equal((await m.from("progress_reports").update({ status: "published", overall: 4 }).eq("id", draft.id)).error, null);
    const pub = (await (await kenji()).from("progress_reports").select("status, published_at").eq("id", draft.id).single()).data;
    assert.equal(pub.status, "published");
    assert.ok(pub.published_at);
    const notes = (await svc().from("notifications").select("type, link").eq("user_id", ID.kenji).eq("dedupe_key", `progress_report:${draft.id}`)).data;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].link, `/student/progress#r-${draft.id}`);

    assert.ok((await m.from("progress_reports").update({ status: "draft" }).eq("id", draft.id)).error, "can't unpublish");
    assert.equal((await m.from("progress_reports").update({ summary: "Corrected typo" }).eq("id", draft.id)).error, null, "the author can still correct it");
    await m.from("progress_reports").delete().eq("id", draft.id);
    assert.equal((await svc().from("progress_reports").select("id").eq("id", draft.id)).data.length, 1, "a teacher can't remove a published report");
    const audit = (await (await admin()).from("audit_log").select("action").eq("entity_id", draft.id)).data.map((a) => a.action).sort();
    assert.deepEqual(audit, ["progress.edit", "progress.publish"]);
  } finally {
    assert.equal((await (await admin()).from("progress_reports").delete().eq("id", draft.id)).error, null, "admins can remove one");
    assert.ok((await (await admin()).from("audit_log").select("action").eq("entity_id", draft.id).eq("action", "progress.delete")).data.length === 1);
  }
});

test("progress reports: a teacher can delete their own draft", async () => {
  const m = await maria();
  const { data } = await m.from("progress_reports").insert({ student_id: ID.minjun, author_id: ID.maria, period_start: "2025-05-01", period_end: "2025-05-31" }).select("id").single();
  assert.ok(data);
  assert.equal((await m.from("progress_reports").delete().eq("id", data.id).select("id")).data.length, 1);
});

// ---------------------------------------------------------------------------
// IELTS (PRG-03)
// ---------------------------------------------------------------------------
test("IELTS overall band: mean of four, nearest half band, .25 and .75 round up", async () => {
  const m = await maria();
  const cases = [
    [[6.5, 6.5, 5, 7], 6.5], // 6.25 -> 6.5
    [[6.5, 6.5, 5.5, 6], 6], // 6.125 -> 6.0
    [[7, 7, 6.5, 6.5], 7], // 6.75 -> 7.0
    [[6, 6.5, 6.5, 7.5], 6.5], // 6.625 -> 6.5
    [[4, 3.5, 4, 4], 4], // 3.875 -> 4.0
    [[9, 9, 9, 9], 9],
    [[0, 0, 0, 0.5], 0], // 0.125 -> 0.0
  ];
  const rows = cases.map(([[l, r, w, s]]) => ({ student_id: ID.kenji, kind: "mock", test_date: "2025-01-01", listening: l, reading: r, writing: w, speaking: s, recorded_by: ID.maria }));
  const { data, error } = await m.from("ielts_results").insert(rows).select("id, overall");
  assert.equal(error, null, error?.message);
  try {
    assert.deepEqual(
      data.map((d) => Number(d.overall)),
      cases.map((c) => c[1]),
    );
    const { data: part } = await m.from("ielts_results").insert({ student_id: ID.kenji, test_date: "2025-01-02", writing: 6, recorded_by: ID.maria }).select("id, overall").single();
    data.push(part);
    assert.equal(part.overall, null, "no overall band without all four skills");
    for (const bad of [6.3, 9.5, -0.5]) {
      assert.ok((await m.from("ielts_results").insert({ student_id: ID.kenji, test_date: "2025-01-03", writing: bad, recorded_by: ID.maria })).error, `band ${bad} refused`);
    }
    assert.ok((await m.from("ielts_results").insert({ student_id: ID.kenji, test_date: "2025-01-03", recorded_by: ID.maria })).error, "at least one band");
    assert.ok((await m.from("ielts_results").update({ overall: 9 }).eq("id", part.id)).error, "the overall band can't be typed in");
  } finally {
    await m.from("ielts_results").delete().in("id", data.map((d) => d.id));
  }
});

test("IELTS results: private to the student and their teachers; only assigned teachers and admins add them", async () => {
  const k = await kenji();
  assert.equal((await k.from("ielts_results").select("student_id")).data.every((r) => r.student_id === ID.kenji), true);
  assert.ok((await k.from("ielts_results").select("id")).data.length >= 4);
  assert.equal((await (await ana()).from("ielts_results").select("id").eq("student_id", ID.kenji)).data.length, 0, "Ana can't see Kenji's scores");
  assert.equal((await (await james()).from("ielts_results").select("id").eq("student_id", ID.kenji)).data.length, 0, "nor can another teacher");
  const row = { student_id: ID.kenji, test_date: "2025-02-01", listening: 6 };
  assert.ok((await k.from("ielts_results").insert({ ...row, recorded_by: ID.kenji })).error, "students can't add scores");
  assert.ok((await (await james()).from("ielts_results").insert({ ...row, recorded_by: ID.james })).error, "unassigned teacher can't add scores");

  const { data: byAdmin } = await (await admin()).from("ielts_results").insert({ ...row, kind: "official" }).select("id, recorded_by").single();
  try {
    assert.equal(byAdmin.recorded_by, ID.admin, "recorded_by defaults to whoever saved it");
    const { error } = await (await maria()).from("ielts_results").update({ listening: 9 }).eq("id", byAdmin.id).select("id").single();
    assert.ok(error, "a teacher can't change a result someone else entered");
    const n = (await svc().from("notifications").select("title, body").eq("user_id", ID.kenji).eq("dedupe_key", `ielts:${byAdmin.id}`)).data;
    assert.equal(n.length, 1, "the student is told about a new result");
    assert.match(n[0].title, /official/i);
  } finally {
    await (await admin()).from("ielts_results").delete().eq("id", byAdmin.id);
  }
});

test("IELTS target: the student reads it; assigned teachers and admins set it", async () => {
  assert.equal(Number((await (await kenji()).from("ielts_goals").select("target_overall").single()).data.target_overall), 7);
  assert.equal((await (await ana()).from("ielts_goals").select("student_id").eq("student_id", ID.kenji)).data.length, 0);
  assert.ok((await (await kenji()).from("ielts_goals").update({ target_overall: 9 }).eq("student_id", ID.kenji).select("student_id").single()).error, "student can't change the target");
  assert.ok((await (await james()).from("ielts_goals").upsert({ student_id: ID.kenji, target_overall: 5 })).error, "unassigned teacher can't either");
  assert.equal((await (await maria()).from("ielts_goals").upsert({ student_id: ID.kenji, target_overall: 7.5 })).error, null);
  await (await maria()).from("ielts_goals").upsert({ student_id: ID.kenji, target_overall: 7 });
  assert.ok((await (await maria()).from("ielts_goals").upsert({ student_id: ID.kenji, target_overall: 7.2 })).error, "half bands only");
});

test("due a progress report: earliest class since the last report older than the setting", async () => {
  const a = await admin();
  const setDays = (n) => a.from("settings").upsert({ key: "progress_report_days", value: n });
  try {
    // Seed: Kenji's last report ends 8 days ago and he has had classes 7 and 3 days ago.
    assert.deepEqual(ids((await (await maria()).rpc("progress_due")).data, "student_id"), [], "30 days: nobody due yet");
    await setDays(2);
    assert.deepEqual(ids((await (await maria()).rpc("progress_due")).data, "student_id"), [ID.kenji], "Min-jun has no completed class, so isn't due");
    assert.deepEqual(ids((await (await james()).rpc("progress_due")).data, "student_id"), [], "James sees only his students");
    assert.deepEqual(ids((await a.rpc("progress_due")).data, "student_id"), [ID.kenji], "admins see everyone");
    assert.deepEqual((await (await kenji()).rpc("progress_due")).data, [], "students get nothing");
    assert.ok((await (await maria()).rpc("generate_progress_notifications")).error, "only the scheduled job runs the reminder");
    assert.ok((await (await maria()).rpc("progress_due_list", { p_teacher: ID.james })).error, "can't ask about another teacher");
    const before = (await svc().from("notifications").select("id").eq("user_id", ID.maria).eq("type", "progress_due")).data.length;
    await svc().rpc("generate_progress_notifications");
    await svc().rpc("generate_progress_notifications");
    const after = (await svc().from("notifications").select("id").eq("user_id", ID.maria).eq("type", "progress_due")).data.length;
    assert.ok(after - before <= 1, "at most one reminder a week");
    assert.equal((await svc().from("notifications").select("id").eq("user_id", ID.james).eq("type", "progress_due")).data.length, 0);
  } finally {
    await setDays(30);
  }
});

// ---------------------------------------------------------------------------
// Messaging (MSG-01)
// ---------------------------------------------------------------------------
test("messages: only the two people (and admins) can read a conversation", async () => {
  assert.deepEqual(ids((await (await kenji()).from("message_threads").select("id")).data), [T.general, T.cls]);
  assert.deepEqual(ids((await (await ana()).from("message_threads").select("id")).data), []);
  assert.equal((await (await ana()).from("messages").select("id").eq("thread_id", T.general)).data.length, 0, "Ana can't read Kenji's messages");
  assert.equal((await (await james()).from("messages").select("id").eq("thread_id", T.general)).data.length, 0, "nor can another teacher");
  assert.equal((await (await minjun()).from("messages").select("id").eq("thread_id", T.general)).data.length, 0, "nor a classmate of the same teacher");
  assert.equal((await (await maria()).from("messages").select("id").eq("thread_id", T.general)).data.length >= 3, true);
  assert.equal((await (await admin()).from("messages").select("id").eq("thread_id", T.general)).data.length >= 3, true, "admins can read (safeguarding)");
  assert.equal((await createClient(URL, ANON).from("messages").select("id")).data.length, 0);
});

test("messages: posted only through send_message, by a participant; can't be edited or deleted", async () => {
  const k = await kenji();
  assert.ok((await k.from("messages").insert({ thread_id: T.general, sender_id: ID.kenji, body: "direct" })).error, "no direct inserts");
  assert.ok((await k.from("message_threads").insert({ teacher_id: ID.james, student_id: ID.kenji })).error, "no direct thread creation");
  assert.ok((await (await ana()).rpc("send_message", { p_thread: T.general, p_body: "hi" })).error, "outsiders can't post");
  assert.ok((await (await admin()).rpc("send_message", { p_thread: T.general, p_body: "hi" })).error, "admins read only");
  assert.ok((await k.rpc("send_message", { p_thread: T.general, p_body: "   " })).error, "empty message refused");
  assert.ok((await k.rpc("send_message", { p_thread: T.general, p_body: "x".repeat(5001) })).error, "too long");
  const { data: id, error } = await k.rpc("send_message", { p_thread: T.general, p_body: "My private reply about the essay" });
  assert.equal(error, null, error?.message);
  const sent = (await (await maria()).from("messages").select("sender_id, body").eq("id", id).single()).data;
  assert.deepEqual(sent, { sender_id: ID.kenji, body: "My private reply about the essay" });
  assert.ok((await svc().from("messages").update({ body: "edited" }).eq("id", id)).error, "messages are immutable, even for the server");
  assert.ok((await svc().from("messages").delete().eq("id", id)).error, "and can't be deleted");
  const t = (await k.from("message_threads").select("last_sender_id, last_preview").eq("id", T.general).single()).data;
  assert.deepEqual(t, { last_sender_id: ID.kenji, last_preview: "My private reply about the essay" });
});

test("messages: one notification per unread conversation, without the message text", async () => {
  const k = await kenji();
  const m = await maria();
  await m.rpc("mark_thread_read", { p_thread: T.general });
  const unreadFor = async () => (await svc().from("notifications").select("id, body, title, email_status").eq("user_id", ID.maria).eq("type", "message").like("dedupe_key", `msg:${T.general}:%`).is("read_at", null)).data;
  assert.equal((await unreadFor()).length, 0, "reading the conversation clears its notifications");
  await k.rpc("send_message", { p_thread: T.general, p_body: "Secret detail one" });
  await k.rpc("send_message", { p_thread: T.general, p_body: "Secret detail two" });
  const n = await unreadFor();
  assert.equal(n.length, 1, "two messages, one notification");
  assert.equal(n[0].title, "New message from Kenji Tanaka");
  assert.ok(!n[0].body.includes("Secret"), "the text stays in the portal (not in email)");
  assert.equal((await m.rpc("unread_message_count")).data >= 1, true);
  await m.rpc("mark_thread_read", { p_thread: T.general });
  const done = (await svc().from("notifications").select("read_at, email_status").eq("id", n[0].id).single()).data;
  assert.ok(done.read_at);
  assert.equal(done.email_status, "skipped", "no email once they've read it");
  await k.rpc("mark_thread_read", { p_thread: T.general });
  assert.equal((await k.rpc("unread_message_count")).data, 0);
});

test("conversations: started only with your own teacher or student; one per pair and one per class", async () => {
  const k = await kenji();
  const m = await maria();
  assert.equal((await k.rpc("open_thread", { p_with: ID.maria })).data, T.general, "reuses the general conversation");
  assert.ok((await k.rpc("open_thread", { p_with: ID.james })).error, "not Kenji's teacher");
  assert.ok((await m.rpc("open_thread", { p_with: ID.ana })).error, "not Maria's student");
  assert.ok((await m.rpc("open_thread", { p_session: S7 })).error, "someone else's class");
  assert.ok((await (await admin()).rpc("open_thread", { p_with: ID.kenji })).error, "admins don't start conversations");
  const { data: cls, error } = await m.rpc("open_thread", { p_session: S1 });
  assert.equal(error, null, error?.message);
  try {
    assert.equal((await k.rpc("open_thread", { p_session: S1 })).data, cls, "the student gets the same class conversation");
    const row = (await k.from("message_threads").select("kind, teacher_id, student_id, session_id").eq("id", cls).single()).data;
    assert.deepEqual(row, { kind: "class", teacher_id: ID.maria, student_id: ID.kenji, session_id: S1 });
  } finally {
    await svc().from("message_threads").delete().eq("id", cls);
  }
});

test("a teacher who no longer has the student loses the conversation; the student keeps it read-only", async () => {
  const a = await admin();
  const j = await james();
  const k = await kenji();
  await a.from("teacher_students").upsert({ teacher_id: ID.james, student_id: ID.kenji, active: true });
  let thread;
  try {
    thread = (await j.rpc("open_thread", { p_with: ID.kenji })).data;
    assert.ok(thread);
    assert.equal((await j.rpc("send_message", { p_thread: thread, p_body: "Welcome, Kenji" })).error, null);
    await a.from("teacher_students").update({ active: false }).eq("teacher_id", ID.james).eq("student_id", ID.kenji);
    assert.equal((await j.from("message_threads").select("id").eq("id", thread)).data.length, 0, "James can't see it any more");
    assert.equal((await j.from("messages").select("id").eq("thread_id", thread)).data.length, 0);
    assert.ok((await j.rpc("send_message", { p_thread: thread, p_body: "still here?" })).error);
    assert.equal((await k.from("messages").select("id").eq("thread_id", thread)).data.length, 1, "Kenji can still read it");
    assert.equal((await k.rpc("thread_access", { p_thread: thread })).data, "read");
    assert.ok((await k.rpc("send_message", { p_thread: thread, p_body: "reply" })).error, "but can't reply");
  } finally {
    if (thread) await svc().from("message_threads").delete().eq("id", thread);
    await svc().from("teacher_students").delete().eq("teacher_id", ID.james).eq("student_id", ID.kenji);
  }
});

test("attachments: private to the conversation; only the sender's own uploads can be attached", async () => {
  const k = await kenji();
  const pdf = new Blob([Buffer.from("%PDF-1.4 test")], { type: "application/pdf" });
  const key = crypto.randomUUID();
  const path = `${T.general}/${ID.kenji}/${key}/essay.pdf`;
  assert.equal((await k.storage.from("messages").upload(path, pdf, { contentType: "application/pdf" })).error, null);
  assert.ok((await k.storage.from("messages").upload(`${T.general}/${ID.maria}/${key}/x.pdf`, pdf, { contentType: "application/pdf" })).error, "not into the teacher's folder");
  assert.ok((await (await ana()).storage.from("messages").upload(`${T.general}/${ID.ana}/${key}/x.pdf`, pdf, { contentType: "application/pdf" })).error, "not into someone else's conversation");
  assert.ok((await (await ana()).storage.from("messages").download(path)).error, "Ana can't download it");

  const file = { path, name: "essay.pdf", type: "application/pdf", size: 13 };
  assert.ok((await (await maria()).rpc("send_message", { p_thread: T.general, p_body: "", p_files: [file] })).error, "Maria can't attach Kenji's upload");
  assert.ok((await k.rpc("send_message", { p_thread: T.general, p_body: "", p_files: [{ ...file, path: `${T.general}/${ID.kenji}/${key}/missing.pdf` }] })).error, "file must exist");
  const { data: msg, error } = await k.rpc("send_message", { p_thread: T.general, p_body: "", p_files: [file] });
  assert.equal(error, null, error?.message);
  assert.ok((await k.rpc("send_message", { p_thread: T.general, p_body: "again", p_files: [file] })).error, "each file is attached once");
  const files = (await (await maria()).from("message_files").select("file_name, storage_path").eq("message_id", msg)).data;
  assert.deepEqual(files, [{ file_name: "essay.pdf", storage_path: path }]);
  assert.equal((await (await maria()).storage.from("messages").download(path)).error, null, "the teacher can open it");
  assert.equal((await (await admin()).storage.from("messages").download(path)).error, null, "and the school office");
  await k.storage.from("messages").remove([path]);
  assert.equal((await (await maria()).storage.from("messages").download(path)).error, null, "a sent attachment can't be removed");
  assert.equal((await k.from("message_threads").select("last_preview").eq("id", T.general).single()).data.last_preview, "Sent a file");
});

test("admins reading a conversation are audited; others can't write the audit log", async () => {
  const a = await admin();
  const before = (await a.from("audit_log").select("id").eq("action", "messages.view").eq("entity_id", T.cls)).data.length;
  await a.rpc("log_thread_view", { p_thread: T.cls });
  await (await maria()).rpc("log_thread_view", { p_thread: T.cls });
  const after = (await a.from("audit_log").select("actor_id").eq("action", "messages.view").eq("entity_id", T.cls)).data;
  assert.equal(after.length, before + 1, "only the admin's visit is logged");
  assert.ok(after.every((r) => r.actor_id === ID.admin));
});

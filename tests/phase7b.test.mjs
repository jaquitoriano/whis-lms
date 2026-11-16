// Phase 7b database tests: automatic Zoom / Google Meet links. Who can connect a teacher and see
// the sync queue, and what booking, moving, cancelling and hand-typed links queue up.
// Run against the LOCAL database only:  npm run test:rls
// Requires `npx supabase start` + `npx supabase db reset` (loads seed.sql). Safe to repeat: the
// tests remove what they create.
import { test, after } from "node:test";
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
  maria: "00000000-0000-4000-a000-000000000011",
  james: "00000000-0000-4000-a000-000000000012",
  kenji: "00000000-0000-4000-a000-000000000021",
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
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const admin = () => as("admin@school.test");
const maria = () => as("teacher1@school.test");
const james = () => as("teacher2@school.test");
const kenji = () => as("student1@school.test");

// Far-future slots so nothing clashes with the seed's classes.
let hour = 0;
const slot = () => {
  const start = new Date(Date.UTC(2031, 2, 3 + Math.floor(hour / 8), 1 + (hour++ % 8)));
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 50 * 60000).toISOString() };
};
const made = [];
async function book(extra = {}) {
  const { data, error } = await (await maria()).from("class_sessions").insert({ teacher_id: ID.maria, student_id: ID.kenji, created_by: ID.maria, ...slot(), ...extra }).select("id").single();
  assert.equal(error, null, error?.message);
  made.push(data.id);
  return data.id;
}
const meeting = async (id) => (await svc.from("class_meetings").select("*").eq("session_id", id).maybeSingle()).data;
// Pretend the server already created the external meeting.
async function created(id, url = `https://meet.example.com/zoom/${id}`) {
  await svc.from("class_meetings").update({ external_id: `ext-${id}`, join_url: url, action: null }).eq("session_id", id);
  await svc.from("class_sessions").update({ meeting_url: url }).eq("id", id);
  return url;
}

async function connectMaria(provider = "zoom") {
  const { error } = await (await admin()).from("teacher_meeting_accounts").upsert({ teacher_id: ID.maria, provider, account_email: "maria@zoom.example", active: true });
  assert.equal(error, null, error?.message);
}

after(async () => {
  if (made.length) await svc.from("class_sessions").delete().in("id", made);
  await svc.from("teacher_meeting_accounts").delete().eq("teacher_id", ID.maria);
});

test("meeting accounts: only admins connect teachers; a teacher sees only their own", async () => {
  const row = { teacher_id: ID.maria, provider: "zoom", account_email: "maria@zoom.example" };
  assert.ok((await (await maria()).from("teacher_meeting_accounts").insert(row)).error, "teacher can't connect themselves");
  assert.ok((await (await kenji()).from("teacher_meeting_accounts").insert(row)).error, "student can't");
  assert.ok((await (await admin()).from("teacher_meeting_accounts").insert({ ...row, account_email: "not-an-email" })).error, "email checked");
  await connectMaria();
  assert.equal((await (await maria()).from("teacher_meeting_accounts").select("teacher_id")).data.length, 1);
  assert.equal((await (await james()).from("teacher_meeting_accounts").select("teacher_id")).data.length, 0, "other teachers see nothing");
  assert.equal((await (await kenji()).from("teacher_meeting_accounts").select("teacher_id")).data.length, 0, "students see nothing");
});

test("booking: a class without a link queues a meeting; one with a link does not", async () => {
  await connectMaria();
  const a = await book();
  const m = await meeting(a);
  assert.equal(m?.action, "create");
  assert.equal(m.provider, "zoom");
  assert.equal(m.host_email, "maria@zoom.example");
  const b = await book({ meeting_url: "https://zoom.us/j/123" });
  assert.equal(await meeting(b), null, "a typed-in link is left alone");
});

test("the queue is visible to the class's teacher and admins only, and nobody writes to it directly", async () => {
  await connectMaria();
  const a = await book();
  assert.equal((await (await maria()).from("class_meetings").select("session_id").eq("session_id", a)).data.length, 1);
  assert.equal((await (await admin()).from("class_meetings").select("session_id").eq("session_id", a)).data.length, 1);
  assert.equal((await (await james()).from("class_meetings").select("session_id").eq("session_id", a)).data.length, 0);
  assert.equal((await (await kenji()).from("class_meetings").select("session_id").eq("session_id", a)).data.length, 0);
  const upd = await (await maria()).from("class_meetings").update({ action: null }).eq("session_id", a).select("session_id");
  assert.equal((upd.data ?? []).length, 0, "teacher can't change the queue");
  assert.ok((await (await maria()).rpc("claim_meeting_jobs", { p_limit: 5 })).error, "only the server takes jobs");
});

test("rescheduling keeps the meeting and its link, moved to the new time", async () => {
  await connectMaria();
  const a = await book();
  const url = await created(a);
  const s = slot();
  const { data: newId, error } = await (await maria()).rpc("reschedule_session", { p_session: a, p_starts: s.starts_at, p_ends: s.ends_at, p_reason: "test" });
  assert.equal(error, null, error?.message);
  made.push(newId);
  assert.equal(await meeting(a), null, "nothing left on the old class");
  const m = await meeting(newId);
  assert.equal(m.action, "update");
  assert.equal(m.external_id, `ext-${a}`);
  assert.equal((await svc.from("class_sessions").select("meeting_url").eq("id", newId).single()).data.meeting_url, url);
});

test("a time change on a class whose meeting wasn't made yet still asks for a create", async () => {
  await connectMaria();
  const a = await book();
  const s = slot();
  const { data: newId } = await (await maria()).rpc("reschedule_session", { p_session: a, p_starts: s.starts_at, p_ends: s.ends_at });
  made.push(newId);
  const rows = (await svc.from("class_meetings").select("session_id, action").in("session_id", [a, newId])).data;
  assert.deepEqual(rows, [{ session_id: newId, action: "create" }], "exactly one meeting, on the new class");
});

test("cancelling deletes the meeting; before it exists, it is simply dropped", async () => {
  await connectMaria();
  const a = await book();
  await created(a);
  await (await maria()).from("class_sessions").update({ status: "cancelled", status_reason: "test", cancel_requested_by: "teacher" }).eq("id", a);
  assert.equal((await meeting(a)).action, "delete");
  const b = await book();
  await (await maria()).from("class_sessions").update({ status: "cancelled", status_reason: "test", cancel_requested_by: "teacher" }).eq("id", b);
  const mb = await meeting(b);
  assert.equal(mb.action, null);
  assert.ok(mb.deleted_at);
});

test("pasting a different link replaces the automatic meeting", async () => {
  await connectMaria();
  const a = await book();
  await created(a);
  await (await maria()).from("class_sessions").update({ meeting_url: "https://zoom.us/j/999" }).eq("id", a);
  assert.equal((await meeting(a)).action, "delete");
  assert.equal((await svc.from("class_sessions").select("meeting_url").eq("id", a).single()).data.meeting_url, "https://zoom.us/j/999", "the typed link stays");
});

test("links for already-booked classes: admin only, upcoming classes without a link", async () => {
  await svc.from("teacher_meeting_accounts").delete().eq("teacher_id", ID.maria);
  const a = await book();
  const b = await book({ meeting_url: "https://zoom.us/j/555" });
  assert.equal(await meeting(a), null);
  await connectMaria("google_meet");
  assert.ok((await (await maria()).rpc("queue_meetings_for_teacher", { p_teacher: ID.maria })).error, "teachers can't");
  const { data: n, error } = await (await admin()).rpc("queue_meetings_for_teacher", { p_teacher: ID.maria });
  assert.equal(error, null, error?.message);
  assert.ok(n >= 1);
  assert.equal((await meeting(a)).provider, "google_meet");
  assert.equal(await meeting(b), null, "classes with a link are left alone");
});

test("retry: the class's teacher or an admin; not students or other teachers", async () => {
  await connectMaria();
  const a = await book();
  await svc.from("class_meetings").update({ attempts: 8, last_error: "boom" }).eq("session_id", a);
  assert.ok((await (await kenji()).rpc("retry_class_meeting", { p_session: a })).error);
  assert.ok((await (await james()).rpc("retry_class_meeting", { p_session: a })).error);
  assert.equal((await (await maria()).rpc("retry_class_meeting", { p_session: a })).error, null);
  const m = await meeting(a);
  assert.equal(m.attempts, 0);
  assert.equal(m.last_error, null);
});

test("the server claims each job once until the claim expires", async () => {
  await connectMaria();
  const a = await book();
  const first = await svc.rpc("claim_meeting_jobs", { p_limit: 5, p_session: a });
  assert.equal(first.error, null, first.error?.message);
  assert.deepEqual(first.data.map((j) => j.session_id), [a]);
  const second = await svc.rpc("claim_meeting_jobs", { p_limit: 5, p_session: a });
  assert.equal(second.data.length, 0, "already claimed");
});

test("automatic recordings: one per external recording, labelled by source", async () => {
  const s = made[0];
  const row = { session_id: s, url: "https://zoom.us/rec/share/auto", source: "zoom", external_id: "zoom:abc" };
  assert.equal((await svc.from("class_recordings").insert(row)).error, null);
  assert.ok((await svc.from("class_recordings").insert(row)).error, "the same recording is not added twice");
  assert.ok((await svc.from("class_recordings").insert({ ...row, external_id: "x:1", source: "dropbox" })).error, "known sources only");
  await svc.from("class_recordings").delete().eq("session_id", s);
});

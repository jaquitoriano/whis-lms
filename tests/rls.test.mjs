// Privacy tests: log in as each seeded user and check what the database lets them see.
// Run against the LOCAL database only:  npm run test:rls
// Requires `npx supabase start` + `npx supabase db reset` (loads seed.sql).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(URL && ANON, "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
assert.ok(/127\.0\.0\.1|localhost/.test(URL), "Refusing to run privacy tests against a non-local database");

const ID = {
  admin: "00000000-0000-4000-a000-000000000001",
  maria: "00000000-0000-4000-a000-000000000011", // teaches kenji + minjun
  james: "00000000-0000-4000-a000-000000000012", // teaches ana
  kenji: "00000000-0000-4000-a000-000000000021",
  ana: "00000000-0000-4000-a000-000000000022",
  minjun: "00000000-0000-4000-a000-000000000023",
};

async function as(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "Password123!" });
  assert.equal(error, null, `login failed for ${email}`);
  return c;
}
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const ids = (rows, key = "id") => (rows ?? []).map((r) => r[key]).sort();

test("student sees only their own profile and their own teacher", async () => {
  const kenji = await as("student1@school.test");
  const { data } = await kenji.from("profiles").select("id");
  const seen = new Set(ids(data));
  assert.ok(seen.has(ID.kenji), "sees self");
  assert.ok(seen.has(ID.maria), "sees own teacher");
  assert.ok(!seen.has(ID.ana), "must NOT see another student");
  assert.ok(!seen.has(ID.minjun), "must NOT see a classmate of the same teacher");
  assert.ok(!seen.has(ID.admin), "must NOT see admin profile");
});

test("student cannot read another student's enrollment, contacts or guardians", async () => {
  const kenji = await as("student1@school.test");
  const sp = await kenji.from("student_profiles").select("user_id");
  assert.deepEqual(ids(sp.data, "user_id"), [ID.kenji]);
  const contacts = await kenji.from("profile_contacts").select("user_id");
  assert.deepEqual(ids(contacts.data, "user_id"), [ID.kenji], "teacher contact hidden while setting is off");
  const g = await kenji.from("guardians").select("id").eq("student_id", ID.minjun);
  assert.equal(g.data.length, 0);
});

test("student cannot promote themselves or change their status", async () => {
  const kenji = await as("student1@school.test");
  const r = await kenji.from("profiles").update({ role: "admin" }).eq("id", ID.kenji);
  assert.ok(r.error, "role change must be rejected");
  const s = await kenji.from("profiles").update({ status: "on_hold" }).eq("id", ID.kenji).select();
  assert.ok(s.error, "status change must be rejected");
  const admin = await as("admin@school.test");
  const { data } = await admin.from("profiles").select("role, status").eq("id", ID.kenji).single();
  assert.deepEqual(data, { role: "student", status: "active" }, "role and status unchanged");
});

test("student cannot assign themselves a teacher or edit their enrollment", async () => {
  const ana = await as("student2@school.test");
  const r = await ana.from("teacher_students").insert({ teacher_id: ID.maria, student_id: ID.ana });
  assert.ok(r.error, "insert into teacher_students must be rejected");
  const u = await ana.from("student_profiles").update({ class_level: "C2" }).eq("user_id", ID.ana).select();
  assert.equal((u.data ?? []).length, 0, "enrollment update must affect no rows");
});

test("teacher sees only assigned students", async () => {
  const maria = await as("teacher1@school.test");
  const { data } = await maria.from("student_profiles").select("user_id");
  assert.deepEqual(ids(data, "user_id"), [ID.kenji, ID.minjun].sort());
  const ana = await maria.from("profiles").select("id").eq("id", ID.ana);
  assert.equal(ana.data.length, 0, "must NOT see another teacher's student");
  const anaContact = await maria.from("profile_contacts").select("user_id").eq("user_id", ID.ana);
  assert.equal(anaContact.data.length, 0);
});

test("teacher cannot see admin notes about themselves or settings", async () => {
  const maria = await as("teacher1@school.test");
  const n = await maria.from("teacher_admin_notes").select("*");
  assert.equal(n.data.length, 0);
  const s = await maria.from("settings").select("*");
  assert.equal(s.data.length, 0);
});

test("teacher cannot assign students to themselves", async () => {
  const maria = await as("teacher1@school.test");
  const r = await maria.from("teacher_students").insert({ teacher_id: ID.maria, student_id: ID.ana });
  assert.ok(r.error);
});

test("public visitors see active courses and public teachers, nothing private", async () => {
  const pub = anon();
  const c = await pub.from("courses").select("id");
  assert.ok(c.data.length >= 3);
  const p = await pub.from("profiles").select("id");
  assert.deepEqual(ids(p.data), [ID.maria, ID.james].sort(), "only website teachers");
  for (const table of ["profile_contacts", "student_profiles", "guardians", "teacher_students", "inquiries", "audit_log", "settings"]) {
    const r = await pub.from(table).select("*");
    assert.equal((r.data ?? []).length, 0, `anon must not read ${table}`);
  }
});

test("public can submit an inquiry but not read inquiries", async () => {
  const pub = anon();
  const ins = await pub.from("inquiries").insert({ full_name: "Test Visitor", email: "visitor@example.com" });
  assert.equal(ins.error, null);
  const read = await pub.from("inquiries").select("*");
  assert.equal(read.data.length, 0);
});

test("admin sees everyone and audit log records privileged changes", async () => {
  const admin = await as("admin@school.test");
  const { data } = await admin.from("profiles").select("id");
  assert.equal(data.length, 6);
  await admin.from("profiles").update({ status: "on_hold" }).eq("id", ID.ana);
  await admin.from("profiles").update({ status: "active" }).eq("id", ID.ana);
  const log = await admin.from("audit_log").select("*").eq("entity_id", ID.ana).eq("action", "profile.privileged_update");
  assert.ok(log.data.length >= 2);
});

test("contact visibility follows the admin setting", async () => {
  const admin = await as("admin@school.test");
  await admin.from("settings").upsert({ key: "students_can_view_teacher_contact", value: true });
  try {
    const kenji = await as("student1@school.test");
    const c = await kenji.from("profile_contacts").select("user_id");
    assert.deepEqual(ids(c.data, "user_id"), [ID.maria, ID.kenji].sort());
  } finally {
    await admin.from("settings").upsert({ key: "students_can_view_teacher_contact", value: false });
  }
});

test("unassigning a student removes the teacher's access immediately", async () => {
  const admin = await as("admin@school.test");
  await admin.from("teacher_students").update({ active: false }).eq("teacher_id", ID.maria).eq("student_id", ID.minjun);
  try {
    const maria = await as("teacher1@school.test");
    const r = await maria.from("profiles").select("id").eq("id", ID.minjun);
    assert.equal(r.data.length, 0);
  } finally {
    await admin.from("teacher_students").update({ active: true }).eq("teacher_id", ID.maria).eq("student_id", ID.minjun);
  }
});

test("admin-created accounts get the requested role and profile rows", async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(key, "SUPABASE_SERVICE_ROLE_KEY needed for this test");
  const svc = createClient(URL, key, { auth: { persistSession: false } });
  const { data, error } = await svc.auth.admin.createUser({
    email: `roletest-${Date.now()}@school.test`, password: "TempPass12345", email_confirm: true,
    app_metadata: { role: "teacher" }, user_metadata: { full_name: "Role Test" },
  });
  assert.equal(error, null);
  try {
    const p = await svc.from("profiles").select("role").eq("id", data.user.id).single();
    assert.equal(p.data.role, "teacher");
    const t = await svc.from("teacher_profiles").select("user_id").eq("user_id", data.user.id);
    assert.equal(t.data.length, 1);
    const s = await svc.from("student_profiles").select("user_id").eq("user_id", data.user.id);
    assert.equal(s.data.length, 0);
  } finally {
    await svc.auth.admin.deleteUser(data.user.id);
  }
});

// ---------------------------------------------------------------------------
// Phase 2: classes, lesson records, materials
// ---------------------------------------------------------------------------
const SESSION = {
  kenjiDone1: "20000000-0000-4000-a000-000000000001",
  kenjiUpcoming: "20000000-0000-4000-a000-000000000003",
  anaToday: "20000000-0000-4000-a000-000000000007",
};

test("student sees only their own classes", async () => {
  const kenji = await as("student1@school.test");
  const { data } = await kenji.from("class_sessions").select("student_id");
  assert.ok(data.length > 0);
  assert.ok(data.every((r) => r.student_id === ID.kenji));
  const ana = await kenji.from("class_sessions").select("id").eq("id", SESSION.anaToday);
  assert.equal(ana.data.length, 0);
});

test("student cannot create, edit or cancel classes", async () => {
  const kenji = await as("student1@school.test");
  const ins = await kenji.from("class_sessions").insert({
    teacher_id: ID.maria, student_id: ID.kenji, starts_at: "2030-01-01T01:00:00Z", ends_at: "2030-01-01T01:50:00Z",
  });
  assert.ok(ins.error);
  const upd = await kenji.from("class_sessions").update({ status: "cancelled" }).eq("id", SESSION.kenjiUpcoming).select();
  assert.equal((upd.data ?? []).length, 0);
});

test("student reads shared lesson records but not private notes or unshared drafts", async () => {
  const kenji = await as("student1@school.test");
  const shared = await kenji.from("lesson_records").select("session_id").eq("session_id", SESSION.kenjiDone1);
  assert.equal(shared.data.length, 1);
  const draft = await kenji.from("lesson_records").select("session_id").eq("session_id", SESSION.kenjiUpcoming);
  assert.equal(draft.data.length, 0, "unshared record hidden");
  const priv = await kenji.from("lesson_private_notes").select("*");
  assert.equal(priv.data.length, 0);
  const write = await kenji.from("lesson_records").update({ feedback_overall: "hacked" }).eq("session_id", SESSION.kenjiDone1).select();
  assert.equal((write.data ?? []).length, 0);
});

test("teacher cannot see or book another teacher's student", async () => {
  const maria = await as("teacher1@school.test");
  const r = await maria.from("class_sessions").select("id").eq("id", SESSION.anaToday);
  assert.equal(r.data.length, 0);
  const ins = await maria.from("class_sessions").insert({
    teacher_id: ID.maria, student_id: ID.ana, starts_at: "2030-01-01T01:00:00Z", ends_at: "2030-01-01T01:50:00Z",
  });
  assert.ok(ins.error);
  const forOther = await maria.from("class_sessions").insert({
    teacher_id: ID.james, student_id: ID.ana, starts_at: "2030-01-01T01:00:00Z", ends_at: "2030-01-01T01:50:00Z",
  });
  assert.ok(forOther.error, "cannot book on behalf of another teacher");
});

test("double-booking is rejected by the database", async () => {
  const maria = await as("teacher1@school.test");
  const a = await maria.from("class_sessions").insert({
    teacher_id: ID.maria, student_id: ID.kenji, starts_at: "2030-02-01T01:00:00Z", ends_at: "2030-02-01T01:50:00Z",
  }).select("id").single();
  assert.equal(a.error, null);
  try {
    const clashTeacher = await maria.from("class_sessions").insert({
      teacher_id: ID.maria, student_id: ID.minjun, starts_at: "2030-02-01T01:30:00Z", ends_at: "2030-02-01T02:20:00Z",
    });
    assert.equal(clashTeacher.error?.code, "23P01");
    const james = await as("teacher2@school.test");
    const admin = await as("admin@school.test");
    await admin.from("teacher_students").insert({ teacher_id: ID.james, student_id: ID.kenji });
    const clashStudent = await james.from("class_sessions").insert({
      teacher_id: ID.james, student_id: ID.kenji, starts_at: "2030-02-01T01:10:00Z", ends_at: "2030-02-01T01:40:00Z",
    });
    assert.equal(clashStudent.error?.code, "23P01", "student can't be in two classes at once");
    await admin.from("teacher_students").delete().eq("teacher_id", ID.james).eq("student_id", ID.kenji);
  } finally {
    const admin = await as("admin@school.test");
    await admin.from("class_sessions").delete().eq("id", a.data.id);
  }
});

test("teacher cannot record a teacher absence; reschedule keeps history", async () => {
  const maria = await as("teacher1@school.test");
  const s = await maria.from("class_sessions").insert({
    teacher_id: ID.maria, student_id: ID.kenji, starts_at: "2030-03-01T01:00:00Z", ends_at: "2030-03-01T01:50:00Z",
  }).select("id").single();
  const admin = await as("admin@school.test");
  try {
    const abs = await maria.from("class_sessions").update({ status: "teacher_absent" }).eq("id", s.data.id);
    assert.ok(abs.error);
    const r = await maria.rpc("reschedule_session", { p_session: s.data.id, p_starts: "2030-03-02T01:00:00Z", p_ends: "2030-03-02T01:50:00Z" });
    assert.equal(r.error, null);
    const old = await maria.from("class_sessions").select("status").eq("id", s.data.id).single();
    assert.equal(old.data.status, "rescheduled");
    const moved = await maria.from("class_sessions").select("rescheduled_from_id").eq("id", r.data).single();
    assert.equal(moved.data.rescheduled_from_id, s.data.id);
    await admin.from("class_sessions").delete().eq("id", r.data);
  } finally {
    await admin.from("class_sessions").delete().eq("id", s.data.id);
  }
});

test("lesson record prefills Previous lesson from the last completed class", async () => {
  const maria = await as("teacher1@school.test");
  const { data } = await maria.from("lesson_records").select("previous_session_id, previous_summary").eq("session_id", SESSION.kenjiUpcoming).single();
  assert.equal(data.previous_session_id, "20000000-0000-4000-a000-000000000002");
  assert.match(data.previous_summary, /conclusions/i);
});

test("material files are private to the class", async () => {
  const maria = await as("teacher1@school.test");
  const path = `${SESSION.kenjiUpcoming}/rls-test.pdf`;
  const up = await maria.storage.from("materials").upload(path, new Blob(["%PDF-1.4"], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
  assert.equal(up.error, null);
  try {
    const kenji = await as("student1@school.test");
    const ok = await kenji.storage.from("materials").createSignedUrl(path, 60);
    assert.equal(ok.error, null, "own student can open it");
    const ana = await as("student2@school.test");
    const no = await ana.storage.from("materials").createSignedUrl(path, 60);
    assert.ok(no.error, "another student cannot");
    const james = await as("teacher2@school.test");
    const no2 = await james.storage.from("materials").createSignedUrl(path, 60);
    assert.ok(no2.error, "another teacher cannot");
    const sneaky = await ana.storage.from("materials").upload(`${SESSION.kenjiUpcoming}/x.pdf`, new Blob(["x"], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert.ok(sneaky.error, "students cannot upload into a class");
  } finally {
    await maria.storage.from("materials").remove([path]);
  }
});

// ---------------------------------------------------------------------------
// Phase 3: homework
// ---------------------------------------------------------------------------
const HW = { kenjiCompleted: "30000000-0000-4000-a000-000000000001", kenjiSubmitted: "30000000-0000-4000-a000-000000000002" };
const svc = () => createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function newHomework(teacher, studentId, title, dueInMs = 86400000) {
  const { data, error } = await teacher
    .from("homework_assignments")
    .insert({ teacher_id: ID.maria, student_id: studentId, title, due_at: new Date(Date.now() + dueInMs).toISOString() })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

async function removeHomework(id) {
  const s = svc();
  const walk = async (prefix) => {
    const { data } = await s.storage.from("homework").list(prefix, { limit: 100 });
    let out = [];
    for (const o of data ?? []) {
      const p = `${prefix}/${o.name}`;
      if (o.id) out.push(p);
      else out = out.concat(await walk(p));
    }
    return out;
  };
  const files = await walk(id);
  if (files.length) await s.storage.from("homework").remove(files);
  await s.from("homework_assignments").delete().eq("id", id);
}

test("homework is visible only to the student, their teacher and admins", async () => {
  const ana = await as("student2@school.test");
  const a = await ana.from("homework_assignments").select("id");
  assert.equal(a.data.length, 0, "Ana has no homework and sees none of Kenji's");
  const kenji = await as("student1@school.test");
  const k = await kenji.from("homework_assignments").select("student_id");
  assert.ok(k.data.length >= 3 && k.data.every((r) => r.student_id === ID.kenji));
  const james = await as("teacher2@school.test");
  const j = await james.from("homework_assignments").select("id").eq("id", HW.kenjiCompleted);
  assert.equal(j.data.length, 0, "another teacher can't see it");
  const js = await james.from("homework_submissions").select("id").eq("assignment_id", HW.kenjiCompleted);
  assert.equal(js.data.length, 0);
});

test("teacher can't assign homework to another teacher's student", async () => {
  const maria = await as("teacher1@school.test");
  const r = await maria.from("homework_assignments").insert({ teacher_id: ID.maria, student_id: ID.ana, title: "x", due_at: "2030-01-01T00:00:00Z" });
  assert.ok(r.error);
});

test("students can't change status, create versions directly, or edit handed-in work", async () => {
  const kenji = await as("student1@school.test");
  const st = await kenji.from("homework_assignments").update({ status: "completed" }).eq("id", HW.kenjiSubmitted).select();
  assert.equal((st.data ?? []).length, 0);
  const ins = await kenji.from("homework_submissions").insert({ assignment_id: HW.kenjiSubmitted, version: 9, answer_text: "x" });
  assert.ok(ins.error);
  const ed = await kenji.from("homework_submissions").update({ answer_text: "changed" }).eq("assignment_id", HW.kenjiCompleted).select();
  assert.equal((ed.data ?? []).length, 0, "submitted versions are frozen");
  const sub = await kenji.rpc("submit_homework", { p_assignment: HW.kenjiSubmitted });
  assert.ok(sub.error, "can't resubmit while waiting for review");
});

test("full homework loop: draft privacy, review visibility, revision, versions", async () => {
  const maria = await as("teacher1@school.test");
  const kenji = await as("student1@school.test");
  const id = await newHomework(maria, ID.kenji, "RLS loop");
  try {
    const { data: d1 } = await kenji.rpc("open_homework_draft", { p_assignment: id });
    const sv = await kenji.from("homework_submissions").update({ answer_text: "draft one" }).eq("id", d1).select();
    assert.equal(sv.data.length, 1);
    const peek = await maria.from("homework_submissions").select("id").eq("id", d1);
    assert.equal(peek.data.length, 0, "teacher can't see an unsubmitted draft");
    assert.equal((await kenji.rpc("submit_homework", { p_assignment: id })).error, null);
    const s1 = await maria.from("homework_submissions").select("is_late, version").eq("id", d1).single();
    assert.deepEqual(s1.data, { is_late: false, version: 1 });

    await maria.rpc("start_homework_review", { p_assignment: id });
    const ur = await maria.from("homework_assignments").select("status").eq("id", id).single();
    assert.equal(ur.data.status, "under_review");
    await maria.from("homework_reviews").upsert({ submission_id: d1, comments: "draft feedback" });
    const hidden = await kenji.from("homework_reviews").select("*").eq("submission_id", d1);
    assert.equal(hidden.data.length, 0, "unsent feedback is hidden from the student");
    assert.equal((await maria.rpc("send_homework_review", { p_submission: d1, p_decision: "needs_revision" })).error, null);
    const visible = await kenji.from("homework_reviews").select("comments, decision").eq("submission_id", d1);
    assert.deepEqual(visible.data, [{ comments: "draft feedback", decision: "needs_revision" }]);
    const locked = await maria.from("homework_reviews").update({ comments: "changed after sending" }).eq("submission_id", d1).select();
    assert.equal((locked.data ?? []).length, 0, "sent feedback can't be edited");

    const title = await maria.from("homework_assignments").update({ title: "renamed" }).eq("id", id);
    assert.ok(title.error, "only the deadline can change after a submission");
    const due = await maria.from("homework_assignments").update({ due_at: new Date(Date.now() + 2 * 86400000).toISOString() }).eq("id", id);
    assert.equal(due.error, null);
    const del = await maria.from("homework_assignments").delete().eq("id", id);
    assert.ok(del.error, "can't withdraw submitted homework");

    const { data: d2 } = await kenji.rpc("open_homework_draft", { p_assignment: id });
    assert.notEqual(d2, d1);
    await kenji.from("homework_submissions").update({ answer_text: "draft two" }).eq("id", d2);
    assert.equal((await kenji.rpc("submit_homework", { p_assignment: id })).error, null);
    const v = await kenji.from("homework_submissions").select("version").eq("assignment_id", id).order("version");
    assert.deepEqual(v.data.map((x) => x.version), [1, 2], "both versions kept");
    const stale = await maria.rpc("send_homework_review", { p_submission: d1, p_decision: "completed" });
    assert.ok(stale.error, "only the latest version can be reviewed");
    assert.equal((await maria.rpc("send_homework_review", { p_submission: d2, p_decision: "completed" })).error, null);
    assert.ok((await kenji.rpc("open_homework_draft", { p_assignment: id })).error, "completed homework is closed");
  } finally {
    await removeHomework(id);
  }
});

test("late submissions are marked late", async () => {
  const maria = await as("teacher1@school.test");
  const kenji = await as("student1@school.test");
  const id = await newHomework(maria, ID.kenji, "RLS late", -3600000);
  try {
    const { data: d } = await kenji.rpc("open_homework_draft", { p_assignment: id });
    await kenji.from("homework_submissions").update({ answer_text: "late answer" }).eq("id", d);
    assert.equal((await kenji.rpc("submit_homework", { p_assignment: id })).error, null, "late work is accepted");
    const { data } = await kenji.from("homework_submissions").select("is_late").eq("id", d).single();
    assert.equal(data.is_late, true);
  } finally {
    await removeHomework(id);
  }
});

test("homework files are private: drafts, other students and unsent corrections", async () => {
  const kenji = await as("student1@school.test");
  const maria = await as("teacher1@school.test");
  const ana = await as("student2@school.test");
  const id = await newHomework(maria, ID.kenji, "RLS files");
  const pdf = () => new Blob(["%PDF-1.4"], { type: "application/pdf" });
  const opts = { contentType: "application/pdf" };
  try {
    const { data: draft } = await kenji.rpc("open_homework_draft", { p_assignment: id });
    const sp = `${id}/${draft}/submission/answer.pdf`;
    assert.equal((await kenji.storage.from("homework").upload(sp, pdf(), opts)).error, null);
    await kenji.from("homework_files").insert({ assignment_id: id, submission_id: draft, kind: "submission", storage_path: sp, file_name: "answer.pdf", uploaded_by: ID.kenji });
    assert.ok((await maria.storage.from("homework").createSignedUrl(sp, 60)).error, "teacher can't open a draft file");
    assert.ok((await ana.storage.from("homework").createSignedUrl(sp, 60)).error, "another student can't open it");
    assert.ok((await ana.storage.from("homework").upload(`${id}/${draft}/submission/x.pdf`, pdf(), opts)).error, "another student can't upload");
    await kenji.rpc("submit_homework", { p_assignment: id });
    assert.equal((await maria.storage.from("homework").createSignedUrl(sp, 60)).error, null, "teacher can open it once submitted");
    assert.ok((await kenji.storage.from("homework").upload(`${id}/${draft}/submission/later.pdf`, pdf(), opts)).error, "no adding files after submitting");

    const cp = `${id}/${draft}/correction/marked.pdf`;
    assert.equal((await maria.storage.from("homework").upload(cp, pdf(), opts)).error, null);
    assert.ok((await kenji.storage.from("homework").createSignedUrl(cp, 60)).error, "correction hidden until feedback is sent");
    await maria.rpc("send_homework_review", { p_submission: draft, p_decision: "completed" });
    assert.equal((await kenji.storage.from("homework").createSignedUrl(cp, 60)).error, null, "correction visible after sending");
  } finally {
    await removeHomework(id);
  }
});

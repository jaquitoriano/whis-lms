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

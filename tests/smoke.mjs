// Page smoke test: logs in as each seeded user and checks key pages render with the
// right content, and that pages for other people's data are refused.
// Needs `npm run dev` running and a freshly seeded LOCAL database (`npm run db:reset`).
// Run: npm run test:smoke
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Smoke tests run against the local database only");

async function cookieFor(email) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "Password123!" });
  if (error) throw error;
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const val = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i < val.length; i += 3180) parts.push(val.slice(i, i + 3180));
  return parts.length === 1 ? `sb-${ref}-auth-token=${val}` : parts.map((p, i) => `sb-${ref}-auth-token.${i}=${p}`).join("; ");
}
async function get(cookie, path) {
  const r = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  return { status: r.status, loc: r.headers.get("location"), body: r.status === 200 ? await r.text() : "" };
}

const S1 = "20000000-0000-4000-a000-000000000001"; // Kenji, completed, shared notes
const S3 = "20000000-0000-4000-a000-000000000003"; // Kenji, upcoming, materials + video
const S7 = "20000000-0000-4000-a000-000000000007"; // Ana with James
const KENJI = "00000000-0000-4000-a000-000000000021";
const MINJUN = "00000000-0000-4000-a000-000000000023";
const ANA = "00000000-0000-4000-a000-000000000022";

const mustHave = [
  ["admin@school.test", "/admin", ["Classes today", "Past classes not closed", "Students without a teacher"]],
  ["admin@school.test", "/admin/users?role=student", ["Kenji Tanaka", "Ana Reyes", "Min-jun Park"]],
  ["admin@school.test", `/admin/users/${MINJUN}`, ["Ji-woo Park", "Maria Santos", "Enrollment"]],
  ["admin@school.test", "/admin/courses", ["IELTS Preparation", "Add a course"]],
  ["admin@school.test", "/admin/settings", ["Students can see their teacher"]],
  ["admin@school.test", "/admin/schedules?view=week", ["Class schedules", "All teachers"]],
  ["admin@school.test", "/admin/schedules/new", ["Kenji Tanaka with Maria Santos"]],
  ["admin@school.test", `/admin/classes/${S7}`, ["Teacher absent", "Ana Reyes"]],
  ["admin@school.test", "/admin/lessons", ["without lesson notes"]],
  ["teacher1@school.test", "/teacher", ["Today&#x27;s classes", "Min-jun Park", "Upcoming"]],
  ["teacher1@school.test", "/teacher/calendar?view=week", ["Asia/Manila", "09:00–18:00", "Kenji Tanaka"]],
  ["teacher1@school.test", "/teacher/calendar?view=month", ["Kenji Tanaka"]],
  ["teacher1@school.test", "/teacher/calendar/new", ["Schedule a class", "Kenji Tanaka", "Repeat weekly"]],
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Mark completed", "Cambridge IELTS 18", "youtube-nocookie.com/embed/", "1. Previous lesson", "Visible to student", "Private notes", "Asia/Tokyo"]],
  ["teacher1@school.test", "/teacher/availability", ["Weekly teaching hours", "Training day"]],
  ["teacher1@school.test", "/teacher/lessons", ["Lesson records", "Kenji Tanaka"]],
  ["teacher1@school.test", `/teacher/students/${KENJI}`, ["Lesson history", "Upcoming classes"]],
  ["teacher1@school.test", "/teacher/profile", ["CELTA"]],
  ["student1@school.test", "/student", ["Next class", "Join class", "Latest feedback"]],
  ["student1@school.test", "/student/calendar?view=week", ["Maria Santos"]],
  ["student1@school.test", `/student/classes/${S1}`, ["Teacher&#x27;s feedback", "peoples"]],
  ["student1@school.test", `/student/classes/${S3}`, ["Cambridge IELTS 18", "Join class", "will appear here after the class"]],
  ["student1@school.test", "/student/materials", ["Cambridge IELTS 18", "Speaking Part 3"]],
  ["student1@school.test", "/student/lessons", ["Lesson history", "Maria Santos"]],
  ["student1@school.test", "/student/teacher", ["Maria Santos"]],
];
const refused = [
  ["teacher1@school.test", `/teacher/students/${ANA}`, (r) => r.status === 404, "teacher opening another teacher's student -> 404"],
  ["teacher1@school.test", `/teacher/classes/${S7}`, (r) => r.status === 404, "teacher opening another teacher's class -> 404"],
  ["student1@school.test", `/student/classes/${S7}`, (r) => r.status === 404, "student opening another student's class -> 404"],
  ["student1@school.test", "/admin", (r) => r.status === 307 && r.loc.includes("/student"), "student opening /admin -> redirected"],
  ["teacher1@school.test", "/admin/users", (r) => r.status === 307 && r.loc.includes("/teacher"), "teacher opening admin -> redirected"],
];
const mustNotHave = [
  ["student1@school.test", `/student/classes/${S3}`, ["Mark completed", "Private notes", "Upload file"], "student class page has no edit controls"],
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Teacher absent"], "teacher can't mark teacher absent"],
];

const cookies = {};
const login = async (u) => (cookies[u] ??= await cookieFor(u));
let fail = 0;
for (const [u, p, needles] of mustHave) {
  const r = await get(await login(u), p);
  const miss = needles.filter((n) => !r.body.includes(n));
  const ok = r.status === 200 && !miss.length;
  if (!ok) fail++;
  console.log(ok ? "PASS" : "FAIL", u.split("@")[0], p, ok ? "" : `status=${r.status} ${r.loc ?? ""} missing=${JSON.stringify(miss)}`);
}
for (const [u, p, check, label] of refused) {
  const r = await get(await login(u), p);
  const ok = check(r);
  if (!ok) fail++;
  console.log(ok ? "PASS" : "FAIL", label, ok ? "" : `status=${r.status} ${r.loc ?? ""}`);
}
for (const [u, p, bad, label] of mustNotHave) {
  const r = await get(await login(u), p);
  const found = bad.filter((n) => r.body.includes(n));
  const ok = r.status === 200 && !found.length;
  if (!ok) fail++;
  console.log(ok ? "PASS" : "FAIL", label, ok ? "" : `status=${r.status} found=${JSON.stringify(found)}`);
}
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);

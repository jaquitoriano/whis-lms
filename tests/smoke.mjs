// Page smoke test: logs in as each seeded user and checks key pages render with the
// right content, and that pages for other people's data are refused.
// Needs `npm run dev` running and a freshly seeded LOCAL database (`npm run db:reset`).
// Run: npm run test:smoke
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
if (!/127\.0\.0\.1|localhost/.test(env.NEXT_SUPABASE_URL)) throw new Error("Smoke tests run against the local database only");

async function cookieFor(email) {
  const c = createClient(env.NEXT_SUPABASE_URL, env.NEXT_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "Password123!" });
  if (error) throw error;
  const ref = new URL(env.NEXT_SUPABASE_URL).hostname.split(".")[0];
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
const HW1 = "30000000-0000-4000-a000-000000000001"; // Kenji, completed after a revision
const HW2 = "30000000-0000-4000-a000-000000000002"; // Kenji, submitted, waiting for review
const HW3 = "30000000-0000-4000-a000-000000000003"; // Kenji, open
const R_KENJI = "60000000-0000-4000-a000-000000000002"; // Kenji's latest published report (Maria)
const R_ANA = "60000000-0000-4000-a000-000000000003"; // Ana's report (James)
const R_DRAFT = "60000000-0000-4000-a000-000000000004"; // Min-jun, Maria's draft
const T_GENERAL = "62000000-0000-4000-a000-000000000001"; // Maria <-> Kenji
const T_CLASS = "62000000-0000-4000-a000-000000000002"; // about class S3

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
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Mark completed", "Cambridge IELTS 18", "i.ytimg.com/vi/", "1. Previous lesson", "Visible to student", "Private notes", "Asia/Tokyo"]],
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
  ["teacher1@school.test", "/teacher/homework", ["To review", "Speaking Part 2 recording"]],
  ["teacher1@school.test", "/teacher/homework?tab=student", ["Vocabulary: environment", "Past simple practice", "Overdue"]],
  ["teacher1@school.test", "/teacher/homework?tab=completed", ["Task 2 essay: remote work"]],
  ["teacher1@school.test", "/teacher/homework/new", ["Assign homework", "Deadline"]],
  ["teacher1@school.test", `/teacher/homework/new?session=${S3}`, ["Kenji Tanaka", "Attach links from this class", "Cambridge IELTS 18"]],
  ["teacher1@school.test", `/teacher/homework/${HW2}`, ["Review version", "Request revision", "Kyoto", "Upload corrected file"]],
  ["teacher1@school.test", `/teacher/homework/${HW1}`, ["Submission history", "Revision requested", "Change deadline", "I am agree"]],
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Vocabulary: environment", "Assign homework"]],
  ["teacher1@school.test", `/teacher/students/${KENJI}`, ["Homework", "Task 2 essay"]],
  ["teacher1@school.test", "/teacher", ["Homework to review", "Speaking Part 2 recording"]],
  ["student1@school.test", "/student/homework", ["Vocabulary: environment"]],
  ["student1@school.test", "/student/homework?tab=completed", ["Task 2 essay: remote work"]],
  ["student1@school.test", `/student/homework/${HW3}`, ["Your work", "Submit homework", "Add files or photos", "Environment vocabulary list"]],
  ["student1@school.test", `/student/homework/${HW1}`, ["Teacher feedback", "I am agree", "Band 6.5", "Late"]],
  ["student1@school.test", "/student", ["Homework to do", "Vocabulary: environment"]],
  ["student1@school.test", "/student/calendar?view=month", ["Due "]],
  ["admin@school.test", "/admin/homework", ["Homework monitoring", "Overdue (required)", "Past simple practice"]],
  ["admin@school.test", `/admin/homework/${HW1}`, ["Submission history", "Band 6.5"]],
  ["admin@school.test", "/admin/announcements", ["New announcement", "Holiday schedule"]],
  ["admin@school.test", "/admin/policies", ["Acceptance of version", "Min-jun Park", "Publish new version"]],
  ["admin@school.test", "/admin/audit", ["Audit log", "Student assigned to teacher"]],
  ["admin@school.test", "/admin/account", ["Change password"]],
  ["admin@school.test", "/admin", ["Students yet to accept policies", "Full audit log"]],
  ["teacher1@school.test", "/teacher/notifications", ["Notifications", "new classes assigned"]],
  ["teacher1@school.test", "/teacher/settings", ["Email notifications", "A student submitted homework", "Change password"]],
  ["teacher1@school.test", "/teacher/announcements", ["Holiday schedule"]],
  ["teacher1@school.test", "/teacher/policies", ["Cancelling or rescheduling"]],
  ["teacher1@school.test", "/teacher", ["Announcements", "Holiday schedule", "Notifications, "]],
  ["student1@school.test", "/student/notifications", ["new classes scheduled"]],
  ["student1@school.test", "/student/settings", ["Homework checked by my teacher"]],
  ["student1@school.test", "/student/policies", ["You accepted these policies"]],
  ["student1@school.test", "/student", ["Holiday schedule"]],
  ["student3@school.test", "/accept-policies", ["Please read them and confirm", "Accept and continue"]],
  // Phase 6: progress, IELTS, messages
  ["teacher1@school.test", "/teacher/progress", ["Student progress", "Kenji Tanaka", "Min-jun Park", "Draft"]],
  ["teacher1@school.test", `/teacher/progress/${KENJI}`, ["Latest report", "B2", "IELTS results", "Overall band", "Target 7.0", "Add a result", "Write progress report", "Cambridge IELTS 18", "Earlier reports"]],
  ["teacher1@school.test", `/teacher/progress/reports/${R_DRAFT}`, ["Publish to student", "Save draft", "Skill levels", "Min-jun Park"]],
  ["teacher1@school.test", `/teacher/progress/reports/${R_KENJI}`, ["Correct progress report", "Save changes", "Previous report"]],
  ["teacher1@school.test", "/teacher", ["Progress reports due"]],
  ["teacher1@school.test", `/teacher/students/${KENJI}`, ["Reports and IELTS", "6.5", "Message"]],
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Message about this class"]],
  ["teacher1@school.test", "/teacher/messages", ["Messages", "Kenji Tanaka", "Will we practise Speaking Part 3", "Message a student"]],
  ["teacher1@school.test", `/teacher/messages/${T_GENERAL}`, ["well done on the second version", "Should I write another Task 2 essay", "message-body", "the school office can read messages"]],
  ["student1@school.test", "/student/progress", ["My progress", "B2", "Upper intermediate", "Latest IELTS band", "6.5", "Target band", "Earlier reports", "Overall level over time"]],
  ["student1@school.test", "/student", ["My progress", "Latest IELTS band"]],
  ["student1@school.test", "/student/teacher", ["Send a message"]],
  ["student1@school.test", "/student/messages", ["Maria Santos", "Message Maria", "General"]],
  ["student1@school.test", `/student/messages/${T_CLASS}`, ["Speaking Part 3", "Class on"]],
  ["student1@school.test", "/student/settings", ["New message from my teacher", "New progress report"]],
  ["student2@school.test", "/student/progress", ["B1", "Meeting language"]],
  ["admin@school.test", "/admin/progress", ["Student progress", "Kenji Tanaka", "Ana Reyes", "James Carter"]],
  ["admin@school.test", `/admin/progress/${KENJI}`, ["Latest report", "Add a result", "Student details"]],
  ["admin@school.test", `/admin/progress/reports/${R_ANA}`, ["Correct progress report", "Remove this report"]],
  ["admin@school.test", "/admin/messages", ["Maria Santos and Kenji Tanaka"]],
  ["admin@school.test", `/admin/messages/${T_GENERAL}`, ["reading this as the school office", "well done on the second version"]],
  // Phase 7: recordings and reports
  ["teacher1@school.test", `/teacher/classes/${S1}`, ["Recording", "Add recording", "Share with the student"]],
  ["student1@school.test", `/student/classes/${S1}`, ["No recording has been shared for this class"]],
  ["student1@school.test", "/student/settings", ["Class recording available"]],
  ["admin@school.test", "/admin/settings", ["Share class recordings with students"]],
  ["admin@school.test", "/admin/reports", ["Reports", "Classes completed", "Payments received", "Month by month", "Teachers", "Maria Santos", "Students who need a look", "Kenji Tanaka", "Download CSV"]],
  ["admin@school.test", "/admin/reports?months=12", ["12 months"]],
  ["admin@school.test", "/api/reports/monthly?months=3", ["Month,Classes completed,Hours taught"]],
  ["admin@school.test", "/api/reports/teachers", ["Maria Santos"]],
  ["admin@school.test", "/api/reports/attention", ["Kenji Tanaka,Maria Santos"]],
];
const refused = [
  ["teacher1@school.test", `/teacher/students/${ANA}`, (r) => r.status === 404, "teacher opening another teacher's student -> 404"],
  ["teacher1@school.test", `/teacher/classes/${S7}`, (r) => r.status === 404, "teacher opening another teacher's class -> 404"],
  ["student1@school.test", `/student/classes/${S7}`, (r) => r.status === 404, "student opening another student's class -> 404"],
  ["student1@school.test", "/admin", (r) => r.status === 307 && r.loc.includes("/student"), "student opening /admin -> redirected"],
  ["teacher1@school.test", "/admin/users", (r) => r.status === 307 && r.loc.includes("/teacher"), "teacher opening admin -> redirected"],
  ["student3@school.test", "/student/homework", (r) => r.status === 307 && r.loc.endsWith("/accept-policies"), "student who hasn't accepted policies is sent to them"],
  ["student3@school.test", "/student", (r) => r.status === 307 && r.loc.endsWith("/accept-policies"), "...from the dashboard too"],
  ["student1@school.test", "/accept-policies", (r) => r.status === 307 && r.loc.endsWith("/student"), "students who already accepted skip the gate"],
  ["student2@school.test", `/student/homework/${HW1}`, (r) => r.status === 404, "student opening another student's homework -> 404"],
  ["teacher2@school.test", `/teacher/homework/${HW1}`, (r) => r.status === 404, "teacher opening another teacher's homework -> 404"],
  ["teacher2@school.test", `/teacher/progress/${KENJI}`, (r) => r.status === 404, "teacher opening another teacher's student's progress -> 404"],
  ["teacher2@school.test", `/teacher/progress/reports/${R_KENJI}`, (r) => r.status === 404, "teacher opening another teacher's report -> 404"],
  ["teacher1@school.test", `/teacher/progress/reports/${R_ANA}`, (r) => r.status === 404, "...the other way round too"],
  ["teacher2@school.test", `/teacher/messages/${T_GENERAL}`, (r) => r.status === 404, "teacher opening another teacher's conversation -> 404"],
  ["student2@school.test", `/student/messages/${T_GENERAL}`, (r) => r.status === 404, "student opening another student's conversation -> 404"],
  ["student1@school.test", "/student/messages/00000000-0000-4000-a000-0000000000ff", (r) => r.status === 404, "unknown conversation -> 404"],
  ["student3@school.test", "/student/messages", (r) => r.status === 307 && r.loc.endsWith("/accept-policies"), "messages are behind the policy gate too"],
  ["teacher1@school.test", "/api/reports/monthly", (r) => r.status === 404, "teachers can't download reports"],
  ["student1@school.test", "/api/reports/attention", (r) => r.status === 404, "students can't download reports"],
  ["admin@school.test", "/api/reports/nonsense", (r) => r.status === 404, "unknown report -> 404"],
  ["teacher1@school.test", "/admin/reports", (r) => r.status === 307 && r.loc.includes("/teacher"), "teacher opening admin reports -> redirected"],
];
const mustNotHave = [
  ["student1@school.test", `/student/classes/${S3}`, ["Mark completed", "Private notes", "Upload file"], "student class page has no edit controls"],
  ["teacher1@school.test", `/teacher/classes/${S3}`, ["Teacher absent"], "teacher can't mark teacher absent"],
  ["admin@school.test", `/admin/homework/${HW2}`, ["Request revision", "Upload corrected file", "Withdraw"], "admin homework view is read-only"],
  ["teacher1@school.test", "/teacher/policies", ["Accept and continue"], "teachers aren't asked to accept"],
  ["student1@school.test", `/student/homework/${HW2}`, ["Request revision", "Submit homework"], "student can't review or resubmit while under review"],
  ["student1@school.test", "/student/progress", ["Add a result", "Write progress report", "Min-jun", "Save target"], "student progress page is read-only and private"],
  ["admin@school.test", `/admin/messages/${T_GENERAL}`, ["message-body", "Attach files"], "admins can't post in conversations"],
  ["teacher1@school.test", "/teacher", ["Coming soon"], "no Phase 6 items left under Coming soon for teachers"],
  ["admin@school.test", "/admin", ["Coming soon"], "Reports is no longer under Coming soon"],
  ["student1@school.test", `/student/classes/${S1}`, ["Add recording", "Stop sharing"], "students can't manage recordings"],
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
// The middleware no longer calls the auth server, so the portal layouts must reject a forged session.
{
  const forged = "base64-" + Buffer.from(JSON.stringify({ access_token: "forged.token.value", refresh_token: "forged", expires_at: 4102444800, token_type: "bearer", user: { id: KENJI, role: "authenticated" } })).toString("base64url");
  const ref = new URL(env.NEXT_SUPABASE_URL).hostname.split(".")[0];
  for (const p of ["/student", "/teacher", "/admin", `/student/classes/${S3}`]) {
    const r = await get(`sb-${ref}-auth-token=${forged}`, p);
    const ok = r.status === 307 && /\/login/.test(r.loc ?? "") && !r.body;
    if (!ok) fail++;
    console.log(ok ? "PASS" : "FAIL", "forged session cookie refused on", p, ok ? "" : `status=${r.status} ${r.loc ?? ""}`);
  }
}
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);

# Online English & IELTS LMS

Learning management system for a one-to-one online English and IELTS school, with admin, teacher and student portals.
Stack: Next.js 15 (App Router, TypeScript, Tailwind) and Supabase (Postgres with row-level security, Auth, Storage).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Setup, login, roles, database access rules | Done |
| 1 | Public site, teacher/student profiles, basic admin (users, assignments, courses, inquiries, settings) | Done |
| 2 | Calendars (day/week/month), scheduling with double-booking prevention, teacher availability and blocked dates, class pages, three-part lesson records with autosave, materials (files and links), YouTube videos, reschedule and cancel | Done |
| 3 | Homework: assign from a class or on its own, reference files, student drafts with autosave, file and photo uploads, submit, teacher review with corrections and corrected files, revision loop with every version kept, admin monitoring | Done |
| 4 | Notifications (bell, notification centre, email, per-type email settings), scheduled reminders, announcements, versioned class policies with student acceptance, settings and password change, audit log | Done. **First launch (MVP) complete** |
| 5 | Contracts and e-signing, attendance, payments and billing | Next |
| 6–7 | Progress and IELTS reports, messaging, recordings, advanced reports | Planned (shown as "coming soon" in the portals) |

## First-time setup (Windows)

1. **Docker Desktop** needs WSL 2. In an admin PowerShell run `wsl --install --no-distribution`, restart the PC, then open Docker Desktop once and wait until it says "Engine running".
2. Install packages: `npm install`
3. Start the local database: `npm run db:start` (the first run downloads images, ~5 min).
4. Copy `.env.example` to `.env.local` and fill in the values that `npx supabase status` prints:
   - `API URL` → `NEXT_SUPABASE_URL`
   - `anon key` (or Publishable key) → `NEXT_SUPABASE_ANON_KEY`
   - `service_role key` (or Secret key) → `SUPABASE_SERVICE_ROLE_KEY`
5. Load the schema and test data: `npm run db:reset`
6. Run the app: `npm run dev`, then open http://localhost:3000

Local extras: Supabase Studio (database browser) at http://127.0.0.1:54323, and every email the app sends (password resets, notifications) lands in Mailpit at http://127.0.0.1:54324.

### Notifications and email

- Notifications are created by the database the moment something happens (class booked, cancelled or moved; homework set, submitted or reviewed; lesson notes shared; materials added; announcements; policy updates).
- Time-based ones (class reminders 24 h and 1 h before, homework due within 24 h, teachers' daily "waiting more than 48 h" reminder, announcements scheduled for later) and **all emails** are handled by a job at `/api/cron/notifications`.
- Locally, run it with `npm run notify`. In production, `vercel.json` schedules it every 15 minutes (on Vercel's free plan crons run at most daily, so use the Pro plan or any external scheduler that calls the URL with `Authorization: Bearer <CRON_SECRET>`).
- Production email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` for your provider (e.g. Resend), plus a long random `CRON_SECRET`.

## Test accounts (local only)

All passwords: `Password123!`

| Email | Role | Notes |
|---|---|---|
| admin@school.test | Admin | |
| teacher1@school.test | Teacher (Maria) | Teaches Kenji and Min-jun |
| teacher2@school.test | Teacher (James) | Teaches Ana |
| student1@school.test | Student (Kenji) | IELTS, Asia/Tokyo |
| student2@school.test | Student (Ana) | Business English |
| student3@school.test | Student (Min-jun) | Minor, with guardian |

## Privacy tests

`npm run test:rls` logs in as each test account against the **local** database and checks that:
students can't see other students, teachers see only assigned students, nobody but an admin can change roles or assignments,
the public can submit inquiries but read nothing private, and teacher contact details follow the admin setting.
Run it after every database change.

## Where things are

- `supabase/migrations/`: database schema and row-level security policies. All access rules live here.
- `supabase/seed.sql`: local test data. Never run against production.
- `src/config/site.ts`: school name, contact details, FAQ, testimonials (placeholders). Colours are in `src/app/globals.css`.
- `src/app/(public)`: public website. `src/app/admin`, `teacher`, `student`: the three portals.
- `src/lib/supabase/admin.ts`: the service-role client. It bypasses all access rules and is used only in admin server actions for creating users, setting passwords and changing emails.

## Decisions made for Phase 1 (change if needed)

- Accounts are created by admins only; public sign-up is off. The public site has a trial-class inquiry form.
- A user's role is fixed when the account is created.
- Students can edit their photo, phone and time zone. Name, course and guardians are changed by the admin.
- Students see their teacher's email and phone only if the admin turns that on (Website settings). It is off by default.
- Setting an account to Inactive blocks login immediately. On hold still allows login, with a notice.
- Privacy policy and terms pages are placeholders and must be replaced before real student data is entered.

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:rls` | 33 database privacy rules (who can see and change what, double-booking, private files, homework workflow, notifications, announcements, policies) | local database |
| `npm run test:smoke` | Every portal page renders the right content for each role, and other people's pages are refused | local database + `npm run dev` |
| `npm run test:e2e` | Real browser walk-through: schedule, autosave notes, upload, YouTube, complete, student view, reschedule | local database + `npm run dev`; first run `npx playwright install chromium` |
| `npm run test:e2e:homework` | Real browser walk-through of homework: assign, draft, photo upload, submit, review, revision, version 2, complete | same as above |
| `npm run test:e2e:phase4` | Announcement → bell → notification centre, email delivered to Mailpit, email settings, policy gate and acceptance, publishing a new policy version | same as above (also needs Docker for cleanup) |

Run `npm run db:reset` first if you have changed data by hand: the tests expect the seed data.

## Decisions made for Phase 2 (change if needed)

- Teachers can schedule, edit, cancel and reschedule their own classes with their assigned students. Admins can turn off adding and rescheduling for teachers in Website settings. Students view only and contact the school to change a class.
- Classes outside a teacher's available hours, or in a blocked period, ask for confirmation ("Schedule anyway"). Overlapping classes for the same teacher or student are always refused by the database.
- Rescheduling keeps the original class (marked Rescheduled) and creates a linked new one; materials and videos move to the new time.
- "Teacher absent" can only be recorded by an admin.
- Lesson notes are visible to the student once the teacher ticks "Visible to student" or marks the class completed. Private notes are never shown to students.
- Material files are private: they open through links that expire after one hour. Up to 25 MB per file (PDF, Word, PowerPoint, images, audio).
- Videos are YouTube embeds only (privacy-enhanced youtube-nocookie.com player); nothing is hosted by the school.

## Decisions made for Phase 3 (from the homework user stories doc, 4 Nov 2026)

- No scores or grades on homework: written feedback only. Homework is kept separate from progress reports.
- Late submission is allowed and marked **Late**. Required homework past its deadline shows as **Overdue**.
- Before anything is submitted the teacher can edit or withdraw homework. After a submission only the deadline can change.
- Each hand-in is saved as its own version and can't be edited afterwards. The student works on one draft at a time (autosaved).
- The teacher's feedback is a private draft until they choose **Request revision** or **Mark completed**. After that it can't be edited.
- Files: up to 25 MB each, kept indefinitely. iPhone (HEIC) photos are converted to JPEG in the browser before upload.
- Admins can see all homework but not change it.
- Not yet built (Phase 4): notifications for new homework, submissions, deadlines and feedback. Guardians will not receive homework emails.
- Inline highlighting inside a student's answer (a "Should" story) is not built. Teachers write corrections in the Corrections box or upload a marked-up file.

## Decisions made for Phase 4 (change if needed)

- Everything appears in the in-site notification centre. Email is on for every type by default, and each person can switch types off in **Settings**. Admins don't receive these notifications.
- People are not notified about changes they made themselves (e.g. a teacher who books a class isn't told about it). A weekly series sends one message, not one per class.
- Inactive accounts receive no notifications. Guardians receive no emails yet.
- Announcements go to everyone, all teachers, all students, or chosen people, either now or at a scheduled time, with an optional end date.
- Class policies are versioned. A published version can't be edited, only replaced by a new one. Students must accept the latest version before they can use their account; the acceptance time, IP address and browser are recorded. Teachers are notified about updates but aren't asked to accept.
- Changing a password requires the current password.

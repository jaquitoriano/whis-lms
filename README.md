# Online English & IELTS LMS

Learning management system for a one-to-one online English and IELTS school, with admin, teacher and student portals.
Stack: Next.js 16 (App Router, TypeScript, Tailwind) and Supabase (Postgres with row-level security, Auth, Storage).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Setup, login, roles, database access rules | Done |
| 1 | Public site, teacher/student profiles, basic admin (users, assignments, courses, inquiries, settings) | Done |
| 2 | Calendars (day/week/month), scheduling with double-booking prevention, teacher availability and blocked dates, class pages, three-part lesson records with autosave, materials (files and links), YouTube videos, reschedule and cancel | Done |
| 3 | Homework: assign from a class or on its own, reference files, student drafts with autosave, file and photo uploads, submit, teacher review with corrections and corrected files, revision loop with every version kept, admin monitoring | Done |
| 4 | Notifications (bell, notification centre, email, per-type email settings), scheduled reminders, announcements, versioned class policies with student acceptance, settings and password change, audit log | Done. **First launch (MVP) complete** |
| 4.5 | Phone layouts and menu, upload progress and upload fix, fewer background requests, faster queries, long lists split into pages, homework counts no longer hidden by old work | Done |
| 5 | Class packages, attendance, enrollment contracts with e-signing (student in the portal, guardian by email link), invoices, payments, receipts, monthly statements, PDFs, teacher pay | Done |
| 6 | Progress and IELTS reports, messaging | Next |
| 7 | Recordings, Zoom/Meet connection, advanced reports | Planned (shown as "coming soon" in the portals) |

## First-time setup (Fedora Linux)

Uses Docker Engine with the Docker Compose plugin.

1. Install Docker (once per device):
   ```bash
   sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
   sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER
   ```
   When asked to import Docker's signing key, check that its fingerprint is `060A 61C5 1B55 8A7F 742B 77AA C52F EB6B 621E 9F35`. Then log out and back in, so `docker` works without `sudo`. Being in the `docker` group gives root-level access to the machine, so add only trusted accounts.
2. Install packages: `npm install`
3. Start the local database: `npm run db:start` (the first run downloads images, ~5 min).
4. Steps 4–6 of the Windows setup below: `.env.local`, `npm run db:reset`, `npm run dev`.
5. Browser tests: `npx playwright install chromium`. Fedora isn't officially supported, so Playwright downloads an Ubuntu build. If the download stalls, point the tests at a Chromium you already have:
   `CHROMIUM_PATH=/path/to/chrome npm run test:e2e:phase5`. Missing system libraries: see the Fedora section of the ccsp README.

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

**If `db:start` or `db:reset` fails with "ports are not available":** Windows sometimes reserves the 54xxx ports after Docker starts. Check with `netsh interface ipv4 show excludedportrange protocol=tcp`, and clear it from an admin PowerShell with `net stop winnat; net start winnat`.

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
| `npm run test:rls` | 46 database rules: privacy (who can see and change what), double-booking, private files, homework workflow, notifications, announcements, policies, and Phase 5 (billing privacy, invoice totals and balances, no overpaying, void instead of delete, package usage, attendance, contract signing, teacher pay) | local database |
| `npm run test:smoke` | Every portal page renders the right content for each role, and other people's pages are refused | local database + `npm run dev` |
| `npm run test:e2e` | Real browser walk-through: schedule, autosave notes, upload, YouTube, complete, student view, reschedule | local database + `npm run dev`; first run `npx playwright install chromium` |
| `npm run test:e2e:homework` | Real browser walk-through of homework: assign, draft, photo upload, submit, review, revision, version 2, complete | same as above |
| `npm run test:e2e:phase5` | Invoice → part payment → PDFs (invoice, receipt, statement), student's classes and payments page, student signs a contract, guardian signs from the emailed link, teacher marks late and records a late cancellation, access checks, phone layout | local database + running app (`npm run dev`); safe to repeat |
| `npm run test:e2e:phase4` | Announcement → bell → notification centre, email delivered to Mailpit, email settings, policy gate and acceptance, publishing a new policy version | same as above (also needs Docker for cleanup) |

Run `npm run db:reset` first if you have changed data by hand: the tests expect the seed data.

**The tests only run against a local database.** They read `.env.local` and refuse to start if it points anywhere else. If your `.env.local` points to a hosted project, keep the local settings in another file and name it for the tests and the app: `$env:ENV_FILE=".env.test"` for the tests (PowerShell), plus the same values as process variables for `npm run dev`, which take priority over `.env.local`.

## Decisions made for Phase 5 (Nov 2026, change if needed)

- **Payments are recorded by the admin** (bank transfer, GCash, Maya, cash, card, PayPal). There is no online checkout (open decision OD-03). The tables are ready for one to be added later.
- **Which classes use up a class from the package** (OD-04): completed classes and student no-shows always do. A cancellation the student asked for less than 24 hours before the class also does (the cutoff is in Payments and billing → Billing settings). Teacher absences, reschedules, and cancellations by the teacher or school don't. When cancelling, the teacher picks who asked. An admin can override any single class on its page, and the override is logged.
- **Packages**: an admin adds a package to a student (Students → the student → Packages, payments and contract), optionally sending its invoice at the same time. New classes join the student's current package automatically, and a rescheduled class stays in its package. Teachers see how many classes their student has left, never prices.
- **Attendance** follows the class status (completed = Present, student absent = Absent, cancelled, rescheduled). The teacher can change Present to Late with the minutes. A teacher absence has no mark.
- **Invoices and payments are never deleted**, only voided with a reason. Totals, amounts paid and statuses (Unpaid, Partially paid, Paid) are worked out by the database from the lines and payments, so they can't be typed in. A payment can't be more than the balance, and an invoice's lines can't change after a payment. Invoice, receipt and contract numbers (INV-2026-00001, OR-2026-00001, CT-2026-0001) are given by the database, in order.
- **Statements** are built from the records each time, for any month: opening balance, invoices, payments, closing balance and the classes held. Students get a notification when last month's statement is ready.
- **Reminders** (NOT-16): 3 days before an invoice is due, then once a week while it is overdue. Admins get one daily summary of overdue invoices, and a notification when a contract is signed. These are the only notifications admins get, so admins now have a bell and can switch the emails off in My account.
- **Contracts**: made from a versioned template (a saved version never changes) and filled in from the student's package. They can be edited only as drafts. When sent, the text is frozen and its SHA-256 fingerprint stored. Signing records the typed name, consent, time, IP address and browser, checks the fingerprint again, and emails the signer a PDF copy. To change a sent or signed contract, void it and make a new one.
- **Minors**: the parent or guardian signs through a one-time email link (valid 14 days, no account needed). Only a fingerprint of the link is stored. The admin can send a new link, which stops the old one. If email isn't set up, the admin is shown the link to share by hand.
- **The starter contract template is a placeholder.** Have a lawyer review it before using it with real students, especially for minors.
- **Teacher pay** (admin only): a rate per teacher, per class or per hour. Monthly payouts count every class that used up a student's class. Payouts go Draft → Approved → Paid. An adjustment can be added while it's a draft, and a paid payout can't be changed.
- **PDFs** use the standard Helvetica font, so names in Korean, Japanese or other non-Latin scripts print as "?". Fixing that means embedding a Unicode font.
- One currency for the school (PHP by default, in Billing settings). Months and document dates follow the school time zone (Asia/Manila).

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

## Decisions made for Phase 4.5 (change if needed)

- Portal links load only when tapped. Next.js's background loading of visible links caused dozens of extra server calls per page. Use `@/components/Link` in the portals, and `next/link` on the public site.
- The portals have no `loading.tsx`, on purpose: it would make refused pages return 200 instead of a real 404. A progress bar shows on tap instead.
- The middleware only reads the session cookie. The real login check is `requireRole()` in each portal's layout, so every new portal must use it. `npm run test:smoke` checks that a forged cookie is refused.
- Open homework and completed homework are loaded separately. Never load them as one list ordered by deadline: old completed work pushes out recent work and makes counts wrong.
- YouTube's player loads when play is pressed. Before that, the page shows a thumbnail from YouTube.
- Lists show 50 rows a page. Lesson history keeps the latest 300 classes, and completed homework the latest 200.

## Decisions made for Phase 4 (change if needed)

- Everything appears in the in-site notification centre. Email is on for every type by default, and each person can switch types off in **Settings**. Admins don't receive these notifications.
- People are not notified about changes they made themselves (e.g. a teacher who books a class isn't told about it). A weekly series sends one message, not one per class.
- Inactive accounts receive no notifications. Guardians receive no emails yet.
- Announcements go to everyone, all teachers, all students, or chosen people, either now or at a scheduled time, with an optional end date.
- Class policies are versioned. A published version can't be edited, only replaced by a new one. Students must accept the latest version before they can use their account; the acceptance time, IP address and browser are recorded. Teachers are notified about updates but aren't asked to accept.
- Changing a password requires the current password.

# Online English & IELTS LMS

Learning management system for a one-to-one online English and IELTS school, with admin, teacher and student portals.
Stack: Next.js 15 (App Router, TypeScript, Tailwind) and Supabase (Postgres with row-level security, Auth, Storage).

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Setup, login, roles, database access rules | Done |
| 1 | Public site, teacher/student profiles, basic admin (users, assignments, courses, inquiries, settings) | Done |
| 2 | Calendar, scheduling, lesson records, materials | Next |
| 3–7 | Homework, notifications, contracts/billing, progress, extras | Planned (shown as "coming soon" in the portals) |

## First-time setup (Windows)

1. **Docker Desktop** needs WSL 2. In an admin PowerShell run `wsl --install --no-distribution`, restart the PC, then open Docker Desktop once and wait until it says "Engine running".
2. Install packages: `npm install`
3. Start the local database: `npm run db:start` (the first run downloads images, ~5 min).
4. Copy `.env.example` to `.env.local` and fill in the values that `npx supabase status` prints:
   - `API URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon key` (or Publishable key) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` (or Secret key) → `SUPABASE_SERVICE_ROLE_KEY`
5. Load the schema and test data: `npm run db:reset`
6. Run the app: `npm run dev`, then open http://localhost:3000

Local extras: Supabase Studio (database browser) at http://127.0.0.1:54323, and test emails (password resets) at http://127.0.0.1:54324.

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

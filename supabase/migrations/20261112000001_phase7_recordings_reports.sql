-- Phase 7 (part 1): class recording links (REC-01..02) and admin reports.
-- The Zoom / Google Meet connection and other messaging channels (NOT-22) come later, once the
-- school has chosen a platform and set up the accounts.
--
-- Decisions (Nov 2026, change if needed):
--   REC-01  Recordings are links to where Zoom / Google keep them. The school stores no video (VID-05).
--           A class can have several links (e.g. a recording split in two). The class's teacher or an
--           admin adds them; the optional passcode is kept with the link.
--   OD-06   Whether a new recording is shared with the student follows the admin setting
--           `recordings_visible_by_default` (on to start). The teacher can switch any recording on or
--           off. The student is notified when one is shared with them.
--           Recordings are a separate table, not columns on class_sessions, because students can read
--           their own class rows and row-level security can't hide single columns.
--   Reports Admin only. Months and dates follow the school time zone. Worked out from the records each
--           time, so they are always current and can't drift.

insert into public.settings (key, value) values ('recordings_visible_by_default', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Class recordings (REC-01..02)
-- ---------------------------------------------------------------------------
create table public.class_recordings (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.class_sessions(id) on delete cascade,
  title               text not null default '' check (length(title) <= 200),
  url                 text not null check (url ~ '^https://[^\s]+$' and length(url) <= 2000),
  passcode            text check (passcode is null or length(passcode) <= 100),
  visible_to_student  boolean not null default public.setting_bool('recordings_visible_by_default'),
  added_by            uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index class_recordings_session_idx on public.class_recordings(session_id);
create trigger class_recordings_touch before update on public.class_recordings for each row execute function public.touch_updated_at();

create or replace function public.guard_recording()
returns trigger language plpgsql as $$
begin
  if new.session_id is distinct from old.session_id then
    raise exception 'A recording cannot be moved to another class';
  end if;
  return new;
end $$;
create trigger class_recordings_guard before update on public.class_recordings
  for each row execute function public.guard_recording();

-- The student hears about a recording once, when it is first shared with them.
create or replace function public.notify_recording_shared()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.class_sessions;
begin
  if new.visible_to_student and (tg_op = 'INSERT' or not old.visible_to_student) then
    select * into s from public.class_sessions where id = new.session_id;
    perform public.notify(s.student_id, 'recording_added', 'Class recording available',
      'The recording of your class on ' || public.fmt_for(s.student_id, s.starts_at) || ' is ready to watch.',
      '/student/classes/' || s.id || '#recordings', 'recording:' || new.id);
  end if;
  return new;
end $$;
create trigger class_recordings_notify after insert or update of visible_to_student on public.class_recordings
  for each row execute function public.notify_recording_shared();

alter table public.class_recordings enable row level security;

-- Read: admins, the class's teacher, the student's current teachers (like lesson history), and the
-- student only when shared. Write: admins and the class's own teacher.
create policy recordings_select on public.class_recordings for select to authenticated using (
  (select public.is_admin())
  or public.session_role(session_id) in ('teacher', 'other_teacher')
  or (visible_to_student and public.session_role(session_id) = 'student')
);
create policy recordings_insert on public.class_recordings for insert to authenticated
  with check ((select public.is_admin()) or (public.session_role(session_id) = 'teacher' and added_by = (select auth.uid())));
create policy recordings_update on public.class_recordings for update to authenticated
  using ((select public.is_admin()) or public.session_role(session_id) = 'teacher')
  with check ((select public.is_admin()) or public.session_role(session_id) = 'teacher');
create policy recordings_delete on public.class_recordings for delete to authenticated
  using ((select public.is_admin()) or public.session_role(session_id) = 'teacher');

-- ---------------------------------------------------------------------------
-- Admin reports
-- ---------------------------------------------------------------------------

-- One row per month (school time zone), newest first: classes, attendance, cancellations,
-- homework and money.
create or replace function public.report_monthly(p_months int default 6)
returns table (
  month date,
  completed int, student_absent int, teacher_absent int,
  cancelled_by_student int, late_cancels int, cancelled_other int, rescheduled int,
  hours_taught numeric, classes_used int,
  homework_set int, homework_handed_in int, homework_late int,
  invoiced numeric, collected numeric
) language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := public.school_tz(); v_from date;
begin
  if not public.is_admin() then raise exception 'Reports are for administrators only'; end if;
  v_from := (date_trunc('month', public.school_today()) - make_interval(months => greatest(1, least(p_months, 36)) - 1))::date;
  return query
  with months as (
    select generate_series(v_from, date_trunc('month', public.school_today())::date, interval '1 month')::date as m
  ), cls as (
    select date_trunc('month', s.starts_at at time zone v_tz)::date as m,
      count(*) filter (where s.status = 'completed') as completed,
      count(*) filter (where s.status = 'student_absent') as student_absent,
      count(*) filter (where s.status = 'teacher_absent') as teacher_absent,
      count(*) filter (where s.status = 'cancelled' and s.cancel_requested_by = 'student') as by_student,
      count(*) filter (where s.status = 'cancelled' and s.late_cancel) as late,
      count(*) filter (where s.status = 'cancelled' and s.cancel_requested_by is distinct from 'student') as other,
      count(*) filter (where s.status = 'rescheduled') as rescheduled,
      round(sum(extract(epoch from s.ends_at - s.starts_at) / 3600) filter (where s.status = 'completed'), 1) as hours,
      count(*) filter (where s.counts_as_used) as used
    from public.class_sessions s
    where s.starts_at >= (v_from::timestamp at time zone v_tz)
    group by 1
  ), hw as (
    select date_trunc('month', a.created_at at time zone v_tz)::date as m, count(*) as n
    from public.homework_assignments a where a.created_at >= (v_from::timestamp at time zone v_tz) group by 1
  ), sub as (
    select date_trunc('month', s.submitted_at at time zone v_tz)::date as m, count(*) as n, count(*) filter (where s.is_late) as late
    from public.homework_submissions s
    where not s.is_draft and s.version = 1 and s.submitted_at >= (v_from::timestamp at time zone v_tz) group by 1
  ), inv as (
    select date_trunc('month', i.issue_date)::date as m, sum(i.total) as total
    from public.invoices i where i.status <> 'void' and i.issue_date >= v_from group by 1
  ), pay as (
    select date_trunc('month', p.paid_on)::date as m, sum(p.amount) as total
    from public.payments p where p.voided_at is null and p.paid_on >= v_from group by 1
  )
  select months.m,
    coalesce(cls.completed, 0)::int, coalesce(cls.student_absent, 0)::int, coalesce(cls.teacher_absent, 0)::int,
    coalesce(cls.by_student, 0)::int, coalesce(cls.late, 0)::int, coalesce(cls.other, 0)::int, coalesce(cls.rescheduled, 0)::int,
    coalesce(cls.hours, 0), coalesce(cls.used, 0)::int,
    coalesce(hw.n, 0)::int, coalesce(sub.n, 0)::int, coalesce(sub.late, 0)::int,
    coalesce(inv.total, 0), coalesce(pay.total, 0)
  from months
  left join cls on cls.m = months.m
  left join hw on hw.m = months.m
  left join sub on sub.m = months.m
  left join inv on inv.m = months.m
  left join pay on pay.m = months.m
  order by months.m desc;
end $$;

-- One row per teacher for a date range (school time zone, both ends included; p_to defaults to today).
create or replace function public.report_teachers(p_from date, p_to date default null)
returns table (
  teacher_id uuid, full_name text, status public.account_status, active_students int,
  completed int, hours_taught numeric, cancelled int, teacher_absent int, classes_without_notes int,
  homework_set int, reviews_sent int, avg_review_hours numeric, progress_reports int
) language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := public.school_tz(); v_start timestamptz; v_end timestamptz;
begin
  if not public.is_admin() then raise exception 'Reports are for administrators only'; end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (coalesce(p_to, public.school_today()) + 1)::timestamp at time zone v_tz;
  return query
  select p.id, p.full_name, p.status,
    (select count(*) from public.teacher_students ts where ts.teacher_id = p.id and ts.active)::int,
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end)::int,
    coalesce((select round(sum(extract(epoch from s.ends_at - s.starts_at) / 3600), 1) from public.class_sessions s
              where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end), 0),
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'cancelled' and s.cancel_requested_by is distinct from 'student'
       and s.starts_at >= v_start and s.starts_at < v_end)::int,
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'teacher_absent' and s.starts_at >= v_start and s.starts_at < v_end)::int,
    (select count(*) from public.class_sessions s left join public.lesson_records l on l.session_id = s.id
       where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end
         and coalesce(nullif(l.feedback_overall, ''), nullif(l.today_topics, '')) is null)::int,
    (select count(*) from public.homework_assignments a where a.teacher_id = p.id and a.created_at >= v_start and a.created_at < v_end)::int,
    (select count(*) from public.homework_reviews r where r.reviewer_id = p.id and r.sent_at >= v_start and r.sent_at < v_end)::int,
    (select round(avg(extract(epoch from r.sent_at - sb.submitted_at) / 3600)::numeric, 1)
       from public.homework_reviews r join public.homework_submissions sb on sb.id = r.submission_id
       where r.reviewer_id = p.id and r.sent_at >= v_start and r.sent_at < v_end),
    (select count(*) from public.progress_reports pr where pr.author_id = p.id and pr.status = 'published'
       and pr.published_at >= v_start and pr.published_at < v_end)::int
  from public.profiles p
  where p.role = 'teacher' and p.status <> 'inactive'
  order by p.full_name;
end $$;

-- Active students who need a look: no class booked in the next 14 days, 2 or fewer classes left,
-- an overdue invoice, 2+ overdue required homework, or a progress report due.
create or replace function public.report_attention()
returns table (
  student_id uuid, full_name text, teachers text, last_class timestamptz, next_class timestamptz,
  classes_left int, overdue_amount numeric, overdue_homework int, report_due boolean, nothing_booked boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Reports are for administrators only'; end if;
  return query
  with due as (select d.student_id from public.progress_due_list(null) d),
  base as (
    select p.id, p.full_name,
      (select string_agg(t.full_name, ', ' order by t.full_name) from public.teacher_students ts join public.profiles t on t.id = ts.teacher_id
         where ts.student_id = p.id and ts.active) as teachers,
      (select max(s.starts_at) from public.class_sessions s where s.student_id = p.id and s.status in ('completed', 'student_absent')) as last_class,
      (select min(s.starts_at) from public.class_sessions s where s.student_id = p.id and s.status = 'scheduled' and s.starts_at > now()) as next_class,
      (select sum(e.classes_total - (select count(*) from public.class_sessions s where s.enrollment_id = e.id and s.counts_as_used))::int
         from public.enrollments e where e.student_id = p.id and e.status = 'active') as left_,
      coalesce((select sum(i.total - i.amount_paid) from public.invoices i
         where i.student_id = p.id and i.status in ('unpaid', 'partially_paid') and i.due_date < public.school_today()), 0) as overdue,
      (select count(*) from public.homework_assignments a
         where a.student_id = p.id and a.is_required and a.status in ('assigned', 'needs_revision') and a.due_at < now())::int as hw,
      exists (select 1 from due where due.student_id = p.id) as rdue
    from public.profiles p
    where p.role = 'student' and p.status = 'active'
  )
  select b.id, b.full_name, b.teachers, b.last_class, b.next_class, b.left_, b.overdue, b.hw, b.rdue,
         (b.next_class is null or b.next_class > now() + interval '14 days')
  from base b
  where b.next_class is null or b.next_class > now() + interval '14 days'
     or coalesce(b.left_, 0) <= 2 or b.overdue > 0 or b.hw >= 2 or b.rdue
  order by b.overdue desc, b.full_name;
end $$;

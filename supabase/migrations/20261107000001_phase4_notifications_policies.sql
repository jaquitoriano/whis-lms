-- Phase 4: notifications (NOT-*), announcements (ANN-*), class policies (POL-*).
-- Notifications are created only by database triggers and the scheduled job, never
-- directly by clients, so every path that changes data notifies consistently.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text not null default '',
  link          text not null default '/',
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  email_status  text not null default 'pending' check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  emailed_at    timestamptz,
  email_error   text
);
create unique index notifications_dedupe on public.notifications(user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_email_idx on public.notifications(email_status) where email_status = 'pending';

-- Per-user email opt-out per notification type (in-app always shows). HW-S22.
create table public.notification_preferences (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  type     text not null,
  email    boolean not null default true,
  primary key (user_id, type)
);

-- Short date for messages, in the recipient's own time zone.
create or replace function public.fmt_for(p_user uuid, p_at timestamptz)
returns text language sql stable security definer set search_path = '' as $$
  select to_char(p_at at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'), 'Dy DD Mon, HH24:MI');
$$;

-- The one place notifications are created. Skips inactive accounts; respects email opt-outs.
create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.account_status; v_email boolean;
begin
  select status into v_status from public.profiles where id = p_user;
  if v_status is null or v_status = 'inactive' then return; end if;
  select email into v_email from public.notification_preferences where user_id = p_user and type = p_type;
  insert into public.notifications (user_id, type, title, body, link, dedupe_key, email_status)
  values (p_user, p_type, left(p_title, 200), left(coalesce(p_body, ''), 2000), p_link, p_dedupe,
          case when coalesce(v_email, true) then 'pending' else 'skipped' end)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- Clients may only mark their own notifications as read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
$$;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Event triggers
-- ---------------------------------------------------------------------------

-- New classes (NOT-01, NOT-11). Statement-level so a 12-week series sends one message, not 12.
create or replace function public.notify_sessions_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_actor uuid := (select auth.uid());
begin
  -- Rescheduled classes (NOT-03, NOT-11)
  for r in select n.*, o.starts_at as old_starts from new_rows n join public.class_sessions o on o.id = n.rescheduled_from_id loop
    if r.student_id is distinct from v_actor then
      perform public.notify(r.student_id, 'class_rescheduled', 'Class moved',
        'Your class on ' || public.fmt_for(r.student_id, r.old_starts) || ' is now on ' || public.fmt_for(r.student_id, r.starts_at) || '.',
        '/student/classes/' || r.id);
    end if;
    if r.teacher_id is distinct from v_actor then
      perform public.notify(r.teacher_id, 'class_rescheduled', 'Class moved',
        'Your class on ' || public.fmt_for(r.teacher_id, r.old_starts) || ' is now on ' || public.fmt_for(r.teacher_id, r.starts_at) || '.',
        '/teacher/classes/' || r.id);
    end if;
  end loop;

  for r in
    select teacher_id, student_id, count(*) as n, min(starts_at) as first_at, (array_agg(id order by starts_at))[1] as first_id
    from new_rows where rescheduled_from_id is null group by teacher_id, student_id
  loop
    perform public.notify(r.student_id, 'class_scheduled',
      case when r.n = 1 then 'New class scheduled' else r.n || ' new classes scheduled' end,
      case when r.n = 1 then 'Your class is on ' else 'Starting ' end || public.fmt_for(r.student_id, r.first_at) || '.',
      '/student/classes/' || r.first_id);
    if r.teacher_id is distinct from v_actor then
      perform public.notify(r.teacher_id, 'class_scheduled',
        case when r.n = 1 then 'New class assigned' else r.n || ' new classes assigned' end,
        'With ' || (select full_name from public.profiles where id = r.student_id) || ', ' ||
        case when r.n = 1 then '' else 'starting ' end || public.fmt_for(r.teacher_id, r.first_at) || '.',
        '/teacher/classes/' || r.first_id);
    end if;
  end loop;
  return null;
end $$;

create trigger sessions_notify_insert after insert on public.class_sessions
  referencing new table as new_rows for each statement execute function public.notify_sessions_inserted();

-- Cancellations and absences (NOT-03, NOT-11).
create or replace function public.notify_session_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if new.status = 'cancelled' and old.status = 'scheduled' then
    if new.student_id is distinct from v_actor then
      perform public.notify(new.student_id, 'class_cancelled', 'Class cancelled',
        'Your class on ' || public.fmt_for(new.student_id, new.starts_at) || ' was cancelled' || coalesce(': ' || new.status_reason, '.'),
        '/student/classes/' || new.id);
    end if;
    if new.teacher_id is distinct from v_actor then
      perform public.notify(new.teacher_id, 'class_cancelled', 'Class cancelled',
        'The class on ' || public.fmt_for(new.teacher_id, new.starts_at) || ' was cancelled' || coalesce(': ' || new.status_reason, '.'),
        '/teacher/classes/' || new.id);
    end if;
  end if;
  return new;
end $$;

create trigger sessions_notify_status after update of status on public.class_sessions
  for each row execute function public.notify_session_status();

-- Lesson notes shared with the student (NOT-14).
create or replace function public.notify_lesson_shared()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.class_sessions;
begin
  if new.shared_with_student and not coalesce(old.shared_with_student, false) then
    select * into s from public.class_sessions where id = new.session_id;
    perform public.notify(s.student_id, 'lesson_notes', 'Lesson notes available',
      'Notes and feedback from your class on ' || public.fmt_for(s.student_id, s.starts_at) || ' are ready.',
      '/student/classes/' || s.id, 'lesson_notes:' || s.id);
  end if;
  return new;
end $$;

create trigger lesson_records_notify after update of shared_with_student on public.lesson_records
  for each row execute function public.notify_lesson_shared();

-- New materials (NOT-15), one message per class per batch.
create or replace function public.notify_materials_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select n.session_id, count(*) as cnt, s.student_id, s.starts_at from new_rows n
           join public.class_sessions s on s.id = n.session_id group by n.session_id, s.student_id, s.starts_at loop
    perform public.notify(r.student_id, 'materials_added', 'New learning materials',
      r.cnt || ' new item' || case when r.cnt > 1 then 's' else '' end || ' for your class on ' || public.fmt_for(r.student_id, r.starts_at) || '.',
      '/student/classes/' || r.session_id);
  end loop;
  return null;
end $$;

create trigger materials_notify after insert on public.materials
  referencing new table as new_rows for each statement execute function public.notify_materials_added();

-- Homework events (NOT-04, NOT-12, NOT-14).
create or replace function public.notify_homework_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.student_id, 'homework_assigned', 'New homework: ' || new.title,
    'Due ' || public.fmt_for(new.student_id, new.due_at) || case when new.is_required then '.' else ' (optional).' end,
    '/student/homework/' || new.id);
  return new;
end $$;

create trigger homework_notify_insert after insert on public.homework_assignments
  for each row execute function public.notify_homework_inserted();

create or replace function public.notify_homework_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_late boolean; v_version int;
begin
  if new.status = old.status then return new; end if;
  if new.status = 'submitted' then
    select is_late, version into v_late, v_version from public.homework_submissions
    where assignment_id = new.id and not is_draft order by version desc limit 1;
    perform public.notify(new.teacher_id, 'homework_submitted',
      (select full_name from public.profiles where id = new.student_id) || ' submitted ' || new.title,
      case when v_version > 1 then 'Version ' || v_version || '. ' else '' end || case when v_late then 'Submitted late.' else 'Ready for review.' end,
      '/teacher/homework/' || new.id);
  elsif new.status in ('needs_revision', 'completed') then
    perform public.notify(new.student_id, 'homework_reviewed',
      case when new.status = 'completed' then 'Homework checked: ' else 'Revision requested: ' end || new.title,
      case when new.status = 'completed' then 'Your teacher has reviewed your work.' else 'Read your teacher''s feedback and submit a new version.' end,
      '/student/homework/' || new.id);
  end if;
  return new;
end $$;

create trigger homework_notify_status after update of status on public.homework_assignments
  for each row execute function public.notify_homework_status();

-- ---------------------------------------------------------------------------
-- Announcements (ANN-01, ANN-02)
-- ---------------------------------------------------------------------------
create type public.announcement_audience as enum ('everyone', 'all_teachers', 'all_students', 'specific');

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 200),
  body         text not null default '' check (length(body) <= 10000),
  audience     public.announcement_audience not null,
  publish_at   timestamptz not null default now(),
  expires_at   timestamptz,
  notified_at  timestamptz,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index announcements_publish_idx on public.announcements(publish_at desc);

create table public.announcement_recipients (
  announcement_id  uuid not null references public.announcements(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  primary key (announcement_id, user_id)
);

create or replace function public.announcement_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.announcements a
    where a.id = p_id and a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())
      and (
        a.audience = 'everyone'
        or (a.audience = 'all_teachers' and public.my_role() = 'teacher')
        or (a.audience = 'all_students' and public.my_role() = 'student')
        or (a.audience = 'specific' and exists (select 1 from public.announcement_recipients r where r.announcement_id = a.id and r.user_id = (select auth.uid())))
      )
  );
$$;

-- Fan out an announcement once it is published (now or by the scheduled job).
create or replace function public.deliver_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.announcements; u record;
begin
  if (select auth.uid()) is not null and not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into a from public.announcements where id = p_id for update;
  if a.id is null or a.notified_at is not null or a.publish_at > now() then return; end if;
  for u in
    select p.id, p.role from public.profiles p
    where p.status <> 'inactive' and p.role <> 'admin' and (
      a.audience = 'everyone'
      or (a.audience = 'all_teachers' and p.role = 'teacher')
      or (a.audience = 'all_students' and p.role = 'student')
      or (a.audience = 'specific' and exists (select 1 from public.announcement_recipients r where r.announcement_id = a.id and r.user_id = p.id))
    )
  loop
    perform public.notify(u.id, 'announcement', a.title, left(a.body, 300), '/' || u.role || '/announcements#a-' || a.id, 'announcement:' || a.id);
  end loop;
  update public.announcements set notified_at = now() where id = p_id;
end $$;

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
create policy announcements_admin on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy announcements_read on public.announcements for select to authenticated using (public.announcement_visible(id));
create policy recipients_admin on public.announcement_recipients for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Class policies (POL-01..04): published versions are never edited.
-- ---------------------------------------------------------------------------
create table public.policies (
  version       int primary key,
  title         text not null default 'Class policies',
  body          text not null check (length(body) between 1 and 50000),
  summary       text not null default '',
  published_at  timestamptz not null default now(),
  published_by  uuid references public.profiles(id)
);

create table public.policy_acceptances (
  version      int not null references public.policies(version),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  accepted_at  timestamptz not null default now(),
  ip           text,
  user_agent   text,
  primary key (version, user_id)
);

create or replace function public.latest_policy_version()
returns int language sql stable security definer set search_path = '' as $$
  select max(version) from public.policies;
$$;

-- Does the current user still need to accept the latest policies? (students only)
create or replace function public.needs_policy_acceptance()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_role() = 'student'
     and public.latest_policy_version() is not null
     and not exists (select 1 from public.policy_acceptances where user_id = (select auth.uid()) and version = public.latest_policy_version());
$$;

create or replace function public.notify_policy_published()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  for u in select id, role from public.profiles where status <> 'inactive' and role in ('teacher', 'student') loop
    perform public.notify(u.id, 'policy_updated', 'Class policies updated',
      case when u.role = 'student' then 'Please read and accept the updated class policies.' else 'The school has published updated class policies.' end,
      '/' || u.role || '/policies', 'policy:' || new.version);
  end loop;
  return new;
end $$;

create trigger policies_notify after insert on public.policies
  for each row execute function public.notify_policy_published();

create or replace function public.guard_policy_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Published policies cannot be changed; publish a new version instead';
end $$;
create trigger policies_immutable before update or delete on public.policies
  for each row execute function public.guard_policy_change();

alter table public.policies enable row level security;
alter table public.policy_acceptances enable row level security;
create policy policies_read on public.policies for select to authenticated using (true);
create policy policies_admin_insert on public.policies for insert to authenticated with check (public.is_admin());
create policy acceptances_read on public.policy_acceptances for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy acceptances_insert_own on public.policy_acceptances for insert to authenticated
  with check (user_id = (select auth.uid()) and version = public.latest_policy_version());

create or replace function public.audit_policy_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values ((select auth.uid()), 'policy.publish', 'policies', new.version::text, jsonb_build_object('title', new.title));
  return new;
end $$;
create trigger policies_audit after insert on public.policies for each row execute function public.audit_policy_publish();

-- ---------------------------------------------------------------------------
-- Scheduled notifications (run every ~15 minutes by the app's cron endpoint)
-- NOT-02/NOT-10 class reminders, NOT-13 homework due soon, NOT-05 review backlog,
-- and announcements scheduled for later.
-- ---------------------------------------------------------------------------
create or replace function public.generate_scheduled_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  -- 24 h and 1 h class reminders for both people
  for r in select * from public.class_sessions
           where status = 'scheduled' and starts_at > now() and starts_at <= now() + interval '24 hours' loop
    if r.starts_at <= now() + interval '1 hour' then
      perform public.notify(r.student_id, 'class_reminder', 'Class starts within the hour', 'Your class starts at ' || public.fmt_for(r.student_id, r.starts_at) || '.', '/student/classes/' || r.id, 'reminder_1h:' || r.id);
      perform public.notify(r.teacher_id, 'class_reminder', 'Class starts within the hour', 'With ' || (select full_name from public.profiles where id = r.student_id) || ' at ' || public.fmt_for(r.teacher_id, r.starts_at) || '.', '/teacher/classes/' || r.id, 'reminder_1h:' || r.id);
    else
      perform public.notify(r.student_id, 'class_reminder', 'Class tomorrow', 'Your class is on ' || public.fmt_for(r.student_id, r.starts_at) || '.', '/student/classes/' || r.id, 'reminder_24h:' || r.id);
      perform public.notify(r.teacher_id, 'class_reminder', 'Upcoming class', 'With ' || (select full_name from public.profiles where id = r.student_id) || ' on ' || public.fmt_for(r.teacher_id, r.starts_at) || '.', '/teacher/classes/' || r.id, 'reminder_24h:' || r.id);
    end if;
    n := n + 1;
  end loop;

  -- Required homework due within 24 h and not yet handed in
  for r in select * from public.homework_assignments
           where is_required and status in ('assigned', 'needs_revision') and due_at > now() and due_at <= now() + interval '24 hours' loop
    perform public.notify(r.student_id, 'homework_due_soon', 'Homework due soon: ' || r.title, 'Due ' || public.fmt_for(r.student_id, r.due_at) || '.', '/student/homework/' || r.id, 'due_soon:' || r.id || ':' || r.status);
    n := n + 1;
  end loop;

  -- Daily digest for teachers with submissions waiting more than 48 h
  for r in select a.teacher_id, count(*) as cnt from public.homework_assignments a
           where a.status in ('submitted', 'under_review')
             and (select max(submitted_at) from public.homework_submissions s where s.assignment_id = a.id and not s.is_draft) < now() - interval '48 hours'
           group by a.teacher_id loop
    perform public.notify(r.teacher_id, 'review_backlog', r.cnt || ' homework submission' || case when r.cnt > 1 then 's' else '' end || ' waiting for review',
      'Waiting more than 48 hours.', '/teacher/homework', 'backlog:' || current_date);
    n := n + 1;
  end loop;

  -- Announcements whose publish time has arrived
  for r in select id from public.announcements where notified_at is null and publish_at <= now() loop
    perform public.deliver_announcement(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Only the database itself and the server (service role) may create notifications.
revoke execute on function public.generate_scheduled_notifications() from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.deliver_announcement(uuid) from public, anon;

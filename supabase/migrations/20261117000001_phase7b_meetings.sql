-- Phase 7b (Nov 2026): meeting links created automatically in Zoom or Google Meet, and
-- recordings attached after class.
--
-- How it works:
--   * The admin connects each teacher to Zoom or Google Meet (teacher_meeting_accounts).
--     API credentials live in server environment variables, never in the database.
--   * Triggers on class_sessions queue the work in class_meetings: create a meeting when a
--     class is booked without a link, move it when the class moves, delete it when the class
--     is cancelled. A rescheduled class keeps its meeting, moved to the new time.
--   * The app's server works the queue right after each change and every 15 minutes
--     (claim_meeting_jobs), and attaches recordings once a class is over.
--   * Students are never added to Zoom or Google: their contact details stay in the school.

create type public.meeting_provider as enum ('zoom', 'google_meet');
create type public.meeting_action as enum ('create', 'update', 'delete', 'refresh');

-- ---------------------------------------------------------------------------
-- Which account hosts each teacher's classes
-- ---------------------------------------------------------------------------
create table public.teacher_meeting_accounts (
  teacher_id     uuid primary key references public.profiles(id) on delete cascade,
  provider       public.meeting_provider not null,
  account_email  text not null check (account_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(account_email) <= 320),
  active         boolean not null default true,
  updated_at     timestamptz not null default now()
);
create trigger teacher_meeting_accounts_touch before update on public.teacher_meeting_accounts
  for each row execute function public.touch_updated_at();

alter table public.teacher_meeting_accounts enable row level security;
create policy meeting_accounts_admin_all on public.teacher_meeting_accounts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy meeting_accounts_select_own on public.teacher_meeting_accounts for select to authenticated
  using (teacher_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- One external meeting per class, and what still has to happen to it
-- ---------------------------------------------------------------------------
create table public.class_meetings (
  session_id         uuid primary key references public.class_sessions(id) on delete cascade,
  provider           public.meeting_provider not null,
  host_email         text not null,
  external_id        text,          -- Zoom meeting id, or Google Calendar event id
  meeting_code       text,          -- Google Meet code (abc-defg-hij), used to find recordings
  join_url           text check (join_url is null or join_url ~ '^https://'),
  action             public.meeting_action,          -- null = in step with the class
  attempts           int not null default 0,
  last_error         text check (last_error is null or length(last_error) <= 1000),
  claimed_at         timestamptz,
  synced_at          timestamptz,
  deleted_at         timestamptz,
  recordings_done    boolean not null default false,  -- stop looking once found or given up
  recordings_checked_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index class_meetings_todo_idx on public.class_meetings(updated_at) where action is not null;
create trigger class_meetings_touch before update on public.class_meetings
  for each row execute function public.touch_updated_at();

alter table public.class_meetings enable row level security;
-- Staff of the class can see how the link is doing; nobody writes directly (triggers and the
-- server's service role do).
create policy class_meetings_select on public.class_meetings for select to authenticated using (
  (select public.is_admin()) or public.session_role(session_id) = 'teacher'
);

-- Book: a class without a link, for a connected teacher, gets a meeting.
-- Move: a new time moves the meeting. Cancel: the meeting is deleted.
create or replace function public.queue_class_meeting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare acc public.teacher_meeting_accounts; m public.class_meetings;
begin
  if tg_op = 'INSERT' then
    if new.status = 'scheduled' and new.meeting_url is null and new.ends_at > now() then
      select * into acc from public.teacher_meeting_accounts where teacher_id = new.teacher_id and active;
      if found then
        insert into public.class_meetings (session_id, provider, host_email, action)
        values (new.id, acc.provider, acc.account_email, 'create')
        on conflict (session_id) do nothing;
      end if;
    end if;
    return new;
  end if;

  select * into m from public.class_meetings where session_id = new.id and deleted_at is null;
  if not found then return new; end if;

  -- Someone pasted their own link over the automatic one: the automatic meeting goes.
  if new.meeting_url is distinct from old.meeting_url and m.join_url is not null
     and old.meeting_url is not distinct from m.join_url then
    if m.external_id is null then
      update public.class_meetings set action = null, deleted_at = now() where session_id = new.id;
    else
      update public.class_meetings set action = 'delete', attempts = 0, last_error = null where session_id = new.id;
    end if;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    if m.external_id is null then
      update public.class_meetings set action = null, deleted_at = now() where session_id = new.id;
    else
      update public.class_meetings set action = 'delete', attempts = 0, last_error = null where session_id = new.id;
    end if;
  elsif new.status = 'scheduled' and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    update public.class_meetings
      set action = case when m.external_id is null then 'create'::public.meeting_action else 'update' end,
          attempts = 0, last_error = null
      where session_id = new.id;
  end if;
  return new;
end $$;
create trigger class_sessions_queue_meeting after insert or update of status, starts_at, ends_at, meeting_url on public.class_sessions
  for each row execute function public.queue_class_meeting();

-- Rescheduling keeps the meeting (and its link): it moves to the new class at the new time.
create or replace function public.reschedule_session(p_session uuid, p_starts timestamptz, p_ends timestamptz, p_reason text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  s public.class_sessions;
  v_new uuid;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'Class not found'; end if;
  if s.status <> 'scheduled' then raise exception 'Only scheduled classes can be rescheduled'; end if;

  update public.class_sessions set status = 'rescheduled', status_reason = p_reason where id = p_session;

  insert into public.class_sessions (teacher_id, student_id, course_id, starts_at, ends_at, meeting_url, rescheduled_from_id, created_by)
  values (s.teacher_id, s.student_id, s.course_id, p_starts, p_ends, s.meeting_url, s.id, (select auth.uid()))
  returning id into v_new;

  -- Materials and videos already attached follow the class to its new time.
  update public.materials set session_id = v_new where session_id = p_session;
  update public.videos set session_id = v_new where session_id = p_session;
  perform public.move_class_meeting(p_session, v_new);
  return v_new;
end $$;

create or replace function public.move_class_meeting(p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Called from reschedule_session as the person rescheduling: they must manage both classes.
  -- coalesce: session_role is null for people unrelated to the class, and "not null" never raises.
  if not coalesce(public.is_admin() or (public.session_role(p_from) = 'teacher' and public.session_role(p_to) = 'teacher'), false) then
    raise exception 'You don''t have permission to do that';
  end if;
  if not exists (select 1 from public.class_meetings where session_id = p_from and deleted_at is null) then return; end if;
  delete from public.class_meetings where session_id = p_to;
  update public.class_meetings
    set session_id = p_to,
        action = case when external_id is null then 'create'::public.meeting_action else 'update' end,
        attempts = 0, last_error = null, claimed_at = null
    where session_id = p_from;
end $$;
revoke execute on function public.move_class_meeting(uuid, uuid) from public, anon;

-- The admin connects a teacher after classes were booked: queue links for their upcoming
-- classes that have none. Returns how many were queued.
create or replace function public.queue_meetings_for_teacher(p_teacher uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare acc public.teacher_meeting_accounts; n int;
begin
  if not public.is_admin() then raise exception 'Only an administrator can do this'; end if;
  select * into acc from public.teacher_meeting_accounts where teacher_id = p_teacher and active;
  if not found then raise exception 'Connect this teacher to Zoom or Google Meet first'; end if;
  insert into public.class_meetings (session_id, provider, host_email, action)
  select s.id, acc.provider, acc.account_email, 'create'
  from public.class_sessions s
  where s.teacher_id = p_teacher and s.status = 'scheduled' and s.starts_at > now() and s.meeting_url is null
  on conflict (session_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Try again after a failure (the class's teacher or an admin).
create or replace function public.retry_class_meeting(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin() or public.session_role(p_session) = 'teacher', false) then
    raise exception 'You don''t have permission to do that';
  end if;
  update public.class_meetings set attempts = 0, last_error = null, claimed_at = null
  where session_id = p_session and action is not null;
end $$;

-- The server takes a batch of work. A claim lasts 5 minutes so two runs never do the same
-- job; a job that keeps failing stops after 8 tries until someone presses retry.
create or replace function public.claim_meeting_jobs(p_limit int default 20, p_session uuid default null)
returns setof public.class_meetings language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.class_meetings m set claimed_at = now()
  where m.session_id in (
    select c.session_id from public.class_meetings c
    where c.action is not null and c.attempts < 8
      and (c.claimed_at is null or c.claimed_at < now() - interval '5 minutes')
      and (p_session is null or c.session_id = p_session)
    order by c.updated_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning m.*;
end $$;
revoke execute on function public.claim_meeting_jobs(int, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recordings found automatically
-- ---------------------------------------------------------------------------
alter table public.class_recordings
  add column source text not null default 'manual' check (source in ('manual', 'zoom', 'google_meet')),
  add column external_id text check (external_id is null or length(external_id) <= 500);
create unique index class_recordings_external_idx on public.class_recordings(session_id, external_id) where external_id is not null;

-- Zoom records to the cloud on its own when this is on (Google Meet recording is started in the meeting).
insert into public.settings (key, value) values ('meetings_record_automatically', 'true'::jsonb)
on conflict (key) do nothing;

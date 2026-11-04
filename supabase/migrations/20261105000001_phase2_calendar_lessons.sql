-- Phase 2: teacher availability, class sessions (the hub), lesson records,
-- learning materials, YouTube videos. Requirement IDs refer to the client brief.

create extension if not exists btree_gist with schema extensions;

create type public.session_status as enum (
  'scheduled', 'completed', 'cancelled', 'rescheduled', 'student_absent', 'teacher_absent'   -- CAL-03
);
create type public.material_kind as enum ('file', 'link');

-- ---------------------------------------------------------------------------
-- Availability (TCH-08). Weekly hours are wall-clock times in the teacher's time zone.
-- ---------------------------------------------------------------------------
create table public.teacher_availability (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);
create index teacher_availability_teacher_idx on public.teacher_availability(teacher_id);

create table public.teacher_blackouts (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index teacher_blackouts_teacher_idx on public.teacher_blackouts(teacher_id, starts_at);

-- ---------------------------------------------------------------------------
-- Class sessions: one row per scheduled class. Everything else hangs off this.
-- ---------------------------------------------------------------------------
create table public.class_sessions (
  id                   uuid primary key default gen_random_uuid(),
  teacher_id           uuid not null references public.profiles(id),
  student_id           uuid not null references public.profiles(id),
  course_id            uuid references public.courses(id) on delete set null,
  starts_at            timestamptz not null,                                   -- stored UTC
  ends_at              timestamptz not null,
  status               public.session_status not null default 'scheduled',
  meeting_url          text check (meeting_url is null or meeting_url ~* '^https://'),  -- CAL-04
  rescheduled_from_id  uuid references public.class_sessions(id) on delete set null,
  status_reason        text,
  status_changed_by    uuid references public.profiles(id),
  status_changed_at    timestamptz,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '4 hours'),
  -- ADM-12: the database itself refuses double-booking. Cancelled and rescheduled
  -- sessions free their slot.
  constraint no_teacher_overlap exclude using gist (
    teacher_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'rescheduled')),
  constraint no_student_overlap exclude using gist (
    student_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'rescheduled'))
);
create index class_sessions_teacher_time_idx on public.class_sessions(teacher_id, starts_at);
create index class_sessions_student_time_idx on public.class_sessions(student_id, starts_at);
create index class_sessions_time_idx on public.class_sessions(starts_at);

create trigger class_sessions_touch before update on public.class_sessions
  for each row execute function public.touch_updated_at();

-- A class can only be booked between a teacher and a student they are assigned to.
create or replace function public.check_session_pair()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.teacher_students
    where teacher_id = new.teacher_id and student_id = new.student_id and active
  ) then
    raise exception 'This student is not assigned to this teacher' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger class_sessions_pair_check
  before insert or update of teacher_id, student_id on public.class_sessions
  for each row execute function public.check_session_pair();

-- Teachers may not move a class to another teacher or student, and only admins may
-- set "teacher absent". Status changes are stamped and audited.
create or replace function public.guard_session_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.teacher_id <> old.teacher_id or new.student_id <> old.student_id then
      raise exception 'Only an administrator can reassign a class';
    end if;
    if new.status = 'teacher_absent' and old.status <> 'teacher_absent' then
      raise exception 'Only an administrator can record a teacher absence';
    end if;
  end if;
  if new.status is distinct from old.status then
    new.status_changed_by := (select auth.uid());
    new.status_changed_at := now();
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'session.status', 'class_sessions', new.id::text,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'reason', new.status_reason));
  end if;
  return new;
end $$;

create trigger class_sessions_guard before update on public.class_sessions
  for each row execute function public.guard_session_update();

-- Reschedule = mark the old class 'rescheduled' and create a linked new one, in one step,
-- so history is kept and both calendars update together (TCH-10).
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
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Lesson records (LES-01..05): three fixed parts per class.
-- ---------------------------------------------------------------------------
create table public.lesson_records (
  session_id              uuid primary key references public.class_sessions(id) on delete cascade,
  -- 1. Previous lesson (prefilled from the student's last completed class)
  previous_session_id     uuid references public.class_sessions(id) on delete set null,
  previous_summary        text not null default '',
  previous_topics         text not null default '',
  previous_performance    text not null default '',
  previous_improve        text not null default '',
  previous_unfinished     text not null default '',
  -- 2. Today's lesson
  today_objectives        text not null default '',
  today_topics            text not null default '',
  today_activities        text not null default '',
  today_vocab_grammar     text not null default '',
  today_skills            text[] not null default '{}' check (today_skills <@ array['speaking','listening','reading','writing']),
  today_notes             text not null default '',
  -- 3. Teacher's feedback
  feedback_overall        text not null default '',
  feedback_strengths      text not null default '',
  feedback_improve        text not null default '',
  feedback_corrections    text not null default '',
  feedback_pronunciation  text not null default '',
  feedback_next           text not null default '',
  shared_with_student     boolean not null default false,
  updated_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger lesson_records_touch before update on public.lesson_records
  for each row execute function public.touch_updated_at();

-- Teacher-only notes. Separate table because RLS filters rows, not columns.
create table public.lesson_private_notes (
  session_id  uuid primary key references public.class_sessions(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);
create trigger lesson_private_notes_touch before update on public.lesson_private_notes
  for each row execute function public.touch_updated_at();

-- Create the lesson record for a class, prefilling "Previous lesson" from the
-- student's most recent completed class before this one (LES-04).
create or replace function public.ensure_lesson_record(p_session uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  s public.class_sessions;
  prev public.class_sessions;
  pr public.lesson_records;
begin
  if exists (select 1 from public.lesson_records where session_id = p_session) then return; end if;
  select * into s from public.class_sessions where id = p_session;
  if not found then raise exception 'Class not found'; end if;

  select * into prev from public.class_sessions
  where student_id = s.student_id and status = 'completed' and starts_at < s.starts_at
  order by starts_at desc limit 1;

  if prev.id is not null then
    select * into pr from public.lesson_records where session_id = prev.id;
  end if;

  insert into public.lesson_records (
    session_id, previous_session_id, previous_summary, previous_topics, previous_performance,
    previous_improve, previous_unfinished, updated_by
  ) values (
    p_session, prev.id,
    coalesce(pr.today_objectives, ''),
    coalesce(pr.today_topics, ''),
    coalesce(pr.feedback_overall, ''),
    coalesce(pr.feedback_improve, ''),
    coalesce(pr.feedback_next, ''),
    (select auth.uid())
  ) on conflict (session_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Materials (MAT-01..04) and videos (VID-01..05)
-- ---------------------------------------------------------------------------
create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.class_sessions(id) on delete cascade,
  title         text not null check (length(title) between 1 and 200),
  unit_chapter  text not null default '',
  pages         text not null default '',
  kind          public.material_kind not null,
  storage_path  text,
  file_name     text,
  mime_type     text,
  size_bytes    bigint,
  url           text check (url is null or url ~* '^https?://'),
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);
create index materials_session_idx on public.materials(session_id);

create table public.videos (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.class_sessions(id) on delete cascade,
  youtube_id   text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title        text not null check (length(title) between 1 and 200),
  description  text not null default '',
  added_by     uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index videos_session_idx on public.videos(session_id);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.session_role(p_session uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.is_admin() then 'admin'
    when s.teacher_id = (select auth.uid()) then 'teacher'
    when s.student_id = (select auth.uid()) then 'student'
    -- A teacher currently assigned to the student can read past classes taught by
    -- someone else (lesson history follows the student, LES-04).
    when public.teaches(s.student_id) then 'other_teacher'
    else null end
  from public.class_sessions s where s.id = p_session;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.teacher_availability enable row level security;
alter table public.teacher_blackouts    enable row level security;
alter table public.class_sessions       enable row level security;
alter table public.lesson_records       enable row level security;
alter table public.lesson_private_notes enable row level security;
alter table public.materials            enable row level security;
alter table public.videos               enable row level security;

-- Availability: teacher manages own; admin all; a teacher's students may read it (for future booking).
create policy availability_select on public.teacher_availability for select to authenticated using (
  teacher_id = (select auth.uid()) or public.is_admin() or public.is_my_teacher(teacher_id)
);
create policy availability_write_own on public.teacher_availability for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()) and public.my_role() = 'teacher');
create policy availability_admin on public.teacher_availability for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy blackouts_select on public.teacher_blackouts for select to authenticated using (
  teacher_id = (select auth.uid()) or public.is_admin()
);
create policy blackouts_write_own on public.teacher_blackouts for all to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()) and public.my_role() = 'teacher');
create policy blackouts_admin on public.teacher_blackouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Sessions: participants read their own (STU-07); teachers create/edit their own classes
-- for assigned students (TCH-07); admins everything. Nobody but admins deletes.
create policy sessions_select on public.class_sessions for select to authenticated using (
  teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or public.is_admin() or public.teaches(student_id)
);
create policy sessions_insert_teacher on public.class_sessions for insert to authenticated
  with check (
    teacher_id = (select auth.uid()) and public.my_role() = 'teacher' and public.teaches(student_id)
    and status = 'scheduled' and public.setting_bool('teachers_can_schedule')
  );
create policy sessions_update_teacher on public.class_sessions for update to authenticated
  using (teacher_id = (select auth.uid()) and public.my_role() = 'teacher')
  with check (teacher_id = (select auth.uid()));
create policy sessions_admin on public.class_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Lesson records: teacher of the class and admins write; other assigned teachers read;
-- the student reads once the teacher shares it.
create policy lessons_select on public.lesson_records for select to authenticated using (
  public.session_role(session_id) in ('admin', 'teacher', 'other_teacher')
  or (public.session_role(session_id) = 'student' and shared_with_student)
);
create policy lessons_insert on public.lesson_records for insert to authenticated
  with check (public.session_role(session_id) in ('admin', 'teacher'));
create policy lessons_update on public.lesson_records for update to authenticated
  using (public.session_role(session_id) in ('admin', 'teacher'))
  with check (public.session_role(session_id) in ('admin', 'teacher'));

create policy private_notes_all on public.lesson_private_notes for all to authenticated
  using (public.session_role(session_id) in ('admin', 'teacher'))
  with check (public.session_role(session_id) in ('admin', 'teacher'));

-- Materials and videos: everyone on the class reads; the class's teacher and admins write.
create policy materials_select on public.materials for select to authenticated using (public.session_role(session_id) is not null);
create policy materials_write on public.materials for all to authenticated
  using (public.session_role(session_id) in ('admin', 'teacher'))
  with check (public.session_role(session_id) in ('admin', 'teacher'));

create policy videos_select on public.videos for select to authenticated using (public.session_role(session_id) is not null);
create policy videos_write on public.videos for all to authenticated
  using (public.session_role(session_id) in ('admin', 'teacher'))
  with check (public.session_role(session_id) in ('admin', 'teacher'));

-- ---------------------------------------------------------------------------
-- Storage: private "materials" bucket, files under {session_id}/..., served by signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a'
])
on conflict (id) do nothing;

create or replace function public.storage_session_role(p_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  begin
    v := (storage.foldername(p_name))[1]::uuid;
  exception when others then
    return null;
  end;
  return public.session_role(v);
end $$;

create policy materials_files_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.storage_session_role(name) is not null);
create policy materials_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.storage_session_role(name) in ('admin', 'teacher'));
create policy materials_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.storage_session_role(name) in ('admin', 'teacher'));

-- ---------------------------------------------------------------------------
-- Settings for Phase 2
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('teachers_can_schedule', 'true'::jsonb)
on conflict (key) do nothing;

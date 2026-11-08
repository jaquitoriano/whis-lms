-- Phase 6: progress reports (PRG-01..02), IELTS results and targets (PRG-03), and
-- teacher-student messaging (MSG-01).
--
-- Decisions (Nov 2026, change if needed):
--   PRG-01  Skills are rated on the CEFR scale with "+" half steps, stored as 1.0-6.0 in 0.5 steps:
--           1 = A1, 1.5 = A1+, 2 = A2, ... 5 = C1, 5.5 = C1+, 6 = C2. A skill can be left blank
--           ("not assessed this period"); the overall level is required to publish.
--   PRG-02  Reports are drafts until the teacher publishes them; only published reports reach the
--           student. The teacher can still correct a published report; every such change is audited.
--           A student is "due" a report once their earliest class since the last report is more
--           than `progress_report_days` (default 30) days old.
--   PRG-03  IELTS bands 0-9 in 0.5 steps. The overall band is worked out by the database: the mean of
--           the four skills rounded to the nearest 0.5, with .25 rounding up to .5 and .75 up to the
--           next whole band. A result with fewer than four skills (a single-skill practice test) has
--           no overall band. Results are visible to the student as soon as they are saved.
--   MSG-01  One general conversation per teacher-student pair, plus one per class. Only the two
--           people in it can write, and only while the teacher is assigned to the student. Students
--           keep read access to conversations with past teachers; a teacher loses access when the
--           student is moved to someone else (same rule as the rest of the student's data, NFR-23).
--           Admins can read every conversation (safeguarding, especially for minors) but can't post;
--           each time an admin opens one it is written to the audit log. Messages can't be edited or
--           deleted. Notifications and emails say who wrote, never what they wrote.

-- ---------------------------------------------------------------------------
-- Settings and scale helpers
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('progress_report_days', '30'::jsonb)
on conflict (key) do nothing;

create or replace function public.valid_band(x numeric)
returns boolean language sql immutable set search_path = '' as $$
  select x is null or (x between 0 and 9 and x * 2 = trunc(x * 2));
$$;

create or replace function public.valid_level(x numeric)
returns boolean language sql immutable set search_path = '' as $$
  select x is null or (x between 1 and 6 and x * 2 = trunc(x * 2));
$$;

-- ---------------------------------------------------------------------------
-- Progress reports (PRG-01..02)
-- ---------------------------------------------------------------------------
create type public.report_status as enum ('draft', 'published');

create table public.progress_reports (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  author_id      uuid references public.profiles(id) on delete set null,
  period_start   date not null,
  period_end     date not null,
  speaking       numeric(2,1) check (public.valid_level(speaking)),
  listening      numeric(2,1) check (public.valid_level(listening)),
  reading        numeric(2,1) check (public.valid_level(reading)),
  writing        numeric(2,1) check (public.valid_level(writing)),
  grammar        numeric(2,1) check (public.valid_level(grammar)),
  vocabulary     numeric(2,1) check (public.valid_level(vocabulary)),
  pronunciation  numeric(2,1) check (public.valid_level(pronunciation)),
  fluency        numeric(2,1) check (public.valid_level(fluency)),
  overall        numeric(2,1) check (public.valid_level(overall)),
  summary        text not null default '' check (length(summary) <= 5000),
  strengths      text not null default '' check (length(strengths) <= 5000),
  next_goals     text not null default '' check (length(next_goals) <= 5000),
  status         public.report_status not null default 'draft',
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start),
  check (status = 'draft' or overall is not null)
);
create index progress_reports_student_idx on public.progress_reports(student_id, period_end desc);
create trigger progress_reports_touch before update on public.progress_reports for each row execute function public.touch_updated_at();

create or replace function public.guard_progress_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' and v_uid is not null and not public.is_admin() then
      raise exception 'Published reports can only be removed by an administrator';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'published' then new.published_at := coalesce(new.published_at, now()); else new.published_at := null; end if;
    return new;
  end if;
  if new.student_id is distinct from old.student_id or new.author_id is distinct from old.author_id then
    raise exception 'The student and author of a report cannot be changed';
  end if;
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'A published report cannot go back to draft';
  end if;
  if old.status = 'draft' and new.status = 'published' then new.published_at := now();
  else new.published_at := old.published_at; end if;
  return new;
end $$;
create trigger progress_reports_guard before insert or update or delete on public.progress_reports
  for each row execute function public.guard_progress_report();

-- The student hears about a report once, when it is published (NOT-14 style).
create or replace function public.notify_progress_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform public.notify(new.student_id, 'progress_report', 'New progress report',
      coalesce((select full_name from public.profiles where id = new.author_id), 'Your teacher') || ' wrote your progress report for '
        || to_char(new.period_start, 'FMDD Mon') || ' – ' || to_char(new.period_end, 'FMDD Mon YYYY') || '.',
      '/student/progress#r-' || new.id, 'progress_report:' || new.id);
  end if;
  return new;
end $$;
create trigger progress_reports_notify after insert or update of status on public.progress_reports
  for each row execute function public.notify_progress_report();

-- Audit: publishing, any change after publishing, and removing a published report (NFR-27).
create or replace function public.audit_progress_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      insert into public.audit_log (actor_id, action, entity, entity_id, before)
      values ((select auth.uid()), 'progress.delete', 'progress_reports', old.id::text, to_jsonb(old));
    end if;
    return old;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then
    insert into public.audit_log (actor_id, action, entity, entity_id, after)
    values ((select auth.uid()), 'progress.publish', 'progress_reports', new.id::text,
            jsonb_build_object('student_id', new.student_id, 'overall', new.overall, 'period_end', new.period_end));
  elsif tg_op = 'UPDATE' and old.status = 'published' then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'progress.edit', 'progress_reports', new.id::text,
            to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at');
  end if;
  return new;
end $$;
create trigger progress_reports_audit after insert or update or delete on public.progress_reports
  for each row execute function public.audit_progress_report();

-- ---------------------------------------------------------------------------
-- IELTS results and targets (PRG-03)
-- ---------------------------------------------------------------------------
create type public.ielts_kind as enum ('diagnostic', 'mock', 'official');
create type public.ielts_module as enum ('academic', 'general_training');

create table public.ielts_results (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  kind         public.ielts_kind not null default 'mock',
  module       public.ielts_module not null default 'academic',
  test_date    date not null,
  listening    numeric(2,1) check (public.valid_band(listening)),
  reading      numeric(2,1) check (public.valid_band(reading)),
  writing      numeric(2,1) check (public.valid_band(writing)),
  speaking     numeric(2,1) check (public.valid_band(speaking)),
  -- Mean of the four, to the nearest 0.5; .25 -> .5 and .75 -> next band. Null unless all four are in.
  overall      numeric(2,1) generated always as (floor((listening + reading + writing + speaking) / 2 + 0.5) / 2) stored,
  notes        text not null default '' check (length(notes) <= 2000),
  recorded_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (listening is not null or reading is not null or writing is not null or speaking is not null)
);
create index ielts_results_student_idx on public.ielts_results(student_id, test_date desc);
create trigger ielts_results_touch before update on public.ielts_results for each row execute function public.touch_updated_at();

create or replace function public.guard_ielts_result()
returns trigger language plpgsql as $$
begin
  if new.student_id is distinct from old.student_id or new.recorded_by is distinct from old.recorded_by then
    raise exception 'The student of a result cannot be changed';
  end if;
  return new;
end $$;
create trigger ielts_results_guard before update on public.ielts_results
  for each row execute function public.guard_ielts_result();

create or replace function public.fmt_band(x numeric)
returns text language sql immutable set search_path = '' as $$
  select case when x is null then '–' else to_char(x, 'FM0.0') end;
$$;

create or replace function public.notify_ielts_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.student_id, 'ielts_result',
    'New IELTS ' || case new.kind when 'mock' then 'mock test' when 'official' then 'official' else 'diagnostic' end || ' result',
    case when new.overall is not null then 'Overall band ' || public.fmt_band(new.overall) || ' (' else '' end
      || 'L ' || public.fmt_band(new.listening) || ', R ' || public.fmt_band(new.reading)
      || ', W ' || public.fmt_band(new.writing) || ', S ' || public.fmt_band(new.speaking)
      || case when new.overall is not null then ')' else '' end || '.',
    '/student/progress#ielts', 'ielts:' || new.id);
  return new;
end $$;
create trigger ielts_results_notify after insert on public.ielts_results
  for each row execute function public.notify_ielts_result();

-- Scores are grades: changes and removals are audited (NFR-27).
create or replace function public.audit_ielts_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values ((select auth.uid()), 'ielts.' || lower(tg_op), 'ielts_results', coalesce(new.id, old.id)::text,
          case when tg_op = 'INSERT' then null else to_jsonb(old) - 'updated_at' end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) - 'updated_at' end);
  return coalesce(new, old);
end $$;
create trigger ielts_results_audit after insert or update or delete on public.ielts_results
  for each row execute function public.audit_ielts_result();

-- One target per student: the band they're aiming for and their exam date [Suggested].
create table public.ielts_goals (
  student_id      uuid primary key references public.profiles(id) on delete cascade,
  target_overall  numeric(2,1) check (public.valid_band(target_overall)),
  exam_date       date,
  updated_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);
create trigger ielts_goals_touch before update on public.ielts_goals for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Who is due a progress report (DASH-02)
-- ---------------------------------------------------------------------------
-- Students (actively assigned to p_teacher, or to anyone when null) whose earliest completed
-- class since the last published report is more than `progress_report_days` old.
create or replace function public.progress_due_list(p_teacher uuid)
returns table (student_id uuid, since date) language sql stable security definer set search_path = '' as $$
  with mine as (
    select distinct ts.student_id from public.teacher_students ts
    join public.profiles p on p.id = ts.student_id and p.status = 'active'
    where ts.active and (p_teacher is null or ts.teacher_id = p_teacher)
  ), last as (
    select r.student_id, max(r.period_end) as period_end from public.progress_reports r
    where r.status = 'published' and r.student_id in (select student_id from mine)
    group by r.student_id
  )
  select m.student_id, min((s.starts_at at time zone public.school_tz())::date)
  from mine m
  left join last l on l.student_id = m.student_id
  join public.class_sessions s on s.student_id = m.student_id and s.status = 'completed'
   and (s.starts_at at time zone public.school_tz())::date > coalesce(l.period_end, '-infinity'::date)
  group by m.student_id
  having min(s.starts_at) < now() - make_interval(days => public.setting_num('progress_report_days', 30)::int);
$$;
revoke execute on function public.progress_due_list(uuid) from public, anon, authenticated;

-- The caller's own list: a teacher's assigned students, or every student for an admin.
create or replace function public.progress_due()
returns table (student_id uuid, since date) language sql stable security definer set search_path = '' as $$
  select * from public.progress_due_list((select auth.uid())) where public.my_role() = 'teacher'
  union all
  select * from public.progress_due_list(null) where public.is_admin();
$$;

-- Weekly reminder for teachers (run by the cron endpoint).
create or replace function public.generate_progress_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_days int := public.setting_num('progress_report_days', 30)::int;
begin
  for r in select p.id, (select count(*) from public.progress_due_list(p.id)) as cnt
           from public.profiles p where p.role = 'teacher' and p.status = 'active' loop
    continue when r.cnt = 0;
    perform public.notify(r.id, 'progress_due',
      r.cnt || ' student' || case when r.cnt > 1 then 's are' else ' is' end || ' due a progress report',
      'Their last report is more than ' || v_days || ' days old, or they have none yet.',
      '/teacher/progress', 'progress_due:' || to_char(public.school_today(), 'IYYY-IW'));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.generate_progress_notifications() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Messaging (MSG-01)
-- ---------------------------------------------------------------------------
create type public.thread_kind as enum ('general', 'class');

create table public.message_threads (
  id               uuid primary key default gen_random_uuid(),
  kind             public.thread_kind not null default 'general',
  teacher_id       uuid not null references public.profiles(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  session_id       uuid references public.class_sessions(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz,
  last_sender_id   uuid,
  last_preview     text not null default '',
  teacher_read_at  timestamptz,
  student_read_at  timestamptz
);
create unique index message_threads_general on public.message_threads(teacher_id, student_id) where kind = 'general';
create unique index message_threads_class on public.message_threads(session_id) where session_id is not null;
create index message_threads_teacher_idx on public.message_threads(teacher_id, last_message_at desc nulls last);
create index message_threads_student_idx on public.message_threads(student_id, last_message_at desc nulls last);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.message_threads(id) on delete cascade,
  sender_id   uuid references public.profiles(id) on delete set null,
  body        text not null default '' check (length(body) <= 5000),
  created_at  timestamptz not null default now()
);
create index messages_thread_idx on public.messages(thread_id, created_at);

create table public.message_files (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  thread_id     uuid not null references public.message_threads(id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index message_files_message_idx on public.message_files(message_id);

-- 'write' for the two people while the teacher is assigned; 'read' for the student afterwards
-- and for admins; null for everyone else (including a teacher who no longer has the student).
create or replace function public.thread_access(p_thread uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when t.teacher_id = (select auth.uid()) and public.teaches(t.student_id) then 'write'
    when t.student_id = (select auth.uid()) and exists (
      select 1 from public.teacher_students ts where ts.teacher_id = t.teacher_id and ts.student_id = t.student_id and ts.active) then 'write'
    when t.student_id = (select auth.uid()) then 'read'
    when public.is_admin() then 'read'
    else null end
  from public.message_threads t where t.id = p_thread;
$$;

-- Finds or starts a conversation. With p_session: the class's conversation. Otherwise the general
-- one with p_with (a teacher's assigned student, or a student's assigned teacher).
create or replace function public.open_thread(p_with uuid default null, p_session uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_role public.user_role := public.my_role(); v_t uuid; v_s uuid; v_id uuid;
begin
  if p_session is not null then
    select teacher_id, student_id into v_t, v_s from public.class_sessions where id = p_session;
    if v_t is null or v_uid not in (v_t, v_s) then raise exception 'Not allowed'; end if;
    select id into v_id from public.message_threads where session_id = p_session;
  else
    if v_role = 'teacher' then v_t := v_uid; v_s := p_with;
    elsif v_role = 'student' then v_t := p_with; v_s := v_uid;
    else raise exception 'Not allowed'; end if;
    select id into v_id from public.message_threads where kind = 'general' and teacher_id = v_t and student_id = v_s;
  end if;
  if v_id is not null and public.thread_access(v_id) is not null then return v_id; end if;
  if not exists (select 1 from public.teacher_students where teacher_id = v_t and student_id = v_s and active) then
    raise exception 'You can only message your own teacher or students';
  end if;
  insert into public.message_threads (kind, teacher_id, student_id, session_id, created_by)
  values (case when p_session is null then 'general' else 'class' end::public.thread_kind, v_t, v_s, p_session, v_uid)
  on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.message_threads
    where (p_session is not null and session_id = p_session)
       or (p_session is null and kind = 'general' and teacher_id = v_t and student_id = v_s);
  end if;
  return v_id;
end $$;

-- The only way to post. Attachments must already be uploaded by the sender into
-- messages/{thread}/{sender}/..., and each file can be attached once.
create or replace function public.send_message(p_thread uuid, p_body text, p_files jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; f jsonb; v_body text := btrim(coalesce(p_body, ''));
        v_files jsonb := coalesce(p_files, '[]'::jsonb);
begin
  if public.thread_access(p_thread) is distinct from 'write' then
    raise exception 'You can''t send messages in this conversation';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 10 then raise exception 'Attach up to 10 files'; end if;
  if v_body = '' and jsonb_array_length(v_files) = 0 then raise exception 'Write a message or attach a file'; end if;
  if length(v_body) > 5000 then raise exception 'Messages can be up to 5000 characters'; end if;
  insert into public.messages (thread_id, sender_id, body) values (p_thread, v_uid, v_body) returning id into v_id;
  for f in select * from jsonb_array_elements(v_files) loop
    if coalesce(f->>'path', '') not like p_thread::text || '/' || v_uid::text || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'messages' and o.name = f->>'path') then
      raise exception 'Attachment not found. Please upload it again.';
    end if;
    insert into public.message_files (message_id, thread_id, storage_path, file_name, mime_type, size_bytes)
    values (v_id, p_thread, f->>'path', left(coalesce(nullif(f->>'name', ''), 'file'), 200), left(f->>'type', 200),
            case when coalesce(f->>'size', '') ~ '^\d{1,12}$' then (f->>'size')::bigint end);
  end loop;
  return v_id;
end $$;

-- After a message: update the conversation summary and tell the other person. While they still
-- have an unread "new message" notification for this conversation, no second one is added.
create or replace function public.after_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.message_threads; v_to uuid; v_role text; v_about text;
begin
  update public.message_threads set
    last_message_at = new.created_at,
    last_sender_id = new.sender_id,
    last_preview = case when new.body = '' then 'Sent a file' else left(regexp_replace(new.body, '\s+', ' ', 'g'), 140) end,
    teacher_read_at = case when teacher_id = new.sender_id then new.created_at else teacher_read_at end,
    student_read_at = case when student_id = new.sender_id then new.created_at else student_read_at end
  where id = new.thread_id returning * into t;
  if new.sender_id = t.teacher_id then v_to := t.student_id; v_role := 'student';
  elsif new.sender_id = t.student_id then v_to := t.teacher_id; v_role := 'teacher';
  else return new; end if;
  if exists (select 1 from public.notifications where user_id = v_to and dedupe_key like 'msg:' || t.id || ':%' and read_at is null) then
    return new;
  end if;
  v_about := case when t.session_id is not null
    then 'About the class on ' || public.fmt_for(v_to, (select starts_at from public.class_sessions where id = t.session_id)) || '.'
    else 'Open Messages to read and reply.' end;
  perform public.notify(v_to, 'message', 'New message from ' || (select full_name from public.profiles where id = new.sender_id),
    v_about, '/' || v_role || '/messages/' || t.id, 'msg:' || t.id || ':' || new.id);
  return new;
end $$;
create trigger messages_after after insert on public.messages for each row execute function public.after_message();

create or replace function public.guard_message_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Messages cannot be edited or deleted';
end $$;
create trigger messages_immutable before update or delete on public.messages
  for each row when (pg_trigger_depth() < 1) execute function public.guard_message_change();

-- Opening a conversation marks it read, and with it the matching notifications. An email that
-- hasn't gone out yet is skipped: the person has already seen the message.
create or replace function public.mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if public.thread_access(p_thread) is null then return; end if;
  update public.message_threads set
    teacher_read_at = case when teacher_id = v_uid then now() else teacher_read_at end,
    student_read_at = case when student_id = v_uid then now() else student_read_at end
  where id = p_thread and v_uid in (teacher_id, student_id);
  update public.notifications set
    read_at = coalesce(read_at, now()),
    email_status = case when email_status = 'pending' then 'skipped' else email_status end
  where user_id = v_uid and dedupe_key like 'msg:' || p_thread || ':%' and (read_at is null or email_status = 'pending');
end $$;

-- Conversations with something the caller hasn't read (the Messages badge).
create or replace function public.unread_message_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.message_threads t
  where t.last_message_at is not null and t.last_sender_id is distinct from (select auth.uid())
    and ((t.teacher_id = (select auth.uid()) and public.teaches(t.student_id) and t.last_message_at > coalesce(t.teacher_read_at, '-infinity'))
      or (t.student_id = (select auth.uid()) and t.last_message_at > coalesce(t.student_read_at, '-infinity')));
$$;

-- Admins reading a private conversation leave a trace (NFR-27).
create or replace function public.log_thread_view(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then return; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id)
  values ((select auth.uid()), 'messages.view', 'message_threads', p_thread::text);
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private "messages" bucket. Paths: {thread_id}/{sender_id}/{random}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'
])
on conflict (id) do nothing;

-- Read: anyone who can read the conversation. Upload and remove: only the sender, into their own
-- folder, while they can write, and only files not yet attached to a sent message.
create or replace function public.message_storage_check(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_name); v_t uuid;
begin
  begin
    v_t := parts[1]::uuid;
  exception when others then
    return false;
  end;
  if p_write then
    return parts[2] = (select auth.uid())::text and array_length(parts, 1) = 3
       and public.thread_access(v_t) = 'write'
       and not exists (select 1 from public.message_files f where f.storage_path = p_name);
  end if;
  return public.thread_access(v_t) is not null;
end $$;

create policy message_files_read on storage.objects for select to authenticated
  using (bucket_id = 'messages' and public.message_storage_check(name, false));
create policy message_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'messages' and public.message_storage_check(name, true));
create policy message_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'messages' and public.message_storage_check(name, true));

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.progress_reports  enable row level security;
alter table public.ielts_results     enable row level security;
alter table public.ielts_goals       enable row level security;
alter table public.message_threads   enable row level security;
alter table public.messages          enable row level security;
alter table public.message_files     enable row level security;

-- Progress reports: students read their published reports. A teacher reads the published reports of
-- students they teach (including earlier teachers' reports, like lesson history) and their own drafts.
create policy reports_select on public.progress_reports for select to authenticated using (
  (select public.is_admin())
  or (student_id = (select auth.uid()) and status = 'published')
  or (public.teaches(student_id) and (status = 'published' or author_id = (select auth.uid())))
);
create policy reports_insert on public.progress_reports for insert to authenticated with check (
  (select public.is_admin())
  or (author_id = (select auth.uid()) and public.my_role() = 'teacher' and public.teaches(student_id))
);
create policy reports_update on public.progress_reports for update to authenticated
  using ((select public.is_admin()) or (author_id = (select auth.uid()) and public.teaches(student_id)))
  with check ((select public.is_admin()) or (author_id = (select auth.uid()) and public.teaches(student_id)));
create policy reports_delete on public.progress_reports for delete to authenticated
  using ((select public.is_admin()) or (author_id = (select auth.uid()) and status = 'draft'));

-- IELTS results: the student reads their own; assigned teachers and admins add them. A teacher can
-- correct or remove only results they entered.
create policy ielts_select on public.ielts_results for select to authenticated using (
  (select public.is_admin()) or student_id = (select auth.uid()) or public.teaches(student_id)
);
create policy ielts_insert on public.ielts_results for insert to authenticated with check (
  (select public.is_admin())
  or (recorded_by = (select auth.uid()) and public.my_role() = 'teacher' and public.teaches(student_id))
);
create policy ielts_update on public.ielts_results for update to authenticated
  using ((select public.is_admin()) or (recorded_by = (select auth.uid()) and public.teaches(student_id)))
  with check ((select public.is_admin()) or (recorded_by = (select auth.uid()) and public.teaches(student_id)));
create policy ielts_delete on public.ielts_results for delete to authenticated
  using ((select public.is_admin()) or (recorded_by = (select auth.uid()) and public.teaches(student_id)));

create policy goals_select on public.ielts_goals for select to authenticated using (
  (select public.is_admin()) or student_id = (select auth.uid()) or public.teaches(student_id)
);
create policy goals_insert on public.ielts_goals for insert to authenticated
  with check ((select public.is_admin()) or (public.my_role() = 'teacher' and public.teaches(student_id)));
create policy goals_update on public.ielts_goals for update to authenticated
  using ((select public.is_admin()) or (public.my_role() = 'teacher' and public.teaches(student_id)))
  with check ((select public.is_admin()) or (public.my_role() = 'teacher' and public.teaches(student_id)));

-- Messaging: read only. Conversations are started by open_thread(), messages sent by send_message(),
-- and read markers set by mark_thread_read(), so there are no insert, update or delete policies.
create policy threads_select on public.message_threads for select to authenticated using (
  (select public.is_admin())
  or student_id = (select auth.uid())
  or (teacher_id = (select auth.uid()) and public.teaches(student_id))
);
create policy messages_select on public.messages for select to authenticated
  using (public.thread_access(thread_id) is not null);
create policy message_files_select on public.message_files for select to authenticated
  using (public.thread_access(thread_id) is not null);

revoke execute on function public.after_message() from public, anon, authenticated;

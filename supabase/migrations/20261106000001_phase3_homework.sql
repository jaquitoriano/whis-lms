-- Phase 3: homework. Assign (HW-01..07), submit with versions (HW-10..15),
-- review and revision loop (HW-16..21), history (HW-30), privacy (HW-S26).
-- Owner decisions (4 Nov 2026): no scores or grades; late submission allowed and
-- marked late; after a submission only the deadline can change; files kept indefinitely.

create type public.homework_status as enum ('assigned', 'submitted', 'under_review', 'needs_revision', 'completed');
create type public.homework_file_kind as enum ('reference', 'submission', 'correction');
create type public.review_decision as enum ('needs_revision', 'completed');

create table public.homework_assignments (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.class_sessions(id) on delete set null,   -- null = outside a class (HW-S06)
  teacher_id    uuid not null references public.profiles(id),
  student_id    uuid not null references public.profiles(id),
  title         text not null check (length(title) between 1 and 200),
  instructions  text not null default '' check (length(instructions) <= 20000),
  requirements  text not null default '' check (length(requirements) <= 2000),
  due_at        timestamptz not null,
  is_required   boolean not null default true,
  status        public.homework_status not null default 'assigned',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index homework_student_idx on public.homework_assignments(student_id, due_at);
create index homework_teacher_idx on public.homework_assignments(teacher_id, status);
create index homework_session_idx on public.homework_assignments(session_id);
create trigger homework_touch before update on public.homework_assignments
  for each row execute function public.touch_updated_at();

-- One row per hand-in. Exactly one open draft at a time; submitted rows are never edited.
create table public.homework_submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.homework_assignments(id) on delete cascade,
  version        int not null check (version >= 1),
  answer_text    text not null default '' check (length(answer_text) <= 50000),
  is_draft       boolean not null default true,
  submitted_at   timestamptz,
  is_late        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id, version)
);
create unique index homework_one_draft on public.homework_submissions(assignment_id) where is_draft;
create trigger submissions_touch before update on public.homework_submissions
  for each row execute function public.touch_updated_at();

-- The teacher's review of one submission. Invisible to the student until sent.
create table public.homework_reviews (
  submission_id  uuid primary key references public.homework_submissions(id) on delete cascade,
  reviewer_id    uuid references public.profiles(id),
  comments       text not null default '' check (length(comments) <= 20000),
  corrections    text not null default '' check (length(corrections) <= 20000),
  decision       public.review_decision,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger reviews_touch before update on public.homework_reviews
  for each row execute function public.touch_updated_at();

-- Files: teacher reference material, student submission files, teacher corrected files.
create table public.homework_files (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.homework_assignments(id) on delete cascade,
  submission_id  uuid references public.homework_submissions(id) on delete cascade,
  kind           public.homework_file_kind not null,
  title          text not null default '',
  storage_path   text,
  url            text check (url is null or url ~* '^https?://'),
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  position       int not null default 0,
  uploaded_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  check (storage_path is not null or (kind = 'reference' and url is not null)),
  check ((kind = 'reference') = (submission_id is null))
);
create index homework_files_assignment_idx on public.homework_files(assignment_id);
create index homework_files_submission_idx on public.homework_files(submission_id);

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.homework_role(p_assignment uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when public.is_admin() then 'admin'
    when a.teacher_id = (select auth.uid()) then 'teacher'
    when a.student_id = (select auth.uid()) then 'student'
    when public.teaches(a.student_id) then 'other_teacher'   -- history follows the student (HW-S24)
    else null end
  from public.homework_assignments a where a.id = p_assignment;
$$;

-- The student may work on a draft while the homework is open to them.
create or replace function public.student_can_work(p_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.homework_assignments
    where id = p_assignment and student_id = (select auth.uid()) and status in ('assigned', 'needs_revision')
  );
$$;

create or replace function public.has_submissions(p_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.homework_submissions where assignment_id = p_assignment and not is_draft);
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
create or replace function public.check_homework_pair()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.teacher_students where teacher_id = new.teacher_id and student_id = new.student_id and active) then
    raise exception 'This student is not assigned to this teacher' using errcode = 'P0001';
  end if;
  if new.session_id is not null and not exists (
    select 1 from public.class_sessions where id = new.session_id and teacher_id = new.teacher_id and student_id = new.student_id
  ) then
    raise exception 'That class belongs to a different teacher or student' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger homework_pair_check before insert or update of teacher_id, student_id, session_id on public.homework_assignments
  for each row execute function public.check_homework_pair();

-- HW-S07: once anything has been submitted, only the deadline may change.
-- Status is changed only through the workflow functions below (they set a flag).
create or replace function public.guard_homework_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('app.homework_workflow', true), '') <> 'on' then
    raise exception 'Homework status changes go through submit/review actions';
  end if;
  if public.has_submissions(old.id) and (
       new.title is distinct from old.title or new.instructions is distinct from old.instructions
       or new.requirements is distinct from old.requirements or new.is_required is distinct from old.is_required
       or new.session_id is distinct from old.session_id or new.student_id is distinct from old.student_id
       or new.teacher_id is distinct from old.teacher_id) then
    raise exception 'After a submission only the deadline can be changed';
  end if;
  return new;
end $$;

create trigger homework_guard before update on public.homework_assignments
  for each row execute function public.guard_homework_update();

create or replace function public.guard_homework_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.has_submissions(old.id) and not public.is_admin() then
    raise exception 'Homework with submissions cannot be withdrawn';
  end if;
  return old;
end $$;

create trigger homework_delete_guard before delete on public.homework_assignments
  for each row execute function public.guard_homework_delete();

-- Submitted versions are frozen.
create or replace function public.guard_submission_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not old.is_draft and coalesce(current_setting('app.homework_workflow', true), '') <> 'on' then
    raise exception 'A submitted version cannot be changed';
  end if;
  return new;
end $$;

create trigger submissions_guard before update on public.homework_submissions
  for each row execute function public.guard_submission_update();

-- ---------------------------------------------------------------------------
-- Workflow (security definer; each checks the caller itself)
-- ---------------------------------------------------------------------------

-- Student: open (or return) the current draft. Creates version n+1.
create or replace function public.open_homework_draft(p_assignment uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_next int;
begin
  if not public.student_can_work(p_assignment) then raise exception 'This homework is not open for submission'; end if;
  select id into v_id from public.homework_submissions where assignment_id = p_assignment and is_draft;
  if v_id is not null then return v_id; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.homework_submissions where assignment_id = p_assignment;
  insert into public.homework_submissions (assignment_id, version) values (p_assignment, v_next) returning id into v_id;
  return v_id;
end $$;

-- Student: hand in the draft (HW-12, HW-S13/14/15).
create or replace function public.submit_homework(p_assignment uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.homework_submissions; a public.homework_assignments;
begin
  if not public.student_can_work(p_assignment) then raise exception 'This homework is not open for submission'; end if;
  select * into a from public.homework_assignments where id = p_assignment;
  select * into s from public.homework_submissions where assignment_id = p_assignment and is_draft;
  if s.id is null then raise exception 'Nothing to submit'; end if;
  if length(trim(s.answer_text)) = 0 and not exists (select 1 from public.homework_files where submission_id = s.id) then
    raise exception 'Add an answer or at least one file before submitting';
  end if;
  perform set_config('app.homework_workflow', 'on', true);
  update public.homework_submissions set is_draft = false, submitted_at = now(), is_late = now() > a.due_at where id = s.id;
  update public.homework_assignments set status = 'submitted' where id = p_assignment;
  perform set_config('app.homework_workflow', 'off', true);
  return s.id;
end $$;

-- Teacher: opening a submitted piece marks it Under Review (HW-S17).
create or replace function public.start_homework_review(p_assignment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.homework_role(p_assignment) not in ('teacher', 'admin') then raise exception 'Not allowed'; end if;
  perform set_config('app.homework_workflow', 'on', true);
  update public.homework_assignments set status = 'under_review' where id = p_assignment and status = 'submitted';
  perform set_config('app.homework_workflow', 'off', true);
end $$;

-- Teacher: send the review with a decision (HW-S21). The review text is saved
-- separately (autosaved draft); this makes it visible and moves the status.
create or replace function public.send_homework_review(p_submission uuid, p_decision public.review_decision)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.homework_submissions; v_latest uuid;
begin
  select * into s from public.homework_submissions where id = p_submission and not is_draft;
  if s.id is null then raise exception 'Submission not found'; end if;
  if public.homework_role(s.assignment_id) not in ('teacher', 'admin') then raise exception 'Not allowed'; end if;
  select id into v_latest from public.homework_submissions where assignment_id = s.assignment_id and not is_draft order by version desc limit 1;
  if v_latest <> p_submission then raise exception 'Only the latest submission can be reviewed'; end if;

  insert into public.homework_reviews (submission_id, reviewer_id) values (p_submission, (select auth.uid()))
    on conflict (submission_id) do nothing;
  update public.homework_reviews set decision = p_decision, sent_at = now(), reviewer_id = (select auth.uid()) where submission_id = p_submission;

  perform set_config('app.homework_workflow', 'on', true);
  update public.homework_assignments set status = p_decision::text::public.homework_status where id = s.assignment_id;
  perform set_config('app.homework_workflow', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.homework_assignments enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.homework_reviews     enable row level security;
alter table public.homework_files       enable row level security;

-- Checked on the row itself (not via homework_role) so a teacher's INSERT ... RETURNING
-- can see the row it just created.
create policy hw_select on public.homework_assignments for select to authenticated using (
  public.is_admin() or teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or public.teaches(student_id)
);
create policy hw_insert_teacher on public.homework_assignments for insert to authenticated
  with check (teacher_id = (select auth.uid()) and public.my_role() = 'teacher' and public.teaches(student_id) and status = 'assigned');
create policy hw_update_teacher on public.homework_assignments for update to authenticated
  using (teacher_id = (select auth.uid()) and public.my_role() = 'teacher') with check (teacher_id = (select auth.uid()));
create policy hw_delete_teacher on public.homework_assignments for delete to authenticated
  using (teacher_id = (select auth.uid()) and public.my_role() = 'teacher');
create policy hw_admin on public.homework_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Submissions: the student sees all their own (drafts included); teachers and admins
-- see only what has been handed in.
create policy sub_select on public.homework_submissions for select to authenticated using (
  (public.homework_role(assignment_id) = 'student')
  or (not is_draft and public.homework_role(assignment_id) in ('teacher', 'admin', 'other_teacher'))
);
create policy sub_update_draft on public.homework_submissions for update to authenticated
  using (is_draft and public.student_can_work(assignment_id))
  with check (is_draft and public.student_can_work(assignment_id));

-- Reviews: teacher and admin write while unsent; student reads once sent.
create policy rev_select on public.homework_reviews for select to authenticated using (
  exists (
    select 1 from public.homework_submissions s where s.id = submission_id
    and (public.homework_role(s.assignment_id) in ('teacher', 'admin', 'other_teacher')
         or (sent_at is not null and public.homework_role(s.assignment_id) = 'student'))
  )
);
create policy rev_write on public.homework_reviews for all to authenticated
  using (sent_at is null and exists (select 1 from public.homework_submissions s where s.id = submission_id and public.homework_role(s.assignment_id) in ('teacher', 'admin')))
  with check (sent_at is null and exists (select 1 from public.homework_submissions s where s.id = submission_id and public.homework_role(s.assignment_id) in ('teacher', 'admin')));

-- Files follow the row they belong to.
create or replace function public.homework_file_visible(p_assignment uuid, p_submission uuid, p_kind public.homework_file_kind)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r text := public.homework_role(p_assignment); s public.homework_submissions; rv public.homework_reviews;
begin
  if r is null then return false; end if;
  if p_kind = 'reference' then return true; end if;
  select * into s from public.homework_submissions where id = p_submission;
  if p_kind = 'submission' then
    return r = 'student' or not s.is_draft;
  end if;
  -- correction files: staff always; the student only once the review is sent
  if r <> 'student' then return true; end if;
  select * into rv from public.homework_reviews where submission_id = p_submission;
  return rv.sent_at is not null;
end $$;

create or replace function public.homework_file_writable(p_assignment uuid, p_submission uuid, p_kind public.homework_file_kind)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r text := public.homework_role(p_assignment); s public.homework_submissions; rv public.homework_reviews;
begin
  if p_kind = 'reference' then return r in ('teacher', 'admin'); end if;
  select * into s from public.homework_submissions where id = p_submission and assignment_id = p_assignment;
  if s.id is null then return false; end if;
  if p_kind = 'submission' then return r = 'student' and s.is_draft and public.student_can_work(p_assignment); end if;
  select * into rv from public.homework_reviews where submission_id = p_submission;
  return r in ('teacher', 'admin') and not s.is_draft and (rv.sent_at is null);
end $$;

create policy files_select on public.homework_files for select to authenticated
  using (public.homework_file_visible(assignment_id, submission_id, kind));
create policy files_insert on public.homework_files for insert to authenticated
  with check (public.homework_file_writable(assignment_id, submission_id, kind) and uploaded_by = (select auth.uid()));
create policy files_delete on public.homework_files for delete to authenticated
  using (public.homework_file_writable(assignment_id, submission_id, kind));

-- ---------------------------------------------------------------------------
-- Storage: private "homework" bucket.
-- Paths: {assignment_id}/reference/{file}
--        {assignment_id}/{submission_id}/submission/{file}
--        {assignment_id}/{submission_id}/correction/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework', 'homework', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'
])
on conflict (id) do nothing;

create or replace function public.homework_storage_check(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_name); v_a uuid; v_s uuid; v_kind public.homework_file_kind;
begin
  begin
    v_a := parts[1]::uuid;
    if parts[2] = 'reference' then
      v_kind := 'reference';
    else
      v_s := parts[2]::uuid;
      v_kind := parts[3]::public.homework_file_kind;
      if v_kind = 'reference' then return false; end if;
    end if;
  exception when others then
    return false;
  end;
  if p_write then return public.homework_file_writable(v_a, v_s, v_kind); end if;
  return public.homework_file_visible(v_a, v_s, v_kind);
end $$;

create policy homework_files_read on storage.objects for select to authenticated
  using (bucket_id = 'homework' and public.homework_storage_check(name, false));
create policy homework_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'homework' and public.homework_storage_check(name, true));
create policy homework_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'homework' and public.homework_storage_check(name, true));

-- Audit: decisions are important changes (NFR-27).
create or replace function public.audit_homework_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'homework.status', 'homework_assignments', new.id::text,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;

create trigger homework_audit after update on public.homework_assignments
  for each row execute function public.audit_homework_status();

-- HW-S12: the student reorders photo pages in their draft. Positions only; the
-- caller must be allowed to edit that draft's files.
create or replace function public.reorder_submission_files(p_submission uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_a uuid;
begin
  select assignment_id into v_a from public.homework_submissions where id = p_submission;
  if v_a is null or not public.homework_file_writable(v_a, p_submission, 'submission') then
    raise exception 'Not allowed';
  end if;
  update public.homework_files f set position = x.ord - 1
  from unnest(p_ids) with ordinality as x(id, ord)
  where f.id = x.id and f.submission_id = p_submission;
end $$;

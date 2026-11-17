-- Change request (Nov 2026, "Late and Absent Student"): a late arrival is recorded as with or
-- without notice. The school's policy: more than 20 minutes late without informing the tutor
-- is charged as a completed lesson.
-- The mark stays 'late', so class usage, pay and reports are unchanged. with_notice is null for
-- marks recorded before this change. Allowed on 'absent' too, for the matching absence request.
alter table public.attendance
  add column with_notice boolean,
  add constraint attendance_with_notice_mark check (with_notice is null or mark in ('late', 'absent'));

-- A status change resets the mark, so it resets the notice too (was: minutes_late only).
create or replace function public.sync_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mark public.attendance_mark;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;
  v_mark := case new.status
    when 'completed' then 'present' when 'student_absent' then 'absent'
    when 'cancelled' then 'cancelled' when 'rescheduled' then 'rescheduled' end;
  if v_mark is null then
    delete from public.attendance where session_id = new.id;
  else
    insert into public.attendance (session_id, student_id, mark, marked_by)
    values (new.id, new.student_id, v_mark, (select auth.uid()))
    on conflict (session_id) do update set mark = excluded.mark, minutes_late = null, with_notice = null,
      marked_by = excluded.marked_by, marked_at = now();
  end if;
  return null;
end $$;

-- "Student absent with notice" replaces cancelling a class (the Cancel class button is gone).
-- Like a student cancellation in good time, it uses no class from the package and is not paid to
-- the teacher. "Absent without notice" still uses a class, as every absence did before.
-- Usage is worked out when the status changes; the notice is saved just after, so the database
-- works it out again when the notice on an absence is set or changed (app.usage_recount).
create or replace function public.apply_session_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := (select auth.uid()) is null or public.is_admin();
  v_day date := (new.starts_at at time zone public.school_tz())::date;
  v_enrollment_student uuid;
begin
  -- Only admins choose the package or override usage. Everyone else's changes are ignored.
  if not v_admin then
    if tg_op = 'INSERT' then
      new.enrollment_id := (select enrollment_id from public.class_sessions where id = new.rescheduled_from_id);
      new.counts_as_used := false;
      new.late_cancel := false;
    else
      new.enrollment_id := old.enrollment_id;
      new.counts_as_used := old.counts_as_used;
      new.late_cancel := old.late_cancel;
    end if;
  end if;

  -- New classes join the student's current package automatically: the active one for the same
  -- course whose dates cover the class, otherwise any active one that covers it.
  if tg_op = 'INSERT' and new.enrollment_id is null then
    select e.id into new.enrollment_id from public.enrollments e
    where e.student_id = new.student_id and e.status = 'active'
      and e.starts_on <= v_day and (e.ends_on is null or e.ends_on >= v_day)
    order by (e.course_id is not distinct from new.course_id) desc, e.starts_on
    limit 1;
  end if;

  if new.enrollment_id is not null then
    select student_id into v_enrollment_student from public.enrollments where id = new.enrollment_id;
    if v_enrollment_student is distinct from new.student_id then
      raise exception 'That package belongs to a different student' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status
     or new.cancel_requested_by is distinct from old.cancel_requested_by
     or current_setting('app.usage_recount', true) = 'on' then
    if new.status = 'cancelled' then
      new.late_cancel := new.cancel_requested_by = 'student'
        and now() > new.starts_at - public.setting_num('late_cancel_hours', 24) * interval '1 hour';
    else
      new.cancel_requested_by := null;
      new.late_cancel := false;
    end if;
    -- An absence with notice counts like a cancellation in good time: no class used, no pay.
    new.counts_as_used := new.status = 'completed'
      or (new.status = 'student_absent'
          and not coalesce((select a.with_notice from public.attendance a where a.session_id = new.id), false))
      or (new.status = 'cancelled' and new.late_cancel);
  elsif new.counts_as_used is distinct from old.counts_as_used then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'session.usage_override', 'class_sessions', new.id::text,
            jsonb_build_object('counts_as_used', old.counts_as_used), jsonb_build_object('counts_as_used', new.counts_as_used));
  end if;
  return new;
end $$;

create or replace function public.recount_absence_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.mark = 'absent' and new.with_notice is distinct from old.with_notice then
    perform set_config('app.usage_recount', 'on', true);
    update public.class_sessions set status = status where id = new.session_id;
    perform set_config('app.usage_recount', 'off', true);
  end if;
  return null;
end $$;
create trigger attendance_recount_usage after update of with_notice on public.attendance
  for each row execute function public.recount_absence_usage();

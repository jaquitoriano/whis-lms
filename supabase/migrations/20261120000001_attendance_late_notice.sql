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

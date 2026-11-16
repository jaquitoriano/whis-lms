-- Change request (Nov 2026, question 1): teachers no longer see how many classes a student has
-- left in their package. Instead each of the student's teachers is alerted when it runs low.
-- The school office sets "low" in Website settings (default 2).

insert into public.settings (key, value) values ('low_classes_alert_at', '2'::jsonb)
on conflict (key) do nothing;

-- The count is for the student and the school office only now (was also the student's teachers).
create or replace function public.classes_left(p_student uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() or p_student = (select auth.uid()) then (
    select sum(e.classes_total - (select count(*) from public.class_sessions s where s.enrollment_id = e.id and s.counts_as_used))::int
    from public.enrollments e where e.student_id = p_student and e.status = 'active'
  ) end;
$$;

-- When a class is used up and the student's active packages are at or below the alert level,
-- tell each of the student's current teachers: once per level (2, 1, 0 left) and package.
create or replace function public.notify_low_classes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_left int;
  v_at int := public.setting_num('low_classes_alert_at', 2)::int;
  v_pkg text;
  v_name text;
  t record;
begin
  if not new.counts_as_used then return new; end if;
  if old.counts_as_used and old.enrollment_id is not distinct from new.enrollment_id then return new; end if;

  select sum(e.classes_total - (select count(*) from public.class_sessions s where s.enrollment_id = e.id and s.counts_as_used))::int,
         max(e.id::text)
    into v_left, v_pkg
    from public.enrollments e where e.student_id = new.student_id and e.status = 'active';
  if v_left is null or v_left > v_at then return new; end if;

  select coalesce(nullif(full_name, ''), 'A student') into v_name from public.profiles where id = new.student_id;
  for t in select teacher_id from public.teacher_students where student_id = new.student_id and active loop
    perform public.notify(
      t.teacher_id, 'classes_low',
      case when v_left <= 0 then v_name || ' has no classes left' else v_name || ' is running low on classes' end,
      case when v_left <= 0 then 'Their package is used up. The school office will arrange the next one.'
           else v_name || ' has ' || v_left || ' class' || case when v_left = 1 then '' else 'es' end || ' left in their package.' end,
      '/teacher/students/' || new.student_id,
      'classes-low:' || new.student_id || ':' || v_pkg || ':' || greatest(v_left, 0));
  end loop;
  return new;
end $$;
create trigger class_sessions_low_classes after update of status, counts_as_used, enrollment_id on public.class_sessions
  for each row execute function public.notify_low_classes();

-- Supabase's admin createUser() inserts the auth user first and sets app_metadata
-- (where the role lives) in a follow-up update. The insert trigger therefore sees no
-- role and defaults to 'student'. This trigger applies the role once it arrives.
--
-- Safety: it only acts on accounts that have never signed in, so a later change to
-- app_metadata can never silently convert an existing student or teacher.

create or replace function public.sync_role_from_app_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new public.user_role := nullif(new.raw_app_meta_data->>'role', '')::public.user_role;
  v_current public.user_role;
begin
  if v_new is null or new.last_sign_in_at is not null then
    return new;
  end if;

  select role into v_current from public.profiles where id = new.id;
  if v_current is null or v_current = v_new then
    return new;
  end if;

  update public.profiles set role = v_new where id = new.id;

  delete from public.student_profiles where user_id = new.id and v_new <> 'student';
  delete from public.teacher_profiles where user_id = new.id and v_new <> 'teacher';
  delete from public.teacher_admin_notes where user_id = new.id and v_new <> 'teacher';

  if v_new = 'teacher' then
    insert into public.teacher_profiles (user_id) values (new.id) on conflict do nothing;
    insert into public.teacher_admin_notes (user_id) values (new.id) on conflict do nothing;
  elsif v_new = 'student' then
    insert into public.student_profiles (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_app_metadata_updated
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data->>'role' is distinct from new.raw_app_meta_data->>'role')
  execute function public.sync_role_from_app_metadata();

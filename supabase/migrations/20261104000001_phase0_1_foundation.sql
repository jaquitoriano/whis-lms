-- Phase 0 + Phase 1: accounts, roles, profiles, teacher-student assignment, courses,
-- public inquiries, settings, audit log, and row-level security.
-- Requirement IDs refer to the client brief (see docs/requirements in the planning skill).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'teacher', 'student');
create type public.account_status as enum ('active', 'inactive', 'on_hold');           -- STU-04
create type public.course_type as enum ('general_english', 'ielts', 'business_english', 'other');
create type public.inquiry_status as enum ('new', 'contacted', 'closed');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per auth user. Holds only fields that are safe to show to people
-- who are allowed to see this person at all. Contact details live in
-- profile_contacts so they can have stricter rules (TCH-12).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'student',
  status      public.account_status not null default 'active',
  full_name   text not null default '',
  avatar_url  text,
  timezone    text not null default 'Asia/Manila',   -- IANA name; times are stored in UTC
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);

create table public.profile_contacts (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  email       text not null,
  phone       text,
  updated_at  timestamptz not null default now()
);

create table public.courses (                                                          -- ADM-20
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  type                 public.course_type not null default 'general_english',
  description          text not null default '',
  default_duration_min int not null default 50 check (default_duration_min between 15 and 240),
  active               boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.teacher_profiles (                                                 -- TCH-01..03
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  bio              text not null default '',
  education        text not null default '',
  qualifications   text not null default '',
  experience_years int check (experience_years between 0 and 60),
  specializations  text[] not null default '{}',
  show_on_website  boolean not null default false,                                     -- HOME-08
  updated_at       timestamptz not null default now()
);

-- Admin-only notes about a teacher (TCH-11). Separate table because RLS filters rows, not columns.
create table public.teacher_admin_notes (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

create table public.student_profiles (                                                 -- STU-01..04
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  birthday           date,
  is_minor           boolean not null default false,
  class_level        text not null default '',
  enrollment_date    date not null default current_date,
  course_id          uuid references public.courses(id) on delete set null,
  updated_at         timestamptz not null default now()
);

create table public.guardians (                                                        -- STU-06
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references public.profiles(id) on delete cascade,
  full_name               text not null,
  relationship            text not null default '',
  email                   text,
  phone                   text,
  receives_notifications  boolean not null default true,
  created_at              timestamptz not null default now()
);
create index guardians_student_idx on public.guardians(student_id);

-- The access-control backbone: a teacher sees a student only while an active row exists.  ADM-02
create table public.teacher_students (
  teacher_id   uuid not null references public.profiles(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  active       boolean not null default true,
  assigned_at  timestamptz not null default now(),
  ended_at     timestamptz,
  primary key (teacher_id, student_id)
);
create index teacher_students_student_idx on public.teacher_students(student_id) where active;

create table public.settings (                                                         -- TCH-12 etc.
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table public.inquiries (                                                        -- HOME-11
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (length(full_name) between 1 and 200),
  email          text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text check (phone is null or length(phone) <= 50),
  course_type    public.course_type,
  message        text check (message is null or length(message) <= 4000),
  wants_trial    boolean not null default true,
  status         public.inquiry_status not null default 'new',
  created_at     timestamptz not null default now()
);

create table public.audit_log (                                                        -- NFR-27
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity, entity_id);

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger contacts_touch before update on public.profile_contacts for each row execute function public.touch_updated_at();
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create trigger teacher_profiles_touch before update on public.teacher_profiles for each row execute function public.touch_updated_at();
create trigger teacher_admin_notes_touch before update on public.teacher_admin_notes for each row execute function public.touch_updated_at();
create trigger student_profiles_touch before update on public.student_profiles for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.my_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;

-- Does the current user (a teacher) currently teach this student?
create or replace function public.teaches(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_students
    where teacher_id = (select auth.uid()) and student_id = p_student and active
  );
$$;

-- Is this teacher currently assigned to the current user (a student)?
create or replace function public.is_my_teacher(p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_students
    where student_id = (select auth.uid()) and teacher_id = p_teacher and active
  );
$$;

create or replace function public.setting_bool(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value)::text = 'true' from public.settings where key = p_key), false);
$$;

-- Teachers listed on the public website.
create or replace function public.is_public_teacher(p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_profiles t
    join public.profiles p on p.id = t.user_id
    where t.user_id = p_teacher and t.show_on_website and p.role = 'teacher' and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile rows. Role comes from app_metadata, which only the
-- service role (admin server action) can set, never from user-editable metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := coalesce(nullif(new.raw_app_meta_data->>'role', '')::public.user_role, 'student');
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, coalesce(new.raw_user_meta_data->>'full_name', ''));

  insert into public.profile_contacts (user_id, email) values (new.id, coalesce(new.email, ''));

  if v_role = 'teacher' then
    insert into public.teacher_profiles (user_id) values (new.id);
    insert into public.teacher_admin_notes (user_id) values (new.id);
  elsif v_role = 'student' then
    insert into public.student_profiles (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins (or the service role, where auth.uid() is null) may change role or status.
create or replace function public.guard_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Only an administrator can change role or account status';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileged_fields();

-- Students can edit their phone, but email changes go through auth (admin).
create or replace function public.guard_contact_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Email can only be changed by an administrator';
  end if;
  return new;
end $$;

create trigger contacts_guard before update on public.profile_contacts
  for each row execute function public.guard_contact_email();

-- ---------------------------------------------------------------------------
-- Audit log triggers
-- ---------------------------------------------------------------------------
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'profile.privileged_update', 'profiles', new.id::text,
            jsonb_build_object('role', old.role, 'status', old.status),
            jsonb_build_object('role', new.role, 'status', new.status));
  end if;
  return new;
end $$;

create trigger profiles_audit after update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_assignment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values ((select auth.uid()), 'assignment.' || lower(tg_op), 'teacher_students',
          coalesce(new.teacher_id, old.teacher_id)::text || ':' || coalesce(new.student_id, old.student_id)::text,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger teacher_students_audit after insert or update or delete on public.teacher_students
  for each row execute function public.audit_assignment_change();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.profile_contacts    enable row level security;
alter table public.courses             enable row level security;
alter table public.teacher_profiles    enable row level security;
alter table public.teacher_admin_notes enable row level security;
alter table public.student_profiles    enable row level security;
alter table public.guardians           enable row level security;
alter table public.teacher_students    enable row level security;
alter table public.settings            enable row level security;
alter table public.inquiries           enable row level security;
alter table public.audit_log           enable row level security;

-- profiles: self, admin, a teacher's assigned students, a student's own teachers,
-- and teachers shown on the public website (name + avatar only live here).
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_admin()
  or public.teaches(id)
  or public.is_my_teacher(id)
  or public.is_public_teacher(id)
);
create policy profiles_select_public on public.profiles for select to anon using (
  public.is_public_teacher(id)
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profile_contacts: stricter. Students see their teacher's contact only if the admin allows it (TCH-12).
create policy contacts_select on public.profile_contacts for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_admin()
  or public.teaches(user_id)
  or (public.is_my_teacher(user_id) and public.setting_bool('students_can_view_teacher_contact'))
);
create policy contacts_update_self on public.profile_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contacts_admin_all on public.profile_contacts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- courses: anyone can read active courses (public site); admins manage.
create policy courses_select_active on public.courses for select to anon, authenticated using (active or public.is_admin());
create policy courses_admin_all on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- teacher_profiles: public ones for the website; own; admin; a student's own teacher.
create policy teacher_profiles_select on public.teacher_profiles for select to anon, authenticated using (
  public.is_public_teacher(user_id)
  or user_id = (select auth.uid())
  or public.is_admin()
  or public.is_my_teacher(user_id)
);
create policy teacher_profiles_update_self on public.teacher_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy teacher_profiles_admin_all on public.teacher_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy teacher_admin_notes_admin on public.teacher_admin_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- student_profiles: own, admin, assigned teacher. Only admins edit (enrollment data).
create policy student_profiles_select on public.student_profiles for select to authenticated using (
  user_id = (select auth.uid()) or public.is_admin() or public.teaches(user_id)
);
create policy student_profiles_admin_all on public.student_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy guardians_select on public.guardians for select to authenticated using (
  student_id = (select auth.uid()) or public.is_admin() or public.teaches(student_id)
);
create policy guardians_admin_all on public.guardians for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy teacher_students_select on public.teacher_students for select to authenticated using (
  teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or public.is_admin()
);
create policy teacher_students_admin_all on public.teacher_students for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy settings_admin_all on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- inquiries: the public trial-class form can insert but never read.
create policy inquiries_insert_public on public.inquiries for insert to anon, authenticated
  with check (status = 'new');
create policy inquiries_admin_all on public.inquiries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy audit_log_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Defaults
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('students_can_view_teacher_contact', 'false'::jsonb)
on conflict (key) do nothing;

-- Avatars: public-read bucket (profile pictures only), each user writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

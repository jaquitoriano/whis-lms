-- Phase 5: class packages and enrollments (ADM-21), attendance (ATT-01..02), enrollment
-- contracts with e-signing (CON-01..03), invoices, payments, statements and receipts
-- (PAY-01..04), and teacher compensation (PAY-08, admin only).
--
-- Owner decisions (Nov 2026):
--   OD-03  Payments are recorded by the admin. No online payment gateway.
--   OD-04  A cancellation the student asked for, less than `late_cancel_hours` before the class,
--          uses up a class. Completed classes and student no-shows always do. Teacher absences,
--          reschedules and other cancellations don't. Admins can override any single class.
--   PAY-08 Teachers are paid per class or per hour for every class that used up a student's class.
--   CON-02 Adult students sign in their portal. A minor's guardian signs by a one-time email link.
--
-- Money is numeric(12,2) in one currency per document. Invoices, payments and signed contracts
-- are never deleted: they are voided, so the financial and legal history stays complete.

-- ---------------------------------------------------------------------------
-- Settings and small helpers
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('late_cancel_hours', '24'::jsonb),
  ('currency', '"PHP"'::jsonb),
  ('school_timezone', '"Asia/Manila"'::jsonb),
  ('invoice_due_days', '7'::jsonb)
on conflict (key) do nothing;

create or replace function public.setting_text(p_key text, p_default text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
$$;

-- Month boundaries, document years and "today" follow the school's time zone, not UTC.
create or replace function public.school_tz()
returns text language sql stable security definer set search_path = '' as $$
  select public.setting_text('school_timezone', 'Asia/Manila');
$$;

create or replace function public.school_today()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone public.school_tz())::date;
$$;

-- The few billing settings every portal needs to display (not the whole settings table).
create or replace function public.billing_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'currency', public.setting_text('currency', 'PHP'),
    'late_cancel_hours', public.setting_num('late_cancel_hours', 24),
    'school_timezone', public.school_tz(),
    'invoice_due_days', public.setting_num('invoice_due_days', 7));
$$;

-- Human-readable document numbers: INV-2026-00001, OR-2026-00001, CT-2026-0001. Assigned by the
-- insert triggers (security definer), so nobody can pick a number or use one up by calling this.
create sequence public.invoice_number_seq;
create sequence public.receipt_number_seq;
create sequence public.contract_number_seq;

create or replace function public.next_doc_number(p_prefix text, p_seq regclass, p_width int default 5)
returns text language sql volatile security definer set search_path = '' as $$
  select p_prefix || '-' || to_char(public.school_today(), 'YYYY') || '-' || lpad(nextval(p_seq)::text, p_width, '0');
$$;

create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and status <> 'inactive' loop
    perform public.notify(r.id, p_type, p_title, p_body, p_link, p_dedupe);
  end loop;
end $$;
revoke execute on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.next_doc_number(text, regclass, int) from public, anon, authenticated;

create or replace function public.fmt_money(p_amount numeric, p_currency text)
returns text language sql stable set search_path = '' as $$
  select p_currency || ' ' || to_char(p_amount, 'FM999,999,999,990.00');
$$;

-- ---------------------------------------------------------------------------
-- Class packages (ADM-21) and enrollments
-- ---------------------------------------------------------------------------
create table public.class_packages (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid references public.courses(id) on delete set null,
  name           text not null check (length(name) between 1 and 200),
  classes_count  int not null check (classes_count between 1 and 500),
  class_minutes  int not null default 50 check (class_minutes between 15 and 240),
  price          numeric(12,2) not null check (price >= 0),
  currency       text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  validity_days  int check (validity_days between 1 and 1500),
  description    text not null default '',
  active         boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger class_packages_touch before update on public.class_packages for each row execute function public.touch_updated_at();

create type public.enrollment_status as enum ('active', 'completed', 'cancelled');

-- One row per package a student buys. Package terms are copied in, so later price changes
-- never alter what a student already signed up for.
create table public.enrollments (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles(id) on delete restrict,
  course_id          uuid references public.courses(id) on delete set null,
  package_id         uuid references public.class_packages(id) on delete set null,
  package_name       text not null check (length(package_name) between 1 and 200),
  classes_total      int not null check (classes_total between 1 and 1000),
  class_minutes      int not null default 50 check (class_minutes between 15 and 240),
  classes_per_week   int check (classes_per_week between 1 and 14),
  price              numeric(12,2) not null check (price >= 0),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  starts_on          date not null default public.school_today(),
  ends_on            date,
  status             public.enrollment_status not null default 'active',
  notes              text not null default '',
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index enrollments_student_idx on public.enrollments(student_id, status);
create trigger enrollments_touch before update on public.enrollments for each row execute function public.touch_updated_at();

create or replace function public.check_enrollment_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'Enrollments are for student accounts only';
  end if;
  return new;
end $$;
create trigger enrollments_student_check before insert or update of student_id on public.enrollments
  for each row execute function public.check_enrollment_student();

-- ---------------------------------------------------------------------------
-- Class sessions: which package a class belongs to, and whether it used up a class (OD-04)
-- ---------------------------------------------------------------------------
create type public.cancel_party as enum ('student', 'teacher', 'school');

alter table public.class_sessions
  add column enrollment_id        uuid references public.enrollments(id) on delete set null,
  add column cancel_requested_by  public.cancel_party,
  add column late_cancel          boolean not null default false,
  add column counts_as_used       boolean not null default false;
create index class_sessions_enrollment_idx on public.class_sessions(enrollment_id) where enrollment_id is not null;
create index class_sessions_used_idx on public.class_sessions(teacher_id, starts_at) where counts_as_used;

-- Existing classes: completed classes and no-shows used up a class. Cancellations before
-- Phase 5 have no "who asked", so they don't count.
update public.class_sessions set counts_as_used = status in ('completed', 'student_absent');

-- Runs after class_sessions_guard (triggers fire in name order).
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
     or new.cancel_requested_by is distinct from old.cancel_requested_by then
    if new.status = 'cancelled' then
      new.late_cancel := new.cancel_requested_by = 'student'
        and now() > new.starts_at - public.setting_num('late_cancel_hours', 24) * interval '1 hour';
    else
      new.cancel_requested_by := null;
      new.late_cancel := false;
    end if;
    new.counts_as_used := new.status in ('completed', 'student_absent') or (new.status = 'cancelled' and new.late_cancel);
  elsif new.counts_as_used is distinct from old.counts_as_used then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'session.usage_override', 'class_sessions', new.id::text,
            jsonb_build_object('counts_as_used', old.counts_as_used), jsonb_build_object('counts_as_used', new.counts_as_used));
  end if;
  return new;
end $$;

create trigger class_sessions_usage before insert or update on public.class_sessions
  for each row execute function public.apply_session_usage();

-- Classes used and left per enrollment. security_invoker: the reader's own access rules apply.
create view public.enrollment_usage with (security_invoker = true) as
select e.id as enrollment_id,
       e.student_id,
       e.classes_total,
       (count(s.id) filter (where s.counts_as_used))::int as used,
       (count(s.id) filter (where s.status = 'scheduled'))::int as booked,
       (e.classes_total - count(s.id) filter (where s.counts_as_used))::int as remaining
from public.enrollments e
left join public.class_sessions s on s.enrollment_id = e.id
group by e.id;

-- Teachers see only how many classes their student has left, never prices.
create or replace function public.classes_left(p_student uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() or public.teaches(p_student) or p_student = (select auth.uid()) then (
    select sum(e.classes_total - (select count(*) from public.class_sessions s where s.enrollment_id = e.id and s.counts_as_used))::int
    from public.enrollments e where e.student_id = p_student and e.status = 'active'
  ) end;
$$;

-- ---------------------------------------------------------------------------
-- Attendance (ATT-01..02). Separate from class status: the class status says what happened to
-- the class, attendance says what happened to the student. A default mark follows every status
-- change; the teacher can then change Present to Late.
-- ---------------------------------------------------------------------------
create type public.attendance_mark as enum ('present', 'absent', 'late', 'cancelled', 'rescheduled');

create table public.attendance (
  session_id    uuid primary key references public.class_sessions(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  mark          public.attendance_mark not null,
  minutes_late  int check (minutes_late between 1 and 240),
  note          text not null default '' check (length(note) <= 1000),
  marked_by     uuid references public.profiles(id),
  marked_at     timestamptz not null default now(),
  check ((mark = 'late') = (minutes_late is not null))
);
create index attendance_student_idx on public.attendance(student_id);

create or replace function public.check_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.class_sessions; v_ok boolean;
begin
  select * into s from public.class_sessions where id = new.session_id;
  if not found then raise exception 'Class not found'; end if;
  new.student_id := s.student_id;
  v_ok := case s.status
      when 'completed' then new.mark in ('present', 'late')
      when 'student_absent' then new.mark = 'absent'
      when 'cancelled' then new.mark = 'cancelled'
      when 'rescheduled' then new.mark = 'rescheduled'
      else false end;
  if not v_ok then
    raise exception 'That attendance mark does not match the class status (%)', s.status using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id then raise exception 'Attendance cannot move to another class'; end if;
    new.marked_by := coalesce((select auth.uid()), new.marked_by);
    new.marked_at := now();
  end if;
  return new;
end $$;
create trigger attendance_check before insert or update on public.attendance
  for each row execute function public.check_attendance();

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
    on conflict (session_id) do update set mark = excluded.mark, minutes_late = null, marked_by = excluded.marked_by, marked_at = now();
  end if;
  return null;
end $$;

insert into public.attendance (session_id, student_id, mark)
select id, student_id, case status
  when 'completed' then 'present' when 'student_absent' then 'absent'
  when 'cancelled' then 'cancelled' else 'rescheduled' end::public.attendance_mark
from public.class_sessions where status in ('completed', 'student_absent', 'cancelled', 'rescheduled');

create trigger sessions_sync_attendance after insert or update of status on public.class_sessions
  for each row execute function public.sync_attendance();

-- Reschedule now keeps the package (the new class is inserted by the same function as before).
-- No change needed: apply_session_usage copies enrollment_id from rescheduled_from_id.

-- ---------------------------------------------------------------------------
-- Contracts (CON-01..03)
-- ---------------------------------------------------------------------------
create type public.contract_status as enum ('draft', 'sent', 'signed', 'expired', 'void');
create type public.signer_kind as enum ('self', 'guardian');

-- Versioned like class policies: a template is never edited, a new version is added.
create table public.contract_templates (
  version     int primary key check (version > 0),
  title       text not null check (length(title) between 1 and 200),
  body        text not null check (length(body) between 1 and 50000),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create or replace function public.guard_template_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Contract templates cannot be changed. Add a new version instead.';
end $$;
create trigger contract_templates_immutable before update or delete on public.contract_templates
  for each row execute function public.guard_template_change();

create table public.contracts (
  id                uuid primary key default gen_random_uuid(),
  contract_number   text not null unique,   -- CT-2026-0001, set by contracts_guard
  student_id        uuid not null references public.profiles(id) on delete restrict,
  enrollment_id     uuid references public.enrollments(id) on delete set null,
  template_version  int references public.contract_templates(version),
  title             text not null check (length(title) between 1 and 200),
  body              text not null check (length(body) between 1 and 60000),  -- merged text, frozen once sent
  tuition           numeric(12,2) check (tuition >= 0),
  currency          text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  payment_terms     text not null default '' check (length(payment_terms) <= 2000),
  valid_from        date not null,
  valid_to          date,
  signer_kind       public.signer_kind not null default 'self',
  guardian_id       uuid references public.guardians(id) on delete set null,
  signer_name       text not null default '' check (length(signer_name) <= 200),
  signer_email      text check (signer_email is null or signer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status            public.contract_status not null default 'draft',
  document_hash     text,
  sent_at           timestamptz,
  signed_at         timestamptz,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index contracts_student_idx on public.contracts(student_id, created_at desc);
create trigger contracts_touch before update on public.contracts for each row execute function public.touch_updated_at();

-- SHA-256 of exactly what the signer saw. Stored when sent, checked again at signing (CON-03).
create or replace function public.contract_document_hash(p_number text, p_title text, p_body text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(p_number || E'\n' || p_title || E'\n' || p_body, 'UTF8')), 'hex');
$$;

create table public.contract_signatures (
  id                   uuid primary key default gen_random_uuid(),
  contract_id          uuid not null unique references public.contracts(id) on delete restrict,
  signer_name          text not null check (length(signer_name) between 2 and 200),
  signer_relationship  public.signer_kind not null,
  guardian_id          uuid references public.guardians(id) on delete set null,
  signed_by_user       uuid references public.profiles(id),
  consent              boolean not null check (consent),
  signed_at            timestamptz not null default now(),
  ip                   text,
  user_agent           text,
  document_hash        text not null
);

create or replace function public.guard_signature_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Signatures cannot be changed or removed';
end $$;
create trigger contract_signatures_immutable before update or delete on public.contract_signatures
  for each row execute function public.guard_signature_change();

-- One-time guardian signing links. Only the server (service role) reads this table: no policies.
create table public.contract_sign_tokens (
  contract_id  uuid primary key references public.contracts(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create or replace function public.guard_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only draft contracts can be deleted. Void it instead.'; end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'New contracts start as drafts'; end if;
    new.contract_number := public.next_doc_number('CT', 'public.contract_number_seq', 4);
    new.document_hash := null; new.sent_at := null; new.signed_at := null; new.voided_at := null;
  else
    -- Stamps are set only by the status changes below, never typed in.
    new.contract_number := old.contract_number;
    new.document_hash := old.document_hash; new.sent_at := old.sent_at;
    new.signed_at := old.signed_at; new.voided_at := old.voided_at;
    -- After sending, the document and its terms are frozen (CON-03). Changes need a new contract.
    if old.status <> 'draft' and (
         new.student_id, new.enrollment_id, new.template_version, new.title, new.body, new.tuition, new.currency,
         new.payment_terms, new.valid_from, new.valid_to, new.signer_kind, new.guardian_id, new.signer_name,
         new.signer_email, new.contract_number
       ) is distinct from (
         old.student_id, old.enrollment_id, old.template_version, old.title, old.body, old.tuition, old.currency,
         old.payment_terms, old.valid_from, old.valid_to, old.signer_kind, old.guardian_id, old.signer_name,
         old.signer_email, old.contract_number
       ) then
      raise exception 'A sent contract cannot be edited. Void it and create a new one.';
    end if;

    if new.status is distinct from old.status then
      if not (
           (old.status = 'draft' and new.status in ('sent', 'void'))
        or (old.status = 'sent' and new.status in ('signed', 'void', 'expired'))
        or (old.status = 'signed' and new.status in ('void', 'expired'))
      ) then
        raise exception 'A contract cannot go from % to %', old.status, new.status;
      end if;
      if new.status = 'sent' then
        if new.signer_kind = 'guardian' and (new.guardian_id is null or new.signer_email is null) then
          raise exception 'Choose the guardian who will sign, with an email address';
        end if;
        if length(trim(new.signer_name)) < 2 then raise exception 'Enter the name of the person who will sign'; end if;
        new.sent_at := now();
        new.document_hash := public.contract_document_hash(new.contract_number, new.title, new.body);
      elsif new.status = 'signed' then
        -- Only the signing function creates signatures, so this can't be faked by an update.
        if not exists (select 1 from public.contract_signatures where contract_id = new.id) then
          raise exception 'A contract is marked signed only when it is signed';
        end if;
        new.signed_at := (select signed_at from public.contract_signatures where contract_id = new.id);
      elsif new.status = 'void' then
        if coalesce(trim(new.void_reason), '') = '' then raise exception 'Give a reason for voiding the contract'; end if;
        new.voided_at := now();
      end if;
      insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
      values ((select auth.uid()), 'contract.' || new.status, 'contracts', new.id::text,
              jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'number', new.contract_number, 'reason', new.void_reason));
    end if;
  end if;

  if new.signer_kind = 'guardian' and new.guardian_id is not null and not exists (
       select 1 from public.guardians where id = new.guardian_id and student_id = new.student_id) then
    raise exception 'That guardian belongs to a different student';
  end if;
  return new;
end $$;
create trigger contracts_guard before insert or update or delete on public.contracts
  for each row execute function public.guard_contract();

-- Called by the server only, after it has checked who is signing (portal login or email link).
create or replace function public.record_contract_signature(
  p_contract uuid, p_user uuid, p_signer_name text, p_relationship public.signer_kind, p_ip text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_id uuid;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'Contract not found'; end if;
  if c.status <> 'sent' then raise exception 'This contract is not waiting for a signature'; end if;
  if c.valid_to is not null and c.valid_to < public.school_today() then raise exception 'This contract has expired'; end if;
  if c.document_hash is distinct from public.contract_document_hash(c.contract_number, c.title, c.body) then
    raise exception 'The contract changed after it was sent and cannot be signed';
  end if;
  if p_relationship <> c.signer_kind then raise exception 'This contract must be signed by the %', case c.signer_kind when 'self' then 'student' else 'guardian' end; end if;
  if c.signer_kind = 'self' and p_user is distinct from c.student_id then raise exception 'Only the student can sign this contract'; end if;
  if length(trim(coalesce(p_signer_name, ''))) < 2 then raise exception 'Type your full name to sign'; end if;

  insert into public.contract_signatures (contract_id, signer_name, signer_relationship, guardian_id, signed_by_user, consent, ip, user_agent, document_hash)
  values (c.id, trim(p_signer_name), p_relationship, c.guardian_id, p_user, true, left(p_ip, 100), left(p_user_agent, 500), c.document_hash)
  returning id into v_id;
  update public.contracts set status = 'signed' where id = c.id;
  delete from public.contract_sign_tokens where contract_id = c.id;
  return v_id;
end $$;
revoke execute on function public.record_contract_signature(uuid, uuid, text, public.signer_kind, text, text) from public, anon, authenticated;

create or replace function public.notify_contract_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_student text := (select full_name from public.profiles where id = new.student_id);
begin
  if new.status = 'sent' then
    if new.signer_kind = 'self' then
      perform public.notify(new.student_id, 'contract_sent', 'Please sign your enrollment agreement',
        new.title || ' is ready for you to read and sign.', '/student/contract', 'contract_sent:' || new.id);
    else
      perform public.notify(new.student_id, 'contract_sent', 'Enrollment agreement sent to ' || new.signer_name,
        new.title || ' was emailed to ' || new.signer_name || ' to sign.', '/student/contract', 'contract_sent:' || new.id);
    end if;
  elsif new.status = 'signed' then
    perform public.notify(new.student_id, 'contract_signed', 'Enrollment agreement signed',
      new.title || ' was signed by ' || new.signer_name || '. You can download a copy.', '/student/contract', 'contract_signed:' || new.id);
    perform public.notify_admins('contract_signed', 'Contract signed: ' || v_student,
      new.contract_number || ' was signed by ' || new.signer_name || '.', '/admin/contracts/' || new.id, 'contract_signed:' || new.id);
  end if;
  return null;
end $$;
create trigger contracts_notify after update of status on public.contracts
  for each row execute function public.notify_contract_status();

-- ---------------------------------------------------------------------------
-- Invoices and payments (PAY-01..04)
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('unpaid', 'partially_paid', 'paid', 'void');
create type public.payment_method as enum ('cash', 'bank_transfer', 'gcash', 'maya', 'card', 'paypal', 'other');

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,   -- INV-2026-00001, set by invoices_guard
  student_id      uuid not null references public.profiles(id) on delete restrict,
  enrollment_id   uuid references public.enrollments(id) on delete set null,
  issue_date      date not null default public.school_today(),
  due_date        date not null,
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  total           numeric(12,2) not null default 0,   -- kept equal to the sum of the items
  amount_paid     numeric(12,2) not null default 0,   -- kept equal to the sum of payments not voided
  status          public.invoice_status not null default 'unpaid',
  notes           text not null default '' check (length(notes) <= 2000),
  voided_at       timestamptz,
  void_reason     text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (due_date >= issue_date)
);
create index invoices_student_idx on public.invoices(student_id, issue_date desc);
create index invoices_open_idx on public.invoices(due_date) where status in ('unpaid', 'partially_paid');
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete restrict,
  position     int not null default 0,
  description  text not null check (length(description) between 1 and 300),
  quantity     numeric(10,2) not null default 1 check (quantity > 0),
  unit_price   numeric(12,2) not null,   -- negative for a discount line
  amount       numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id, position);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  receipt_number  text not null unique,   -- OR-2026-00001, set by payments_guard
  invoice_id      uuid not null references public.invoices(id) on delete restrict,
  student_id      uuid not null references public.profiles(id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  method          public.payment_method not null,
  reference       text not null default '' check (length(reference) <= 200),
  paid_on         date not null default public.school_today(),
  note            text not null default '' check (length(note) <= 1000),
  recorded_by     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references public.profiles(id),
  void_reason     text
);
create index payments_invoice_idx on public.payments(invoice_id);
create index payments_student_idx on public.payments(student_id, paid_on desc);

-- Totals and status are always recomputed from the items and payments, so they can't drift
-- or be typed in by hand.
create or replace function public.guard_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Invoices cannot be deleted. Void it instead.'; end if;
  if tg_op = 'INSERT' then
    new.invoice_number := public.next_doc_number('INV', 'public.invoice_number_seq');
    new.total := 0; new.amount_paid := 0; new.status := 'unpaid'; new.voided_at := null;
    if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
      raise exception 'Invoices are for student accounts only';
    end if;
    return new;
  end if;

  if old.status = 'void' then raise exception 'A void invoice cannot be changed'; end if;
  if new.student_id <> old.student_id or new.currency <> old.currency or new.invoice_number <> old.invoice_number then
    raise exception 'The student, currency and number of an invoice cannot change';
  end if;
  new.total := coalesce((select sum(amount) from public.invoice_items where invoice_id = new.id), 0);
  new.amount_paid := coalesce((select sum(amount) from public.payments where invoice_id = new.id and voided_at is null), 0);
  if new.total < 0 then raise exception 'The invoice total cannot be negative'; end if;
  if new.status = 'void' then
    if new.amount_paid > 0 then raise exception 'Void the payments on this invoice first'; end if;
    if coalesce(trim(new.void_reason), '') = '' then raise exception 'Give a reason for voiding the invoice'; end if;
    new.voided_at := now();
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'invoice.void', 'invoices', new.id::text,
            jsonb_build_object('status', old.status, 'total', old.total), jsonb_build_object('reason', new.void_reason));
  else
    new.status := case when new.amount_paid >= new.total then 'paid'
                       when new.amount_paid > 0 then 'partially_paid'
                       else 'unpaid' end;
  end if;
  return new;
end $$;
create trigger invoices_guard before insert or update or delete on public.invoices
  for each row execute function public.guard_invoice();

create or replace function public.guard_invoice_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if i.status = 'void' then raise exception 'A void invoice cannot be changed'; end if;
  if i.amount_paid > 0 then raise exception 'Items cannot change after a payment is recorded. Void the payment first.'; end if;
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then raise exception 'Items cannot move to another invoice'; end if;
  return coalesce(new, old);
end $$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function public.guard_invoice_item();

create or replace function public.refresh_invoice_from_child()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices set updated_at = now() where id = coalesce(new.invoice_id, old.invoice_id);
  return null;
end $$;
create trigger invoice_items_refresh after insert or update or delete on public.invoice_items
  for each row execute function public.refresh_invoice_from_child();

create or replace function public.guard_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  if tg_op = 'DELETE' then raise exception 'Payments cannot be deleted. Void it instead.'; end if;
  if tg_op = 'INSERT' then
    select * into i from public.invoices where id = new.invoice_id for update;
    if not found then raise exception 'Invoice not found'; end if;
    if i.status = 'void' then raise exception 'This invoice is void'; end if;
    if new.amount > i.total - i.amount_paid then
      raise exception 'The payment is more than the balance due (%)', public.fmt_money(i.total - i.amount_paid, i.currency) using errcode = 'P0001';
    end if;
    new.student_id := i.student_id;
    new.receipt_number := public.next_doc_number('OR', 'public.receipt_number_seq');
    new.recorded_by := coalesce((select auth.uid()), new.recorded_by);
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
    return new;
  end if;
  -- A recorded payment is final. It can only be voided once, with a reason.
  if old.voided_at is not null then raise exception 'This payment is already void'; end if;
  if (new.invoice_id, new.student_id, new.amount, new.method, new.reference, new.paid_on, new.receipt_number, new.recorded_by, new.created_at)
     is distinct from (old.invoice_id, old.student_id, old.amount, old.method, old.reference, old.paid_on, old.receipt_number, old.recorded_by, old.created_at) then
    raise exception 'A recorded payment cannot be edited. Void it and record it again.';
  end if;
  if new.voided_at is not null then
    if coalesce(trim(new.void_reason), '') = '' then raise exception 'Give a reason for voiding the payment'; end if;
    new.voided_at := now();
    new.voided_by := (select auth.uid());
  end if;
  return new;
end $$;
create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function public.guard_payment();

create or replace function public.after_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  update public.invoices set updated_at = now() where id = new.invoice_id returning * into i;
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, entity, entity_id, after)
    values ((select auth.uid()), 'payment.record', 'payments', new.id::text,
            jsonb_build_object('receipt', new.receipt_number, 'invoice', i.invoice_number, 'amount', new.amount, 'method', new.method));
    perform public.notify(new.student_id, 'payment_received', 'Payment received: ' || public.fmt_money(new.amount, i.currency),
      'Thank you. Receipt ' || new.receipt_number || ' for invoice ' || i.invoice_number ||
      case when i.status = 'paid' then ' (now fully paid).' else '. Balance due: ' || public.fmt_money(i.total - i.amount_paid, i.currency) || '.' end,
      '/student/billing', 'payment:' || new.id);
  elsif new.voided_at is not null and old.voided_at is null then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'payment.void', 'payments', new.id::text,
            jsonb_build_object('receipt', new.receipt_number, 'amount', new.amount), jsonb_build_object('reason', new.void_reason));
  end if;
  return null;
end $$;
create trigger payments_after after insert or update on public.payments
  for each row execute function public.after_payment();

-- Creates an invoice and its items in one transaction (admins only, via RLS).
create or replace function public.create_invoice(
  p_student uuid, p_enrollment uuid, p_due date, p_currency text, p_notes text, p_items jsonb, p_issue date default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_pos int := 0;
begin
  if not public.is_admin() then raise exception 'Only an administrator can create invoices'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;
  insert into public.invoices (student_id, enrollment_id, issue_date, due_date, currency, notes, created_by)
  values (p_student, p_enrollment, coalesce(p_issue, public.school_today()), p_due, p_currency, coalesce(p_notes, ''), (select auth.uid()))
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (invoice_id, position, description, quantity, unit_price)
    values (v_id, v_pos, v_item->>'description', coalesce((v_item->>'quantity')::numeric, 1), (v_item->>'unit_price')::numeric);
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end $$;

-- The "new invoice" message goes out when the transaction commits, so it shows the real total.
create or replace function public.notify_invoice_issued()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = new.id;
  if i.status = 'void' then return null; end if;
  perform public.notify(i.student_id, 'invoice_issued', 'New invoice ' || i.invoice_number,
    public.fmt_money(i.total, i.currency) || ' due on ' || to_char(i.due_date, 'DD Mon YYYY') || '.', '/student/billing', 'invoice:' || i.id);
  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (i.created_by, 'invoice.create', 'invoices', i.id::text, jsonb_build_object('number', i.invoice_number, 'total', i.total));
  return null;
end $$;
create constraint trigger invoices_notify after insert on public.invoices
  deferrable initially deferred for each row execute function public.notify_invoice_issued();

-- ---------------------------------------------------------------------------
-- Teacher compensation (PAY-08). Admin only.
-- ---------------------------------------------------------------------------
create type public.pay_basis as enum ('per_class', 'per_hour');
create type public.payout_status as enum ('draft', 'approved', 'paid');

create table public.teacher_rates (
  teacher_id  uuid primary key references public.profiles(id) on delete cascade,
  basis       public.pay_basis not null default 'per_class',
  rate        numeric(12,2) not null check (rate >= 0),
  currency    text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  updated_at  timestamptz not null default now()
);
create trigger teacher_rates_touch before update on public.teacher_rates for each row execute function public.touch_updated_at();

create table public.teacher_payouts (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.profiles(id) on delete restrict,
  period_month     date not null check (extract(day from period_month) = 1),
  classes_count    int not null default 0,
  minutes          int not null default 0,
  basis            public.pay_basis not null,
  rate             numeric(12,2) not null,
  currency         text not null,
  base_amount      numeric(12,2) not null default 0,
  adjustment       numeric(12,2) not null default 0,
  adjustment_note  text not null default '' check (length(adjustment_note) <= 500),
  total            numeric(12,2) generated always as (base_amount + adjustment) stored,
  status           public.payout_status not null default 'draft',
  paid_on          date,
  reference        text not null default '' check (length(reference) <= 200),
  calculated_at    timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (teacher_id, period_month)
);
create trigger teacher_payouts_touch before update on public.teacher_payouts for each row execute function public.touch_updated_at();

create or replace function public.guard_payout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only draft payouts can be removed'; end if;
    return old;
  end if;
  if old.status = 'paid' then raise exception 'A paid payout cannot be changed'; end if;
  if old.status = 'approved' and new.status = 'approved' and (new.classes_count, new.minutes, new.rate, new.base_amount, new.adjustment)
     is distinct from (old.classes_count, old.minutes, old.rate, old.base_amount, old.adjustment) then
    raise exception 'Move the payout back to draft before changing it';
  end if;
  if new.status = 'paid' and new.paid_on is null then new.paid_on := public.school_today(); end if;
  if new.status = 'paid' and old.status = 'draft' then raise exception 'Approve the payout before marking it paid'; end if;
  if new.status is distinct from old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values ((select auth.uid()), 'payout.' || new.status, 'teacher_payouts', new.id::text,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'total', new.total, 'month', new.period_month));
  end if;
  return new;
end $$;
create trigger teacher_payouts_guard before update or delete on public.teacher_payouts
  for each row execute function public.guard_payout();

-- Works out draft payouts for one month from classes that used up a student's class. Approved and
-- paid payouts are left alone. Returns the number of payouts written.
create or replace function public.calculate_teacher_payouts(p_month date)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_from timestamptz := (v_month::timestamp at time zone public.school_tz());
  v_to timestamptz := ((v_month + interval '1 month')::timestamp at time zone public.school_tz());
  n int;
begin
  if not public.is_admin() then raise exception 'Only an administrator can calculate payouts'; end if;
  with work as (
    select r.teacher_id, r.basis, r.rate, r.currency,
           count(s.id)::int as classes,
           coalesce(sum(extract(epoch from s.ends_at - s.starts_at) / 60), 0)::int as minutes
    from public.teacher_rates r
    left join public.class_sessions s on s.teacher_id = r.teacher_id and s.counts_as_used
      and s.starts_at >= v_from and s.starts_at < v_to
    group by r.teacher_id, r.basis, r.rate, r.currency
  ), up as (
    insert into public.teacher_payouts (teacher_id, period_month, classes_count, minutes, basis, rate, currency, base_amount, calculated_at)
    select teacher_id, v_month, classes, minutes, basis, rate, currency,
           round(case basis when 'per_class' then classes * rate else minutes / 60.0 * rate end, 2), now()
    from work
    on conflict (teacher_id, period_month) do update set
      classes_count = excluded.classes_count, minutes = excluded.minutes, basis = excluded.basis, rate = excluded.rate,
      currency = excluded.currency, base_amount = excluded.base_amount, calculated_at = now()
    where public.teacher_payouts.status = 'draft'
    returning 1
  )
  select count(*) into n from up;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs: payment reminders (NOT-16), monthly statements, contract expiry.
-- The cron endpoint calls this after the Phase 4 generate_scheduled_notifications().
-- ---------------------------------------------------------------------------
create or replace function public.generate_billing_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_today date := public.school_today(); v_last_month date := (date_trunc('month', public.school_today()) - interval '1 month')::date;
begin
  -- Due within 3 days, once per invoice.
  for r in select * from public.invoices
           where status in ('unpaid', 'partially_paid') and due_date between v_today and v_today + 3 loop
    perform public.notify(r.student_id, 'payment_reminder', 'Payment due soon: ' || r.invoice_number,
      public.fmt_money(r.total - r.amount_paid, r.currency) || ' is due on ' || to_char(r.due_date, 'DD Mon YYYY') || '.',
      '/student/billing', 'inv_due:' || r.id);
    n := n + 1;
  end loop;

  -- Overdue: once a week until paid. Admins get one daily summary.
  for r in select * from public.invoices where status in ('unpaid', 'partially_paid') and due_date < v_today loop
    perform public.notify(r.student_id, 'payment_reminder', 'Payment overdue: ' || r.invoice_number,
      public.fmt_money(r.total - r.amount_paid, r.currency) || ' was due on ' || to_char(r.due_date, 'DD Mon YYYY') || '. Please contact the school office if you have already paid.',
      '/student/billing', 'inv_overdue:' || r.id || ':' || to_char(v_today, 'IYYY-IW'));
    n := n + 1;
  end loop;
  for r in select count(*) as cnt from public.invoices where status in ('unpaid', 'partially_paid') and due_date < v_today having count(*) > 0 loop
    perform public.notify_admins('payment_overdue', r.cnt || ' overdue invoice' || case when r.cnt > 1 then 's' else '' end,
      'Open Payments and billing to follow up.', '/admin/billing?status=overdue', 'overdue_digest:' || v_today);
  end loop;

  -- Last month's statement, once, for every student who had invoices or payments in it.
  for r in select distinct student_id from (
             select student_id from public.invoices where status <> 'void' and date_trunc('month', issue_date) = v_last_month
             union select student_id from public.payments where voided_at is null and date_trunc('month', paid_on) = v_last_month) x loop
    perform public.notify(r.student_id, 'statement_ready', 'Your statement for ' || to_char(v_last_month, 'FMMonth YYYY') || ' is ready',
      'See your invoices, payments and balance for the month.', '/student/billing?month=' || to_char(v_last_month, 'YYYY-MM'),
      'statement:' || to_char(v_last_month, 'YYYY-MM'));
    n := n + 1;
  end loop;

  -- Contracts past their end date.
  update public.contracts set status = 'expired' where status in ('sent', 'signed') and valid_to < v_today;
  return n;
end $$;
revoke execute on function public.generate_billing_notifications() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.class_packages        enable row level security;
alter table public.enrollments           enable row level security;
alter table public.attendance            enable row level security;
alter table public.contract_templates    enable row level security;
alter table public.contracts             enable row level security;
alter table public.contract_signatures   enable row level security;
alter table public.contract_sign_tokens  enable row level security;   -- no policies: server only
alter table public.invoices              enable row level security;
alter table public.invoice_items         enable row level security;
alter table public.payments              enable row level security;
alter table public.teacher_rates         enable row level security;
alter table public.teacher_payouts       enable row level security;

-- Packages: logged-in users see active packages; admins manage them.
create policy packages_select on public.class_packages for select to authenticated using (active or (select public.is_admin()));
create policy packages_admin on public.class_packages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Enrollments: the student and admins. Teachers use classes_left() instead (no prices).
create policy enrollments_select on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_admin()));
create policy enrollments_admin on public.enrollments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Attendance: whoever can see the class; the class's teacher and admins correct the mark.
-- Rows are created and removed only by the class-status trigger.
create policy attendance_select on public.attendance for select to authenticated
  using ((select public.is_admin()) or student_id = (select auth.uid()) or public.session_role(session_id) is not null);
create policy attendance_update on public.attendance for update to authenticated
  using ((select public.is_admin()) or public.session_role(session_id) = 'teacher')
  with check ((select public.is_admin()) or public.session_role(session_id) = 'teacher');

-- Contracts: admins manage; students read their own once sent. Teachers see none.
create policy templates_admin on public.contract_templates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy contracts_select on public.contracts for select to authenticated
  using ((select public.is_admin()) or (student_id = (select auth.uid()) and status <> 'draft'));
create policy contracts_admin on public.contracts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy signatures_select on public.contract_signatures for select to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.contracts c where c.id = contract_id and c.student_id = (select auth.uid())));

-- Billing: admins manage; students read their own. Teachers see none.
create policy invoices_select on public.invoices for select to authenticated
  using ((select public.is_admin()) or student_id = (select auth.uid()));
create policy invoices_admin_insert on public.invoices for insert to authenticated with check ((select public.is_admin()));
create policy invoices_admin_update on public.invoices for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy items_select on public.invoice_items for select to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.invoices i where i.id = invoice_id and i.student_id = (select auth.uid())));
create policy items_admin on public.invoice_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payments_select on public.payments for select to authenticated
  using ((select public.is_admin()) or student_id = (select auth.uid()));
create policy payments_admin_insert on public.payments for insert to authenticated with check ((select public.is_admin()));
create policy payments_admin_update on public.payments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Teacher pay: admins only (PAY-08), including the teacher themselves.
create policy rates_admin on public.teacher_rates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payouts_admin on public.teacher_payouts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Starter contract template (CON-01). Merge fields in {{double braces}} are filled when a
-- contract is created. Replace this text with a lawyer-reviewed version before real use.
-- ---------------------------------------------------------------------------
insert into public.contract_templates (version, title, body) values (1, 'Enrollment agreement', $tpl$## 1. Parties
This agreement is between {{school_name}} ("the School") and {{student_name}} ("the Student"). It is signed by {{signer_name}}.

## 2. Course and schedule
- Course: {{course_name}}
- Package: {{package_name}}, {{classes_total}} one-to-one online classes of {{class_minutes}} minutes each
- Frequency: {{classes_per_week}}, at times agreed with the School
- Valid from {{valid_from}} until {{valid_to}}

## 3. Tuition and payment
- Tuition: {{tuition}}
- Payment terms: {{payment_terms}}
- Classes not used by the end date are not refunded unless the School agrees in writing.

## 4. Attendance and cancellation
- A class the Student cancels less than {{late_cancel_hours}} hours before it starts counts as a used class.
- A class the Student does not attend counts as a used class.
- A class the teacher cannot attend does not count and will be rescheduled.

## 5. Responsibilities
The Student will join each class on time with a working device, internet connection, camera and microphone, and will complete homework set by the teacher.

The School will provide a qualified teacher, a record of each lesson, feedback on homework, and learning materials.

## 6. Policies and privacy
The class policies published in the student portal form part of this agreement. Personal information is handled as described in the School's privacy policy.

## 7. Electronic signature
By typing their name and confirming below, the signer agrees that this electronic signature has the same effect as a handwritten signature.

*Starter template: have it reviewed by a lawyer before using it with real students.*$tpl$);

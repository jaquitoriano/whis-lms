-- Change request T4 (Nov 2026): the lesson record becomes four large text boxes instead of
-- three sections of small fields:
--   previous_note  Previous Lesson (filled in from the last class's Next Lesson box)
--   today_note     Today's Lesson
--   next_note      Next Lesson
--   feedback_note  Teacher's Feedback (including vocabulary, grammar and pronunciation corrections)
-- The app offers each box a short template of labels. The "skills practised" checkboxes are
-- dropped. The old columns are kept, untouched, so the conversion can be checked or redone.

alter table public.lesson_records
  add column previous_note text not null default '' check (length(previous_note) <= 10000),
  add column today_note    text not null default '' check (length(today_note) <= 10000),
  add column next_note     text not null default '' check (length(next_note) <= 10000),
  add column feedback_note text not null default '' check (length(feedback_note) <= 10000);

-- True when a box holds nothing but its template: "Label:" lines with no text after them.
-- Same rule as isBlankNote() in src/lib/lesson-fields.ts.
create or replace function public.lesson_note_is_blank(p text)
returns boolean language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(p, ''), '^[ \t]*[^:\n]{1,40}:[ \t]*$', '', 'gn'), E' \t\r\n') = '';
$$;

-- "Label: text", or null when the text is blank.
create or replace function public.lesson_line(p_label text, p_value text)
returns text language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p_value, ''), E' \t\r\n') = '' then null
              else p_label || ': ' || btrim(p_value, E' \t\r\n') end;
$$;

-- Old lesson records: every non-empty field goes into the matching box, with its old label.
-- Converts only records whose four boxes are still empty, so it is safe to run again.
create or replace function public.convert_old_lesson_records()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.lesson_records l set
    previous_note = coalesce(concat_ws(E'\n',
      public.lesson_line('Summary', l.previous_summary),
      public.lesson_line('Topics discussed', l.previous_topics),
      public.lesson_line('Student''s performance', l.previous_performance),
      public.lesson_line('Areas that need improvement', l.previous_improve),
      public.lesson_line('Unfinished activities or tasks', l.previous_unfinished)), ''),
    today_note = coalesce(concat_ws(E'\n',
      public.lesson_line('Objectives', l.today_objectives),
      public.lesson_line('Topics covered', l.today_topics),
      public.lesson_line('Activities completed', l.today_activities),
      public.lesson_line('Vocabulary and grammar', l.today_vocab_grammar),
      case when cardinality(l.today_skills) > 0 then 'Skills practised: ' ||
        (select string_agg(initcap(x), ', ') from unnest(l.today_skills) x) end,
      public.lesson_line('Notes', l.today_notes)), ''),
    next_note = coalesce(public.lesson_line('Recommendations', l.feedback_next), ''),
    feedback_note = coalesce(concat_ws(E'\n',
      public.lesson_line('Overall performance', l.feedback_overall),
      public.lesson_line('Strengths', l.feedback_strengths),
      public.lesson_line('Areas for improvement', l.feedback_improve),
      public.lesson_line('Grammar and vocabulary corrections', l.feedback_corrections),
      public.lesson_line('Pronunciation and fluency', l.feedback_pronunciation)), '')
  where l.previous_note = '' and l.today_note = '' and l.next_note = '' and l.feedback_note = '';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.convert_old_lesson_records() from public, anon, authenticated;

-- updated_at must not move: it shows when the teacher last saved.
alter table public.lesson_records disable trigger lesson_records_touch;
select public.convert_old_lesson_records();
alter table public.lesson_records enable trigger lesson_records_touch;

-- Creates the record when the class page is first opened by its teacher or an admin, with
-- Previous Lesson filled in from the Next Lesson box of the student's last completed class.
-- While Previous Lesson is still blank, later opens fill it in (the earlier class's notes may be
-- written after this record was created).
create or replace function public.ensure_lesson_record(p_session uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  s public.class_sessions;
  prev_id uuid;
  prev_next text;
  cur public.lesson_records;
begin
  select * into s from public.class_sessions where id = p_session;
  if not found then raise exception 'Class not found'; end if;
  select * into cur from public.lesson_records where session_id = p_session;
  if found and not public.lesson_note_is_blank(cur.previous_note) then return; end if;

  select c.id, lr.next_note into prev_id, prev_next
  from public.class_sessions c left join public.lesson_records lr on lr.session_id = c.id
  where c.student_id = s.student_id and c.status = 'completed' and c.starts_at < s.starts_at
  order by c.starts_at desc limit 1;
  if public.lesson_note_is_blank(prev_next) then prev_next := ''; end if;

  if cur.session_id is null then
    insert into public.lesson_records (session_id, previous_session_id, previous_note, updated_by)
    values (p_session, prev_id, prev_next, (select auth.uid()))
    on conflict (session_id) do nothing;
  elsif prev_next <> '' then
    update public.lesson_records set previous_session_id = prev_id, previous_note = prev_next
    where session_id = p_session;
  end if;
end $$;

-- Admin teacher report: "classes without notes" means Today's Lesson and Teacher's Feedback are
-- both blank (Previous Lesson fills itself in).
create or replace function public.report_teachers(p_from date, p_to date default null)
returns table (
  teacher_id uuid, full_name text, status public.account_status, active_students int,
  completed int, hours_taught numeric, cancelled int, teacher_absent int, classes_without_notes int,
  homework_set int, reviews_sent int, avg_review_hours numeric, progress_reports int
) language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := public.school_tz(); v_start timestamptz; v_end timestamptz;
begin
  if not public.is_admin() then raise exception 'Reports are for administrators only'; end if;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (coalesce(p_to, public.school_today()) + 1)::timestamp at time zone v_tz;
  return query
  select p.id, p.full_name, p.status,
    (select count(*) from public.teacher_students ts where ts.teacher_id = p.id and ts.active)::int,
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end)::int,
    coalesce((select round(sum(extract(epoch from s.ends_at - s.starts_at) / 3600), 1) from public.class_sessions s
              where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end), 0),
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'cancelled' and s.cancel_requested_by is distinct from 'student'
       and s.starts_at >= v_start and s.starts_at < v_end)::int,
    (select count(*) from public.class_sessions s where s.teacher_id = p.id and s.status = 'teacher_absent' and s.starts_at >= v_start and s.starts_at < v_end)::int,
    (select count(*) from public.class_sessions s left join public.lesson_records l on l.session_id = s.id
       where s.teacher_id = p.id and s.status = 'completed' and s.starts_at >= v_start and s.starts_at < v_end
         and public.lesson_note_is_blank(l.today_note) and public.lesson_note_is_blank(l.feedback_note))::int,
    (select count(*) from public.homework_assignments a where a.teacher_id = p.id and a.created_at >= v_start and a.created_at < v_end)::int,
    (select count(*) from public.homework_reviews r where r.reviewer_id = p.id and r.sent_at >= v_start and r.sent_at < v_end)::int,
    (select round(avg(extract(epoch from r.sent_at - sb.submitted_at) / 3600)::numeric, 1)
       from public.homework_reviews r join public.homework_submissions sb on sb.id = r.submission_id
       where r.reviewer_id = p.id and r.sent_at >= v_start and r.sent_at < v_end),
    (select count(*) from public.progress_reports pr where pr.author_id = p.id and pr.status = 'published'
       and pr.published_at >= v_start and pr.published_at < v_end)::int
  from public.profiles p
  where p.role = 'teacher' and p.status <> 'inactive'
  order by p.full_name;
end $$;

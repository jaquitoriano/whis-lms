-- Local development seed. Every account's password is: Password123!
-- NEVER run this against production.

-- Test users (confirmed email logins). Role goes in app_metadata, which the
-- handle_new_user trigger reads to create the right profile rows.
with u(id, email, name, role) as (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'admin@school.test',    'Lorna Admin',  'admin'),
  ('00000000-0000-4000-a000-000000000011'::uuid, 'teacher1@school.test', 'Maria Santos', 'teacher'),
  ('00000000-0000-4000-a000-000000000012'::uuid, 'teacher2@school.test', 'James Carter', 'teacher'),
  ('00000000-0000-4000-a000-000000000021'::uuid, 'student1@school.test', 'Kenji Tanaka', 'student'),
  ('00000000-0000-4000-a000-000000000022'::uuid, 'student2@school.test', 'Ana Reyes',    'student'),
  ('00000000-0000-4000-a000-000000000023'::uuid, 'student3@school.test', 'Min-jun Park', 'student')
), ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
         extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
         jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', role),
         jsonb_build_object('full_name', name), now(), now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from ins;

insert into public.courses (id, name, type, description, default_duration_min, sort_order) values
  ('10000000-0000-4000-a000-000000000001', 'General English', 'general_english',
   'Everyday speaking, listening, grammar and vocabulary for all levels, from beginner to advanced.', 50, 1),
  ('10000000-0000-4000-a000-000000000002', 'IELTS Preparation', 'ielts',
   'Targeted practice for all four IELTS skills, with mock tests and band-score feedback.', 50, 2),
  ('10000000-0000-4000-a000-000000000003', 'Business English', 'business_english',
   'Meetings, presentations, emails and negotiation skills for professionals.', 50, 3);

update public.teacher_profiles set
  bio = 'IELTS specialist with a focus on Writing and Speaking. Former examiner trainer.',
  education = 'MA Applied Linguistics', qualifications = 'CELTA, DELTA Module 2',
  experience_years = 9, specializations = array['IELTS', 'General English'], show_on_website = true
where user_id = '00000000-0000-4000-a000-000000000011';

update public.teacher_profiles set
  bio = 'Business English coach who helps professionals speak confidently at work.',
  education = 'BA English Literature', qualifications = 'TESOL Certificate',
  experience_years = 6, specializations = array['Business English', 'General English'], show_on_website = true
where user_id = '00000000-0000-4000-a000-000000000012';

update public.profile_contacts set phone = '+63 917 000 0011' where user_id = '00000000-0000-4000-a000-000000000011';
update public.profile_contacts set phone = '+63 917 000 0012' where user_id = '00000000-0000-4000-a000-000000000012';

update public.student_profiles set class_level = 'B2', course_id = '10000000-0000-4000-a000-000000000002', enrollment_date = '2026-09-01'
where user_id = '00000000-0000-4000-a000-000000000021';
update public.student_profiles set class_level = 'B1', course_id = '10000000-0000-4000-a000-000000000003', enrollment_date = '2026-10-01'
where user_id = '00000000-0000-4000-a000-000000000022';
update public.student_profiles set class_level = 'A2', course_id = '10000000-0000-4000-a000-000000000001', enrollment_date = '2026-10-15',
  is_minor = true, birthday = '2012-05-20'
where user_id = '00000000-0000-4000-a000-000000000023';

update public.profiles set timezone = 'Asia/Tokyo' where id = '00000000-0000-4000-a000-000000000021';
update public.profiles set timezone = 'Asia/Seoul' where id = '00000000-0000-4000-a000-000000000023';

insert into public.guardians (student_id, full_name, relationship, email, phone) values
  ('00000000-0000-4000-a000-000000000023', 'Ji-woo Park', 'Mother', 'jiwoo.park@example.com', '+82 10 0000 0000');

-- Maria teaches Kenji and Min-jun; James teaches Ana.
insert into public.teacher_students (teacher_id, student_id) values
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021'),
  ('00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000023'),
  ('00000000-0000-4000-a000-000000000012', '00000000-0000-4000-a000-000000000022');


-- ---------------------------------------------------------------------------
-- Phase 2 sample data: availability, classes around today, lesson records.
-- Times are built in Asia/Manila wall-clock and stored as UTC.
-- ---------------------------------------------------------------------------
insert into public.teacher_availability (teacher_id, weekday, start_time, end_time)
select '00000000-0000-4000-a000-000000000011'::uuid, d, '09:00'::time, '18:00'::time from generate_series(1, 5) d
union all
select '00000000-0000-4000-a000-000000000012'::uuid, d, '13:00'::time, '21:00'::time from generate_series(1, 6) d;

insert into public.teacher_blackouts (teacher_id, starts_at, ends_at, reason) values
  ('00000000-0000-4000-a000-000000000011',
   ((date_trunc('day', now() at time zone 'Asia/Manila') + interval '10 days') at time zone 'Asia/Manila'),
   ((date_trunc('day', now() at time zone 'Asia/Manila') + interval '11 days') at time zone 'Asia/Manila'),
   'Training day');

with base as (select date_trunc('day', now() at time zone 'Asia/Manila') as d),
s(id, teacher, student, course, day_offset, hh, status) as (values
  ('20000000-0000-4000-a000-000000000001'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000021'::uuid, '10000000-0000-4000-a000-000000000002'::uuid, -7, 10, 'completed'),
  ('20000000-0000-4000-a000-000000000002'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000021'::uuid, '10000000-0000-4000-a000-000000000002'::uuid, -3, 10, 'completed'),
  ('20000000-0000-4000-a000-000000000003'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000021'::uuid, '10000000-0000-4000-a000-000000000002'::uuid,  1, 10, 'scheduled'),
  ('20000000-0000-4000-a000-000000000004'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000021'::uuid, '10000000-0000-4000-a000-000000000002'::uuid,  4, 10, 'scheduled'),
  ('20000000-0000-4000-a000-000000000005'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000023'::uuid, '10000000-0000-4000-a000-000000000001'::uuid,  0, 15, 'scheduled'),
  ('20000000-0000-4000-a000-000000000006'::uuid, '00000000-0000-4000-a000-000000000011'::uuid, '00000000-0000-4000-a000-000000000023'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, -2, 15, 'student_absent'),
  ('20000000-0000-4000-a000-000000000007'::uuid, '00000000-0000-4000-a000-000000000012'::uuid, '00000000-0000-4000-a000-000000000022'::uuid, '10000000-0000-4000-a000-000000000003'::uuid,  0, 18, 'scheduled'),
  ('20000000-0000-4000-a000-000000000008'::uuid, '00000000-0000-4000-a000-000000000012'::uuid, '00000000-0000-4000-a000-000000000022'::uuid, '10000000-0000-4000-a000-000000000003'::uuid,  2, 18, 'cancelled')
)
insert into public.class_sessions (id, teacher_id, student_id, course_id, starts_at, ends_at, status, meeting_url, created_by)
select s.id, s.teacher, s.student, s.course,
       ((base.d + make_interval(days => s.day_offset, hours => s.hh)) at time zone 'Asia/Manila'),
       ((base.d + make_interval(days => s.day_offset, hours => s.hh, mins => 50)) at time zone 'Asia/Manila'),
       s.status::public.session_status,
       'https://meet.google.com/abc-defg-hij',
       '00000000-0000-4000-a000-000000000001'
from s, base;

insert into public.lesson_records (session_id, today_objectives, today_topics, today_activities, today_vocab_grammar, today_skills,
  feedback_overall, feedback_strengths, feedback_improve, feedback_corrections, feedback_pronunciation, feedback_next, shared_with_student) values
  ('20000000-0000-4000-a000-000000000001', 'Plan and write an IELTS Task 2 opinion essay', 'Task 2 structure; thesis statements', 'Brainstormed ideas; wrote an introduction and one body paragraph', 'Linking words: however, moreover, consequently', array['writing','speaking'],
   'Good progress; ideas are clear', 'Clear position; good examples', 'Paragraph cohesion', '"peoples" -> "people"; "make a research" -> "do research"', 'Clear; work on word stress in "development"', 'Finish the essay and review conclusions', true),
  ('20000000-0000-4000-a000-000000000002', 'Write strong conclusions; Speaking Part 2 practice', 'Conclusions; cue-card strategy', 'Rewrote conclusion; two cue-card attempts', 'Hedging language: tend to, it could be argued', array['writing','speaking'],
   'Solid band 6.5 writing; speaking fluent but repetitive', 'Confident delivery', 'Range of vocabulary in Speaking', '"In conclusion, I am agree" -> "I agree"', 'Good intonation; final consonants sometimes dropped', 'Speaking Part 3 abstract questions; vocabulary for "environment"', true);

select public.ensure_lesson_record('20000000-0000-4000-a000-000000000003');

insert into public.materials (session_id, title, unit_chapter, pages, kind, url, uploaded_by) values
  ('20000000-0000-4000-a000-000000000003', 'Cambridge IELTS 18', 'Test 2, Speaking', 'pp. 54-56', 'link', 'https://www.cambridge.org/', '00000000-0000-4000-a000-000000000011');
insert into public.videos (session_id, youtube_id, title, description, added_by) values
  ('20000000-0000-4000-a000-000000000003', 'aqz-KE-bpKQ', 'Speaking Part 3: extending your answers', 'Watch before class and note three phrases.', '00000000-0000-4000-a000-000000000011');

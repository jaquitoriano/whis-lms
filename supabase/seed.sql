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

-- Phase 5: class packages and each student's current package. Inserted before the classes,
-- so the classes attach to them automatically.
insert into public.class_packages (id, course_id, name, classes_count, class_minutes, price, currency, validity_days, description, sort_order) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', 'IELTS 20 classes', 20, 50, 12000, 'PHP', 120, 'Two classes a week for about ten weeks.', 1),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'General English 10 classes', 10, 50, 5000, 'PHP', 90, 'Flexible schedule.', 2),
  ('30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000003', 'Business English 12 classes', 12, 50, 7800, 'PHP', 90, 'Three months, one class a week.', 3);

insert into public.enrollments (id, student_id, course_id, package_id, package_name, classes_total, class_minutes, classes_per_week, price, currency, starts_on, ends_on, created_by) values
  ('31000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', '10000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
   'IELTS 20 classes', 20, 50, 2, 12000, 'PHP', current_date - 30, current_date + 90, '00000000-0000-4000-a000-000000000001'),
  ('31000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000022', '10000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000003',
   'Business English 12 classes', 12, 50, 1, 7800, 'PHP', current_date - 20, current_date + 70, '00000000-0000-4000-a000-000000000001'),
  ('31000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000023', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
   'General English 10 classes', 10, 50, 2, 5000, 'PHP', current_date - 20, current_date + 70, '00000000-0000-4000-a000-000000000001');

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

-- ---------------------------------------------------------------------------
-- Phase 3 sample homework: one finished after a revision, one waiting for review,
-- one open, one overdue.
-- ---------------------------------------------------------------------------
select set_config('app.homework_workflow', 'on', false);

insert into public.homework_assignments (id, session_id, teacher_id, student_id, title, instructions, requirements, due_at, is_required, status) values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021',
   'Task 2 essay: remote work', E'Write an opinion essay:\n\n**Some people believe working from home is better than working in an office. To what extent do you agree?**\n\n- Plan for 5 minutes\n- Use at least three linking words from class', '250 words minimum, 40 minutes',
   now() - interval '5 days', true, 'completed'),
  ('30000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021',
   'Speaking Part 2 recording', E'Record yourself answering the cue card **"Describe a place you like to visit"**. Speak for 2 minutes.', 'Audio file or written notes',
   now() - interval '1 day', true, 'submitted'),
  ('30000000-0000-4000-a000-000000000003', '20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021',
   'Vocabulary: environment', E'Learn the 15 words on the worksheet and write one sentence for each.\n\nSee the reference link below.', '',
   now() + interval '3 days', true, 'assigned'),
  ('30000000-0000-4000-a000-000000000004', '20000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000023',
   'Past simple practice', E'Complete exercises 1–3 on page 24 of your workbook. You can take a photo of your answers.', '',
   now() - interval '1 day', true, 'assigned'),
  ('30000000-0000-4000-a000-000000000005', null, '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000023',
   'Optional: read a short story', E'Read any short story in English and tell me about it next class.', '',
   now() + interval '6 days', false, 'assigned');

insert into public.homework_submissions (id, assignment_id, version, answer_text, is_draft, submitted_at, is_late) values
  ('31000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 1,
   E'Nowadays many peoples work from home. I am agree that it is better because they save time.\n\nHowever, some people feel lonely.', false, now() - interval '6 days', false),
  ('31000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001', 2,
   E'Nowadays, many people work from home, and I largely agree that this is better.\n\nFirstly, they save time commuting. Moreover, they can focus without office noise. However, some people feel isolated, so a mix of both may be ideal.\n\nIn conclusion, working from home has clear advantages.', false, now() - interval '4 days', true),
  ('31000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000002', 1,
   E'My notes: I like to visit Kyoto. It is quiet, there are many temples, I go with my family every spring.', false, now() - interval '2 days', false);

insert into public.homework_reviews (submission_id, reviewer_id, comments, corrections, decision, sent_at) values
  ('31000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011',
   'Good start, but the essay is too short. Please develop each idea into a full paragraph.', E'"peoples" → "people"\n"I am agree" → "I agree"', 'needs_revision', now() - interval '5 days'),
  ('31000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000011',
   'Much better structure and good linking words. Band 6.5 level. Next time, add a specific example in each body paragraph.', '', 'completed', now() - interval '3 days');

insert into public.homework_files (assignment_id, kind, title, url, uploaded_by) values
  ('30000000-0000-4000-a000-000000000003', 'reference', 'Environment vocabulary list', 'https://dictionary.cambridge.org/', '00000000-0000-4000-a000-000000000011');

select set_config('app.homework_workflow', 'off', false);

-- ---------------------------------------------------------------------------
-- Phase 4 sample data: class policies v1 (Min-jun hasn't accepted yet), an announcement.
-- ---------------------------------------------------------------------------
insert into public.policies (version, title, summary, body, published_by) values (1, 'Class policies',
  'Attendance, lateness, cancellations, payments and homework.',
E'## Attendance\nPlease join every class on time using the link in your calendar. If you miss a class without notice it counts as attended.\n\n## Late arrival\nIf you are more than 15 minutes late, the class may be shortened or counted as a no-show. Classes still end at the scheduled time.\n\n## Cancelling or rescheduling\n- Give at least **24 hours'' notice** to cancel or move a class.\n- Late cancellations count as a used class.\n- If your teacher cancels, the class is rescheduled at no cost.\n\n## Payment\nPackages are paid in advance and are valid for the period stated in your contract.\n\n## Class duration\nStandard classes are 50 minutes.\n\n## Homework\nHomework is set after most classes. Please submit it before the deadline so your teacher can give feedback before the next class.\n\n## Other guidelines\nUse a quiet place with a stable internet connection, and keep your camera on during speaking practice.',
'00000000-0000-4000-a000-000000000001');

insert into public.policy_acceptances (version, user_id, accepted_at) values
  (1, '00000000-0000-4000-a000-000000000021', now() - interval '20 days'),
  (1, '00000000-0000-4000-a000-000000000022', now() - interval '10 days');

insert into public.announcements (id, title, body, audience, publish_at, notified_at, created_by) values
  ('40000000-0000-4000-a000-000000000001', 'Holiday schedule',
   E'The school office is closed on **30 November** and **25 December**. Classes on those days will be rescheduled by your teacher.',
   'everyone', now() - interval '1 day', now() - interval '1 day', '00000000-0000-4000-a000-000000000001');

-- Seeded data shouldn't email everyone on first run.
update public.notifications set email_status = 'skipped';

-- ---------------------------------------------------------------------------
-- Phase 5: contracts, invoices, payments, teacher rates
-- ---------------------------------------------------------------------------
insert into public.teacher_rates (teacher_id, basis, rate, currency) values
  ('00000000-0000-4000-a000-000000000011', 'per_class', 450, 'PHP'),
  ('00000000-0000-4000-a000-000000000012', 'per_hour', 500, 'PHP');

-- Kenji: waiting for his signature. Ana: signed. Min-jun (minor): sent to his mother.
insert into public.contracts (id, student_id, enrollment_id, template_version, title, body, tuition, currency, payment_terms,
  valid_from, valid_to, signer_kind, guardian_id, signer_name, signer_email, created_by)
select v.id, v.student, v.enrollment, 1, 'Enrollment agreement: ' || v.pkg,
       '## 1. Parties' || E'\n' || 'This agreement is between Bright Path English ("the School") and ' || v.student_name || ' ("the Student"). It is signed by ' || v.signer || '.' || E'\n\n' ||
       '## 2. Course and schedule' || E'\n' || '- Package: ' || v.pkg || E'\n' || '- Tuition: PHP ' || to_char(v.price, 'FM999,990.00') || E'\n\n' ||
       '## 3. Attendance and cancellation' || E'\n' || '- A class the Student cancels less than 24 hours before it starts counts as a used class.',
       v.price, 'PHP', 'Full payment within 7 days of the invoice date.', current_date - 30, current_date + 90,
       v.kind::public.signer_kind, v.guardian, v.signer, v.email, '00000000-0000-4000-a000-000000000001'
from (values
  ('40000000-0000-4000-a000-000000000001'::uuid, '00000000-0000-4000-a000-000000000021'::uuid, '31000000-0000-4000-a000-000000000001'::uuid,
   'IELTS 20 classes', 'Kenji Tanaka', 'Kenji Tanaka', 12000::numeric, 'self', null::uuid, 'student1@school.test'),
  ('40000000-0000-4000-a000-000000000002'::uuid, '00000000-0000-4000-a000-000000000022'::uuid, '31000000-0000-4000-a000-000000000002'::uuid,
   'Business English 12 classes', 'Ana Reyes', 'Ana Reyes', 7800::numeric, 'self', null::uuid, 'student2@school.test'),
  ('40000000-0000-4000-a000-000000000003'::uuid, '00000000-0000-4000-a000-000000000023'::uuid, '31000000-0000-4000-a000-000000000003'::uuid,
   'General English 10 classes', 'Min-jun Park', 'Ji-woo Park', 5000::numeric, 'guardian',
   (select id from public.guardians where student_id = '00000000-0000-4000-a000-000000000023' limit 1), 'jiwoo.park@example.com')
) as v(id, student, enrollment, pkg, student_name, signer, price, kind, guardian, email);

update public.contracts set status = 'sent';
insert into public.contract_signatures (contract_id, signer_name, signer_relationship, signed_by_user, consent, signed_at, ip, user_agent, document_hash)
select id, 'Ana Reyes', 'self', student_id, true, now() - interval '19 days', '127.0.0.1', 'seed', document_hash
from public.contracts where id = '40000000-0000-4000-a000-000000000002';
update public.contracts set status = 'signed' where id = '40000000-0000-4000-a000-000000000002';

-- Kenji: part paid and overdue. Ana: paid in full with a discount. Min-jun: due in two days.
insert into public.invoices (id, student_id, enrollment_id, issue_date, due_date, currency, notes, created_by) values
  ('50000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', '31000000-0000-4000-a000-000000000001', current_date - 30, current_date - 23, 'PHP', '', '00000000-0000-4000-a000-000000000001'),
  ('50000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000022', '31000000-0000-4000-a000-000000000002', current_date - 20, current_date - 13, 'PHP', 'Early sign-up discount applied.', '00000000-0000-4000-a000-000000000001'),
  ('50000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000023', '31000000-0000-4000-a000-000000000003', current_date - 5, current_date + 2, 'PHP', '', '00000000-0000-4000-a000-000000000001');
insert into public.invoice_items (invoice_id, position, description, quantity, unit_price) values
  ('50000000-0000-4000-a000-000000000001', 0, 'IELTS 20 classes (50 min)', 1, 12000),
  ('50000000-0000-4000-a000-000000000002', 0, 'Business English 12 classes (50 min)', 1, 7800),
  ('50000000-0000-4000-a000-000000000002', 1, 'Early sign-up discount', 1, -300),
  ('50000000-0000-4000-a000-000000000003', 0, 'General English 10 classes (50 min)', 1, 5000);
insert into public.payments (invoice_id, student_id, amount, method, reference, paid_on, recorded_by) values
  ('50000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', 6000, 'bank_transfer', 'BDO 88231', current_date - 28, '00000000-0000-4000-a000-000000000001'),
  ('50000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000022', 7500, 'gcash', 'GC 1093-2281', current_date - 19, '00000000-0000-4000-a000-000000000001');


-- ---------------------------------------------------------------------------
-- Phase 6 sample progress, IELTS results and messages. No new classes, so the Phase 5
-- package and pay numbers stay the same.
-- ---------------------------------------------------------------------------
-- Kenji (IELTS, Maria): two published monthly reports, B1+ -> B2.
insert into public.progress_reports (id, student_id, author_id, period_start, period_end, speaking, listening, reading, writing, grammar, vocabulary, pronunciation, fluency, overall,
  summary, strengths, next_goals, status, published_at) values
  ('60000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', '00000000-0000-4000-a000-000000000011', current_date - 68, current_date - 39,
   3.5, 4, 4, 3, 3.5, 3.5, 4, 3.5, 3.5,
   'Kenji has settled in well and works hard between classes. His reading and listening are already at B2; writing is the skill holding his band back.',
   'Reading for detail; clear pronunciation; always does his homework.',
   'Plan Task 2 essays before writing. Learn 10 topic words a week. Speak for the full 2 minutes in Part 2.',
   'published', now() - interval '38 days'),
  ('60000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000021', '00000000-0000-4000-a000-000000000011', current_date - 38, current_date - 8,
   4, 4.5, 4, 4, 3.5, 4, 4, 4, 4,
   'A strong month. Kenji''s essays now have a clear position and good linking, and his second mock test reached band 6.5.',
   'Essay structure; confident Speaking Part 2; much wider topic vocabulary.',
   'Accuracy with articles and agreement ("I agree", not "I am agree"). Speaking Part 3: give reasons and examples.',
   'published', now() - interval '7 days');

-- Ana (Business English, James): one report. Min-jun (Maria): a draft the student can't see yet.
insert into public.progress_reports (id, student_id, author_id, period_start, period_end, speaking, listening, reading, writing, grammar, vocabulary, pronunciation, fluency, overall,
  summary, strengths, next_goals, status, published_at) values
  ('60000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000022', '00000000-0000-4000-a000-000000000012', current_date - 30, current_date - 2,
   3, 3.5, 3.5, 3, 3, 3.5, 3.5, 3, 3,
   'Ana communicates clearly in meeting role-plays and is quick to use new phrases.',
   'Meeting language; listening to fast speech.',
   'Formal emails: openings, closings and polite requests.',
   'published', now() - interval '1 day'),
  ('60000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000023', '00000000-0000-4000-a000-000000000011', current_date - 20, current_date,
   2, 2, null, 1.5, 2, 2, null, 2, 2,
   'Min-jun is gaining confidence.', '', '',
   'draft', null);

-- Kenji's IELTS history: diagnostic 5.5, mocks 6.0 and 6.5, and a writing-only practice test.
insert into public.ielts_results (id, student_id, kind, module, test_date, listening, reading, writing, speaking, notes, recorded_by) values
  ('61000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', 'diagnostic', 'academic', current_date - 65, 5.5, 6, 5, 5.5, 'Placement test on enrolment.', '00000000-0000-4000-a000-000000000011'),
  ('61000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000021', 'mock', 'academic', current_date - 37, 6, 6, 5.5, 6, 'Cambridge IELTS 17, Test 1.', '00000000-0000-4000-a000-000000000011'),
  ('61000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000021', 'mock', 'academic', current_date - 9, 6.5, 6.5, 6, 6.5, 'Cambridge IELTS 18, Test 1. Task 2 was the weakest part.', '00000000-0000-4000-a000-000000000011'),
  ('61000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000021', 'mock', 'academic', current_date - 2, null, null, 6.5, null, 'Writing practice test only.', '00000000-0000-4000-a000-000000000011');
insert into public.ielts_goals (student_id, target_overall, exam_date, updated_by) values
  ('00000000-0000-4000-a000-000000000021', 7, current_date + 75, '00000000-0000-4000-a000-000000000011');

-- Maria and Kenji: a general conversation (Kenji has one unread message) and one about the next
-- class (Maria has one unread).
insert into public.message_threads (id, kind, teacher_id, student_id, session_id, created_by, created_at) values
  ('62000000-0000-4000-a000-000000000001', 'general', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', null, '00000000-0000-4000-a000-000000000011', now() - interval '3 days'),
  ('62000000-0000-4000-a000-000000000002', 'class', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-a000-000000000021', '20000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000021', now() - interval '3 hours');
insert into public.messages (thread_id, sender_id, body, created_at) values
  ('62000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', E'Hi Kenji, well done on the second version of your essay. The structure is much clearer now.', now() - interval '2 days 3 hours'),
  ('62000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000021', E'Thank you! Should I write another Task 2 essay this week?', now() - interval '2 days 1 hour'),
  ('62000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', E'Yes, one essay on the environment topic. Keep it under 40 minutes.', now() - interval '1 day'),
  ('62000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000021', E'Will we practise Speaking Part 3 in this class? I watched the video.', now() - interval '3 hours');

-- Change request T2 (Nov 2026): student contact details are admin-only.
-- Teachers keep everything needed to teach (name, photo, course, schedule, lessons,
-- homework, progress) but can no longer read a student's email, phone or guardians.
-- Students still see their own; the teacher-contact setting for students is unchanged.

drop policy contacts_select on public.profile_contacts;
create policy contacts_select on public.profile_contacts for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_admin()
  or (public.is_my_teacher(user_id) and public.setting_bool('students_can_view_teacher_contact'))
);

drop policy guardians_select on public.guardians;
create policy guardians_select on public.guardians for select to authenticated using (
  student_id = (select auth.uid()) or public.is_admin()
);

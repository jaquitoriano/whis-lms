-- Phase 4.5: speed. Indexes for the slowest measured queries, and access policies that check
-- "is this user an admin?" once per query instead of once per row.
-- The policy logic is unchanged: is_admin() takes no row data, so wrapping it in a subquery
-- gives the same answer for every row. tests/rls.test.mjs must still pass after any change here.

-- Admin dashboard: "past classes not closed".
create index class_sessions_open_past_idx on public.class_sessions(ends_at) where status = 'scheduled';
-- Class page: "this class was rescheduled, go to the new time".
create index class_sessions_rescheduled_from_idx on public.class_sessions(rescheduled_from_id) where rescheduled_from_id is not null;
-- Audit log and the dashboard's "recent changes": newest first.
create index audit_log_at_idx on public.audit_log(at desc);
-- Homework lists and counts by status, nearest deadline first.
create index homework_status_due_idx on public.homework_assignments(status, due_at);
-- The notification bell's unread count, on every portal page.
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

alter policy sessions_select on public.class_sessions using (
  teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or (select public.is_admin()) or public.teaches(student_id)
);
alter policy sessions_admin on public.class_sessions
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy hw_select on public.homework_assignments using (
  (select public.is_admin()) or teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or public.teaches(student_id)
);
alter policy hw_admin on public.homework_assignments
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy profiles_select on public.profiles using (
  id = (select auth.uid())
  or (select public.is_admin())
  or public.teaches(id)
  or public.is_my_teacher(id)
  or public.is_public_teacher(id)
);
alter policy profiles_admin_all on public.profiles
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy audit_log_admin_read on public.audit_log using ((select public.is_admin()));

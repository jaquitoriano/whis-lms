-- Runs the notifications job (/api/cron/notifications) every 15 minutes from the database, using
-- Supabase's built-in scheduler (pg_cron) and HTTP client (pg_net). Vercel's free plan only allows
-- one cron run a day, which delays emails and skips the 1-hour class reminder.
--
-- The address and the secret live in Supabase Vault, never in this file:
--   notifications_cron_url     e.g. https://whis-lms.vercel.app/api/cron/notifications
--   notifications_cron_secret  the same value as CRON_SECRET in Vercel
-- Until both exist, the job does nothing (so local databases never call the live site).
-- Set them in Studio → Project Settings → Vault, or in the SQL editor:
--   select vault.create_secret('https://…/api/cron/notifications', 'notifications_cron_url');
--   select vault.create_secret('<CRON_SECRET>', 'notifications_cron_secret');
-- Check runs with:  select * from cron.job_run_details order by start_time desc limit 10;
--   and replies:    select status_code, left(content, 200) from net._http_response order by created desc limit 10;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_notifications_job()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notifications_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notifications_cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.call_notifications_job() from public, anon, authenticated;

-- Same name again replaces the schedule, so this is safe to re-run.
select cron.schedule('notifications-every-15-min', '*/15 * * * *', 'select public.call_notifications_job()');

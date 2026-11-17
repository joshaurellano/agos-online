-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — flood_log auto-fill
--
-- Days nobody logged get filled in as "no flood" after a grace period so the
-- calendar has no gaps. Those rows are marked source = 'auto' and are NOT
-- ground truth. Only source = 'official' rows (logged or confirmed by a
-- person) should be used when scoring the forecast.
--
--   source  official  logged or confirmed by an official (default)
--           auto      filled by flood_log_autofill()
--
-- Saving a day from the web app always writes source = 'official', so
-- editing or confirming an auto day flips it.
--
-- The job starts at the first official entry, so nothing is filled before
-- logging began. Run the web app update after this migration is applied.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.flood_log add column if not exists source text not null default 'official';

alter table public.flood_log drop constraint if exists flood_log_source_check;
alter table public.flood_log add constraint flood_log_source_check
  check (source in ('official', 'auto'));

-- Fills every day from the first official entry up to (today - grace_days)
-- that has no row. Returns how many rows were added. Safe to run repeatedly.
create or replace function public.flood_log_autofill(grace_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  added integer;
begin
  with bounds as (
    select min(log_date) as first_day,
           ((now() at time zone 'Asia/Manila')::date - grace_days) as last_day
    from public.flood_log
    where source = 'official'
  ),
  ins as (
    insert into public.flood_log (log_date, flooded, logged_by, source)
    select g::date, false, 'AGOS auto', 'auto'
    from bounds,
         generate_series(bounds.first_day::timestamp, bounds.last_day::timestamp, interval '1 day') as g
    where bounds.first_day is not null
      and bounds.first_day <= bounds.last_day
    on conflict (log_date) do nothing
    returning 1
  )
  select count(*) into added from ins;

  return added;
end $$;

-- Only the scheduler (and the SQL editor) should run this.
revoke all on function public.flood_log_autofill(integer) from public, anon, authenticated;

-- Nightly at 00:10 Manila time (16:10 UTC), if pg_cron is enabled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'flood-log-autofill';
    perform cron.schedule('flood-log-autofill', '10 16 * * *', 'select public.flood_log_autofill(3)');
  end if;
end $$;

commit;

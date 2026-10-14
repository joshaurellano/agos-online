-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — flood_log (daily ground truth)
--
-- One row per calendar day. An official records whether a flood happened that
-- day (yes/no). A day with no row means "not logged", which is different from
-- "no flood".
--
-- Optional, flood days only:
--   height_level  approximate depth: ANKLE / KNEE / WAIST / CHEST
--   height_cm     approximate depth in centimeters
--
-- The old `flood_reports` table is left untouched (history stays readable),
-- but the web app no longer writes to it. Existing reports are copied in
-- below as flood days so the calendar isn't empty.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.flood_log (
  log_date      date primary key,
  flooded       boolean     not null,
  height_level  text,
  height_cm     numeric(5,1),
  note          text,
  logged_by     text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Clean up an earlier draft of this table that had a severity column.
alter table public.flood_log drop constraint if exists flood_log_flooded_severity_check;
alter table public.flood_log drop constraint if exists flood_log_severity_check;
alter table public.flood_log drop column if exists severity;

alter table public.flood_log add column if not exists height_level text;
alter table public.flood_log add column if not exists height_cm numeric(5,1);

alter table public.flood_log drop constraint if exists flood_log_height_level_check;
alter table public.flood_log add constraint flood_log_height_level_check
  check (height_level is null or height_level in ('ANKLE', 'KNEE', 'WAIST', 'CHEST'));

alter table public.flood_log drop constraint if exists flood_log_height_cm_check;
alter table public.flood_log add constraint flood_log_height_cm_check
  check (height_cm is null or (height_cm > 0 and height_cm <= 500));

-- Height only makes sense on a flood day.
alter table public.flood_log drop constraint if exists flood_log_height_only_if_flooded;
alter table public.flood_log add constraint flood_log_height_only_if_flooded
  check (flooded or (height_level is null and height_cm is null));

alter table public.flood_log drop constraint if exists flood_log_not_future;
alter table public.flood_log add constraint flood_log_not_future
  check (log_date <= (now() at time zone 'Asia/Manila')::date);

create or replace function public.flood_log_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists flood_log_touch on public.flood_log;
create trigger flood_log_touch before update on public.flood_log
  for each row execute function public.flood_log_touch();

-- Staff and admins can read, add and edit. Nobody else gets access.
alter table public.flood_log enable row level security;

drop policy if exists flood_log_staff_select on public.flood_log;
create policy flood_log_staff_select on public.flood_log
  for select to authenticated using (public.is_staff());

drop policy if exists flood_log_staff_insert on public.flood_log;
create policy flood_log_staff_insert on public.flood_log
  for insert to authenticated with check (public.is_staff());

drop policy if exists flood_log_staff_update on public.flood_log;
create policy flood_log_staff_update on public.flood_log
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Copy existing flood reports in as flood days. Reports filed as NORMAL
-- (no flood) are skipped.
insert into public.flood_log (log_date, flooded, note, logged_by)
select distinct on (r.date_occurred)
  r.date_occurred,
  true,
  nullif(left(coalesce(r.location, ''), 200), ''),
  coalesce(r.reported_by, 'Imported')
from public.flood_reports r
where r.severity in ('ADVISORY', 'WARNING', 'CRITICAL')
  and r.date_occurred is not null
  and r.date_occurred <= (now() at time zone 'Asia/Manila')::date
order by r.date_occurred
on conflict (log_date) do nothing;

commit;

-- Adds a `source` to forecast_snapshots so mock-mode (demo) snapshots written by
-- the dashboard are kept apart from the real ones written by poll-flood.
-- The outlook check compares each snapshot only against earlier snapshots of
-- the SAME source, and poll-flood's once-a-day save only looks at 'live' rows.

alter table public.forecast_snapshots
  add column if not exists source text not null default 'live';

alter table public.forecast_snapshots
  drop constraint if exists forecast_snapshots_source_check;
alter table public.forecast_snapshots
  add constraint forecast_snapshots_source_check check (source in ('live', 'mock'));

create index if not exists forecast_snapshots_source_created_idx
  on public.forecast_snapshots (source, created_at desc);

-- Only admins (the ones who can flip the Live/Mock toggle) may write, and only
-- mock rows. Live rows come exclusively from poll-flood via the service role.
drop policy if exists forecast_snapshots_admin_insert_mock on public.forecast_snapshots;
create policy forecast_snapshots_admin_insert_mock on public.forecast_snapshots
  for insert to authenticated
  with check (public.is_admin() and source = 'mock');

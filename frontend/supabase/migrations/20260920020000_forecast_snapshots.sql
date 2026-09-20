-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — forecast_snapshots
--
-- Same idea as flood_snapshots, but for the 3-day forecast window.
--   * poll-flood saves a row here (once a day) from the forecast it
--     already fetches from the model.
--   * check-forecast reads ONLY this table to decide on the OUTLOOK alert.
--     It never calls the model itself.
--
-- `checked` marks rows the outlook check has already looked at, so running the
-- check twice never sends the same alert twice.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.forecast_snapshots (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  days              jsonb       not null,   -- [{ "date": "...", "flood_probability": 0.12 }, ...] (next 3 days)
  worst_date        text,                   -- day with the highest probability in the window
  worst_probability numeric     not null,   -- that day's probability (0..1)
  checked           boolean     not null default false
);

create index if not exists forecast_snapshots_created_at_idx
  on public.forecast_snapshots (created_at desc);

-- Edge functions use the service role (bypasses RLS). Staff may read it in the
-- dashboard; nobody else gets access, and nobody writes from the client.
alter table public.forecast_snapshots enable row level security;

drop policy if exists forecast_snapshots_staff_select on public.forecast_snapshots;
create policy forecast_snapshots_staff_select on public.forecast_snapshots
  for select to authenticated using (public.is_staff());

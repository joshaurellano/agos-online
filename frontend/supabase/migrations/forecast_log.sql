-- Daily forecast log: one row per (day issued, day predicted, model).
-- Kept separate from forecast_snapshots / flood_snapshots, which exist for alert dedup.

create table if not exists public.forecast_log (
  id           bigint generated always as identity primary key,
  issued_date  date    not null,            -- Manila date the forecast was made
  target_date  date    not null,            -- day being predicted
  lead_days    int     not null,            -- target_date - issued_date
  model_key    text    not null default 'gru',
  probability  numeric not null,            -- 0..1
  alert_key    text,                        -- NORMAL | ADVISORY | WARNING | CRITICAL
  created_at   timestamptz not null default now(),
  unique (issued_date, target_date, model_key)
);

create index if not exists forecast_log_target_idx on public.forecast_log (target_date, lead_days);

alter table public.forecast_log enable row level security;

-- Signed-in users can read. Only the edge function (service role) writes.
drop policy if exists "forecast_log read" on public.forecast_log;
create policy "forecast_log read" on public.forecast_log
  for select to authenticated using (true);

-- Run the logger every day at 00:05 Manila (16:05 UTC).
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY>. Needs pg_cron and pg_net enabled.
-- select cron.schedule(
--   'log-forecast-daily', '5 16 * * *',
--   $$ select net.http_post(
--        url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/log-forecast',
--        headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
--        body    := '{}'::jsonb
--      ); $$
-- );

-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
--
-- Generic key/value table used by app.weather.supabase_store to hold:
--   - "weather_cache_fallback"       the last successful Open-Meteo response
--                                    (written only by scripts/refresh_weather.py)
--   - "pagasa_calibration_samples"   the rolling PAGASA calibration sample list
--
-- Using one small generic table (instead of a bespoke table per value) keeps
-- this to a single migration and mirrors the old Upstash "one key -> one
-- JSON blob" usage almost exactly, so the Python-side change stays small.

create table if not exists app_kv (
    key         text primary key,
    value       jsonb not null,
    updated_at  timestamptz not null default now()
);

-- Keep updated_at accurate on every upsert.
create or replace function app_kv_set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists app_kv_updated_at on app_kv;
create trigger app_kv_updated_at
    before update on app_kv
    for each row
    execute function app_kv_set_updated_at();

-- Row Level Security: locked down by default. The backend/refresh script
-- talks to this table using the service_role key, which bypasses RLS
-- entirely, so no policies are required for this project to work.
-- Enabling RLS here just means nothing can read/write this table through
-- the public anon key (e.g. from your React dashboard) unless you
-- explicitly add a policy for it later.
alter table app_kv enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — pagasa_bulletins
--
-- Latest PAGASA Tropical Cyclone Bulletin (TCB) per cyclone, written ONLY by
-- the `pagasa-bulletin` edge function (service role). The web app reads it.
--
-- naga_signal is the highest TCWS level whose area list mentions Naga City or
-- Camarines Sur, or NULL when the bulletin could not be read reliably
-- (parse_ok = false) or no signal covers the area (signals_found = true).
-- The UI must never show "no signal" unless parse_ok AND signals_found.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.pagasa_bulletins (
  id             bigint generated always as identity primary key,
  cyclone_name   text        not null,
  bulletin_no    integer     not null,
  pdf_url        text        not null,
  issued_at      timestamptz,
  category       text,
  max_winds_kph  integer,
  gust_kph       integer,
  pressure_hpa   integer,
  movement       text,
  center_lat     numeric(5,2),
  center_lon     numeric(6,2),
  track          jsonb       not null default '[]'::jsonb,   -- [{lat, lon}] forecast points
  signals        jsonb       not null default '{}'::jsonb,   -- {"1": "area text", ...}
  signals_found  boolean     not null default false,
  naga_signal    smallint check (naga_signal is null or naga_signal between 1 and 5),
  naga_match     text,                                       -- excerpt that matched
  naga_partial   boolean     not null default false,         -- only part of the area is covered
  parse_ok       boolean     not null default false,
  is_active      boolean     not null default true,
  fetched_at     timestamptz not null default now(),
  unique (cyclone_name, bulletin_no)
);

create index if not exists pagasa_bulletins_active_idx
  on public.pagasa_bulletins (is_active, fetched_at desc);

alter table public.pagasa_bulletins enable row level security;

-- Public information: anyone (including signed-out visitors) may read.
drop policy if exists pagasa_bulletins_read on public.pagasa_bulletins;
create policy pagasa_bulletins_read on public.pagasa_bulletins
  for select to anon, authenticated using (true);
-- No insert/update/delete policies: only the service role (edge function) writes.

commit;

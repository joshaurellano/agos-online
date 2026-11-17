-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — flood_log zones
--
-- Records WHICH zones of the barangay flooded on a flood day.
--
--   zones  smallint[]  ids of the zones (puroks) that flooded, e.g. {1,3}.
--                      The id-to-name list lives in the web app (ReportsPage).
--
-- An empty array on a flood day means "zone not recorded" (all rows logged
-- before this migration look like that). On a no-flood day it is always empty.
-- Zone ids 1 to 50 are accepted, so changing the number of zones in the
-- web app does not need another migration.
--
-- Existing RLS policies already cover the new column.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.flood_log add column if not exists zones smallint[] not null default '{}';

alter table public.flood_log drop constraint if exists flood_log_zones_valid;
alter table public.flood_log add constraint flood_log_zones_valid
  check (zones <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50}'::smallint[]);

-- Zones only make sense on a flood day.
alter table public.flood_log drop constraint if exists flood_log_zones_only_if_flooded;
alter table public.flood_log add constraint flood_log_zones_only_if_flooded
  check (flooded or cardinality(zones) = 0);

commit;

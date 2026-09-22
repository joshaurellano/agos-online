-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — residents can only file flood reports
--
-- The mobile app's "Report an Incident" form used to let residents choose
-- from Flood / Road Accident / Power Outage / Medical Emergency / Other.
-- The client now only ever sends 'Flood'; this migration brings the
-- database's CHECK constraint in line so the API can't be used to insert
-- anything else, and backfills any existing non-flood rows so the
-- constraint can actually be applied.
--
-- The constraint's exact name isn't known here (the `incident_reports`
-- table was created outside this migrations folder), so it's located by
-- introspection rather than guessed.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Legacy reports filed under a category that's going away are relabeled
-- as 'Flood' rather than deleted, so history/analytics aren't silently
-- dropped. Change this to a DELETE first if you'd rather remove them.
update public.incident_reports
set category = 'Flood'
where category is distinct from 'Flood';

do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel      on rel.oid = con.conrelid
  join pg_namespace nsp  on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'incident_reports'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%';

  if con_name is not null then
    execute format('alter table public.incident_reports drop constraint %I', con_name);
  end if;
end $$;

alter table public.incident_reports
  add constraint incident_reports_category_check check (category = 'Flood');

-- New rows no longer need to specify a category at all.
alter table public.incident_reports
  alter column category set default 'Flood';

commit;

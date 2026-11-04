-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — needs_assessments (post-flood immediate needs assessment)
--
-- One row per assessment filled in by barangay officials after a flood.
-- Follows DILG MC 2025-035, Annex D (Sample Barangay Immediate Needs
-- Assessment Form). The fixed header lives in columns; the answers live in
-- `data` (jsonb) so the form can change without a migration.
--
-- Staff and admins can read, add and edit. Only drafts can be deleted by
-- staff; admins can delete any row.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.needs_assessments (
  id                 uuid primary key default gen_random_uuid(),
  barangay           text        not null default 'Triangulo',
  assessed_on        date        not null,
  assessed_time      time,
  team_members       text[]      not null default '{}',
  status             text        not null default 'draft',
  data               jsonb       not null default '{}'::jsonb,
  prepared_by_name   text,
  prepared_by_position text,
  prepared_on        date,
  created_by         uuid        default auth.uid(),
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.needs_assessments drop constraint if exists needs_assessments_status_check;
alter table public.needs_assessments add constraint needs_assessments_status_check
  check (status in ('draft', 'final'));

alter table public.needs_assessments drop constraint if exists needs_assessments_not_future;
alter table public.needs_assessments add constraint needs_assessments_not_future
  check (assessed_on <= (now() at time zone 'Asia/Manila')::date);

alter table public.needs_assessments drop constraint if exists needs_assessments_data_object;
alter table public.needs_assessments add constraint needs_assessments_data_object
  check (jsonb_typeof(data) = 'object');

create index if not exists needs_assessments_assessed_on_idx
  on public.needs_assessments (assessed_on desc);

create or replace function public.needs_assessments_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists needs_assessments_touch on public.needs_assessments;
create trigger needs_assessments_touch before update on public.needs_assessments
  for each row execute function public.needs_assessments_touch();

alter table public.needs_assessments enable row level security;

drop policy if exists needs_assessments_staff_select on public.needs_assessments;
create policy needs_assessments_staff_select on public.needs_assessments
  for select to authenticated using (public.is_staff());

drop policy if exists needs_assessments_staff_insert on public.needs_assessments;
create policy needs_assessments_staff_insert on public.needs_assessments
  for insert to authenticated with check (public.is_staff());

drop policy if exists needs_assessments_staff_update on public.needs_assessments;
create policy needs_assessments_staff_update on public.needs_assessments
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists needs_assessments_staff_delete on public.needs_assessments;
create policy needs_assessments_staff_delete on public.needs_assessments
  for delete to authenticated
  using (public.is_admin() or (public.is_staff() and status = 'draft'));

commit;

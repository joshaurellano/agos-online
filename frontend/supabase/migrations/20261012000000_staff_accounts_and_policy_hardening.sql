-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS: staff account controls + tighter access rules
--
-- Run on the DEV project first and test, then on prod.
--
-- A. profiles.is_active, so an admin can disable a staff login. The
--    is_staff / is_admin / is_staff_account helpers now require it, so a
--    disabled account loses access immediately, not when its token expires.
--
-- B. Policies that let ANY signed-in user (residents sign up through the
--    mobile app) do staff-only things are replaced with staff-only ones:
--      alerts            insert  -> staff   (an insert fires SMS + push to everyone)
--      incident_reports  update / read-all / insert-as-anyone -> staff or owner
--      flood_reports     insert / update -> staff
--      flood_snapshots   insert  -> staff
--      alert_deliveries  read    -> staff
--    Postgres ORs permissive policies together, so the old "true" policies
--    had to be dropped, not just supplemented.
--
-- Not changed here (needs the mobile app code first): device_tokens, which
-- currently lets anyone read, overwrite and delete every push token.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── A. Disable staff accounts ──────────────────────────────────────────────

alter table public.profiles add column if not exists is_active boolean not null default true;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role_id <> 7 and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.role_id = p.role_id
    where p.id = auth.uid() and r.role_desc = 'Admin' and p.is_active
  );
$$;

create or replace function public.is_staff_account(uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role_id != 7 and is_active
  );
$$;

-- ── B. alerts: only staff can create one ───────────────────────────────────

drop policy if exists "alerts: insert" on public.alerts;
drop policy if exists "authenticated can insert" on public.alerts;
drop policy if exists "alerts: staff insert" on public.alerts;
create policy "alerts: staff insert" on public.alerts
  for insert to authenticated with check (public.is_staff());

-- ── incident_reports: residents file and see their own; staff review ──────
-- Kept as they are: "residents can insert own reports", "everyone can view
-- verified reports", "users can view own reports", "residents can delete own
-- pending reports".

drop policy if exists "incident_reports: insert own" on public.incident_reports;
drop policy if exists "incident_reports: read" on public.incident_reports;
drop policy if exists "incident_reports: update" on public.incident_reports;

drop policy if exists "staff can view all reports" on public.incident_reports;
create policy "staff can view all reports" on public.incident_reports
  for select to authenticated using (public.is_staff());

drop policy if exists "staff can update reports" on public.incident_reports;
create policy "staff can update reports" on public.incident_reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── flood_reports (legacy table): writes are staff only ───────────────────

drop policy if exists "Authenticated users can insert reports" on public.flood_reports;
drop policy if exists "Authenticated users can update their own reports" on public.flood_reports;
drop policy if exists "flood_reports: insert" on public.flood_reports;
drop policy if exists "flood_reports: update" on public.flood_reports;

drop policy if exists "flood_reports: staff insert" on public.flood_reports;
create policy "flood_reports: staff insert" on public.flood_reports
  for insert to authenticated with check (public.is_staff());

drop policy if exists "flood_reports: staff update" on public.flood_reports;
create policy "flood_reports: staff update" on public.flood_reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── flood_snapshots: the polling function uses the service role (bypasses
-- RLS); a signed-in staff dashboard also logs snapshots. Nobody else. ──────

drop policy if exists "Authenticated users can insert snapshots" on public.flood_snapshots;
drop policy if exists "flood_snapshots: insert" on public.flood_snapshots;
drop policy if exists "flood_snapshots: staff insert" on public.flood_snapshots;
create policy "flood_snapshots: staff insert" on public.flood_snapshots
  for insert to authenticated with check (public.is_staff());

-- ── alert_deliveries: delivery details are for staff ──────────────────────

drop policy if exists "Authenticated users can read alert deliveries" on public.alert_deliveries;
drop policy if exists "alert_deliveries: staff read" on public.alert_deliveries;
create policy "alert_deliveries: staff read" on public.alert_deliveries
  for select to authenticated using (public.is_staff());

commit;

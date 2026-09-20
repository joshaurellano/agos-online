-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — resident phone registry
--
-- Run once in the Supabase SQL editor (or keep it in supabase/migrations).
--
-- What this does
--   1. Extends the existing `residents` table (the account-free SMS list) with
--      status, consent and change-tracking columns. Existing rows stay ACTIVE,
--      so nobody currently receiving alerts is cut off.
--   2. Normalises phone numbers to 09XXXXXXXXX and rejects anything else.
--   3. Replaces ALL existing RLS policies on `residents` with:
--        read / add / edit  -> staff and admins (any non-resident role)
--        delete             -> admins only
--        everyone else (anon, mobile-app resident accounts) -> no access
--   4. Adds an admin-readable `audit_log` recording every add / edit / removal.
--
-- BEFORE running, check for numbers that would collide once normalised
-- (the migration aborts and rolls back if there are any):
--
--   select regexp_replace(regexp_replace(phone,'[\s\-()]','','g'),'^(\+63|63)','0') as p,
--          count(*)
--   from public.residents group by 1 having count(*) > 1;
--
-- Assumes the role table is public.roles(role_id, role_desc) and that
-- role_id 7 = resident (mobile-app) accounts, as in the web app.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. Role helpers ────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read `profiles` regardless of its own RLS.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role_id <> 7
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.role_id = p.role_id
    where p.id = auth.uid() and r.role_desc = 'Admin'
  );
$$;

revoke all on function public.is_staff(), public.is_admin() from public, anon;
grant execute on function public.is_staff(), public.is_admin() to authenticated;

-- ── 1. Phone normaliser ────────────────────────────────────────────────────
create or replace function public.normalize_ph_phone(raw text)
returns text language sql immutable as $$
  select case
    when c ~ '^\+639[0-9]{9}$' then '0' || substr(c, 4)
    when c ~ '^639[0-9]{9}$'   then '0' || substr(c, 3)
    when c ~ '^9[0-9]{9}$'     then '0' || c
    when c ~ '^09[0-9]{9}$'    then c
    else null
  end
  from (select regexp_replace(coalesce(raw, ''), '[\s\-()]', '', 'g') as c) s;
$$;

-- ── 2. Table + columns ─────────────────────────────────────────────────────
create table if not exists public.residents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null unique,
  network         text,
  sms_deliverable boolean not null default false,
  added_by        uuid,
  created_at      timestamptz not null default now()
);

alter table public.residents
  add column if not exists id              uuid not null default gen_random_uuid(),
  add column if not exists network         text,
  add column if not exists sms_deliverable boolean not null default false,
  add column if not exists added_by        uuid,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists status          text not null default 'active',
  add column if not exists consent_given   boolean not null default false,
  add column if not exists consent_at      timestamptz,
  add column if not exists updated_at      timestamptz,
  add column if not exists updated_by      uuid,
  add column if not exists deactivated_at  timestamptz,
  add column if not exists deactivated_by  uuid;

create unique index if not exists residents_id_key on public.residents (id);
create unique index if not exists residents_phone_key on public.residents (phone);
create index if not exists residents_status_idx on public.residents (status);

alter table public.residents drop constraint if exists residents_status_check;
alter table public.residents
  add constraint residents_status_check check (status in ('active', 'inactive'));

-- Normalise numbers already on file (only formats we recognise; anything
-- else is left alone and simply has to be fixed the next time it's edited).
update public.residents
   set phone = public.normalize_ph_phone(phone)
 where public.normalize_ph_phone(phone) is not null
   and phone <> public.normalize_ph_phone(phone);

-- ── 3. Audit log ───────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  action     text not null,
  table_name text not null,
  row_id     text,
  old_data   jsonb,
  new_data   jsonb
);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- No insert/update/delete policies: only the triggers below (SECURITY
-- DEFINER) can write, so the log can't be edited from the browser.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ── 4. Triggers ────────────────────────────────────────────────────────────
create or replace function public.residents_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  normalized text := public.normalize_ph_phone(new.phone);
begin
  if normalized is null then
    raise exception 'Phone number must be a valid PH mobile number (09XXXXXXXXX).'
      using errcode = '22023';
  end if;
  new.phone := normalized;

  new.name := btrim(coalesce(new.name, ''));
  if new.name = '' then
    raise exception 'Name is required.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.added_by := auth.uid(); end if;
    new.created_at := coalesce(new.created_at, now());
    new.consent_at := case when new.consent_given then now() else null end;
    new.updated_at := null;
    new.updated_by := null;
    if new.status = 'inactive' then
      new.deactivated_at := now();
      new.deactivated_by := auth.uid();
    else
      new.deactivated_at := null;
      new.deactivated_by := null;
    end if;
  else
    -- Provenance fields can never be rewritten from the client.
    new.added_by   := old.added_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.updated_by := auth.uid();

    if new.consent_given and not old.consent_given then
      new.consent_at := now();
    elsif new.consent_given then
      new.consent_at := old.consent_at;
    else
      new.consent_at := null;
    end if;

    if new.status = 'inactive' and old.status <> 'inactive' then
      new.deactivated_at := now();
      new.deactivated_by := auth.uid();
    elsif new.status = 'active' then
      new.deactivated_at := null;
      new.deactivated_by := null;
    else
      new.deactivated_at := old.deactivated_at;
      new.deactivated_by := old.deactivated_by;
    end if;
  end if;

  return new;
end $$;

create or replace function public.log_resident_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, table_name, row_id, new_data)
    values (auth.uid(), tg_op, tg_table_name, new.id::text, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor, action, table_name, row_id, old_data, new_data)
    values (auth.uid(), tg_op, tg_table_name, new.id::text, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (actor, action, table_name, row_id, old_data)
    values (auth.uid(), tg_op, tg_table_name, old.id::text, to_jsonb(old));
  end if;
  return null;
end $$;

drop trigger if exists residents_before_write on public.residents;
create trigger residents_before_write
  before insert or update on public.residents
  for each row execute function public.residents_before_write();

drop trigger if exists residents_audit on public.residents;
create trigger residents_audit
  after insert or update or delete on public.residents
  for each row execute function public.log_resident_change();

-- ── 5. Row-level security ──────────────────────────────────────────────────
alter table public.residents enable row level security;

-- Policies are OR-ed together, so any leftover permissive policy would undo
-- the rules below. Drop everything on this table and start clean.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'residents'
  loop
    execute format('drop policy %I on public.residents', p.policyname);
  end loop;
end $$;

create policy residents_staff_select on public.residents
  for select to authenticated using (public.is_staff());
create policy residents_staff_insert on public.residents
  for insert to authenticated with check (public.is_staff());
create policy residents_staff_update on public.residents
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy residents_admin_delete on public.residents
  for delete to authenticated using (public.is_admin());

revoke all on public.residents from anon;
grant select, insert, update, delete on public.residents to authenticated;

-- ── 6. OPTIONAL: keep existing mobile-app residents on the SMS list ────────
-- send-alert no longer texts numbers stored on resident-role (role 7)
-- profiles; SMS now goes only to this registry plus staff phones. If some
-- mobile-app residents were relying on the old behaviour and you want to
-- grandfather them WITHOUT an in-person check, uncomment and run:
--
-- insert into public.residents (name, phone)
-- select p.name, p.phone from public.profiles p
-- where p.role_id = 7 and p.phone is not null and p.phone <> ''
--   and public.normalize_ph_phone(p.phone) is not null
-- on conflict (phone) do nothing;

commit;

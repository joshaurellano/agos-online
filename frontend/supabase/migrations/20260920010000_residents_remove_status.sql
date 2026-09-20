-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS — drop the active/inactive status from the resident registry
--
-- Run AFTER 20260920000000_resident_registry.sql, and deploy the updated
-- send-alert function (it no longer filters on status) together with it.
--
-- Result: every row in `residents` receives SMS alerts. Removing someone
-- deletes the row; the audit log keeps a copy of what was deleted and who
-- deleted it. Officials (staff) can now delete, not only admins.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Safety check. Once `status` is gone, an inactive resident would silently
-- become a live recipient, so stop if any exist. Reactivate or delete them
-- first, then run this again.
do $$
declare n integer;
begin
  select count(*) into n from public.residents where status = 'inactive';
  if n > 0 then
    raise exception
      '% inactive resident(s) found. Reactivate or delete them first, otherwise they would start receiving SMS alerts.', n;
  end if;
end $$;

-- Trigger function without the status logic (replaced BEFORE the columns
-- are dropped, so it never references a missing column).
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
  end if;

  return new;
end $$;

-- Staff can remove residents (the audit trigger records every delete).
drop policy if exists residents_admin_delete on public.residents;
drop policy if exists residents_staff_delete on public.residents;
create policy residents_staff_delete on public.residents
  for delete to authenticated using (public.is_staff());

drop index if exists public.residents_status_idx;
alter table public.residents drop constraint if exists residents_status_check;
alter table public.residents
  drop column if exists status,
  drop column if exists deactivated_at,
  drop column if exists deactivated_by;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- AGOS: OTP check on the mobile number before a registration is saved
--
-- Run on the DEV project first and test, then on prod.
--
--   phone_otps   one row per code sent. Only the edge functions (service
--                role) can touch it: RLS is on and no policy exists.
--                Codes are stored as an HMAC, never in plain text.
--   trigger      a staff-side insert into `residents` is refused unless the
--                number was verified in the last 15 minutes. The check is
--                used up by the insert, so one code registers one number once.
--                Inserts with no signed-in user (SQL editor, imports) are
--                not affected.
--
-- create-user checks the same table itself (see that function).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.phone_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  purpose     text not null default 'resident',
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  verified_at timestamptz,
  consumed_at timestamptz
);

create index if not exists phone_otps_phone_created_idx
  on public.phone_otps (phone, created_at desc);

alter table public.phone_otps enable row level security;
revoke all on public.phone_otps from anon, authenticated;

-- ── residents: no insert without a verified number ─────────────────────────
-- Named so it fires after residents_before_write (triggers run in name
-- order), which means new.phone is already normalised to 09XXXXXXXXX here.
create or replace function public.residents_require_otp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  otp_id uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select id into otp_id
    from public.phone_otps
   where phone = new.phone
     and consumed_at is null
     and verified_at is not null
     and verified_at > now() - interval '15 minutes'
   order by verified_at desc
   limit 1
   for update;

  if otp_id is null then
    raise exception 'Verify the mobile number first.' using errcode = '22023';
  end if;

  update public.phone_otps set consumed_at = now() where id = otp_id;
  return new;
end $$;

drop trigger if exists residents_require_otp on public.residents;
create trigger residents_require_otp
  before insert on public.residents
  for each row execute function public.residents_require_otp();

commit;

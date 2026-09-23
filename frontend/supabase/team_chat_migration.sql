-- Team Coordination module (TeamChatPage.jsx) -- run this in the Supabase
-- SQL editor. Assumes the existing `profiles` table (id uuid references
-- auth.users, role_id int references roles) and `incident_reports` table
-- already used elsewhere in AGOS.

-- ── team_messages ────────────────────────────────────────────────────────
create table if not exists public.team_messages (
  id                  uuid primary key default gen_random_uuid(),
  sender_id           uuid not null references public.profiles(id) on delete cascade,
  message             text not null check (char_length(trim(message)) > 0),
  incident_report_id  uuid references public.incident_reports(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists team_messages_created_at_idx on public.team_messages (created_at);
create index if not exists team_messages_incident_idx on public.team_messages (incident_report_id);

alter table public.team_messages enable row level security;

-- Any authenticated, non-resident account can read the channel.
create policy "team_messages_select_staff" on public.team_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role_id != 7  -- RESIDENT_ROLE_ID, see lib/roles.js
    )
  );

-- ...and post to it, but only as themselves.
create policy "team_messages_insert_staff" on public.team_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role_id != 7
    )
  );

-- ── responder_status ─────────────────────────────────────────────────────
create table if not exists public.responder_status (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  status      text not null default 'off_duty' check (status in ('on_duty', 'deployed', 'off_duty')),
  updated_at  timestamptz not null default now()
);

alter table public.responder_status enable row level security;

create policy "responder_status_select_staff" on public.responder_status
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role_id != 7
    )
  );

-- Each responder can only set their own status.
create policy "responder_status_upsert_self" on public.responder_status
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "responder_status_update_self" on public.responder_status
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Realtime ─────────────────────────────────────────────────────────────
-- Matches the pattern already used for `alerts` / `incident_reports` so the
-- page's supabase.channel(...).on('postgres_changes', ...) subscriptions
-- actually receive events.
alter publication supabase_realtime add table public.team_messages;
alter publication supabase_realtime add table public.responder_status;

-- ── Fix: staff couldn't see each other's names ──────────────────────────
-- If your `profiles` table's existing RLS only lets a user read their OWN
-- row (a common default), the roster query in TeamChatPage and the
-- `sender:profiles(...)` join on team_messages will silently return only
-- the requester's own row -- which is what causes every other person's
-- name to show up as blank/"Unknown", and the status board to show only
-- yourself. This policy is additive (RLS policies for the same command are
-- OR'd together) -- it does not remove or replace whatever policy you
-- already have; it just adds one more case where a read is allowed:
-- any staff (non-resident) account may read the name/role of any OTHER
-- staff account. Resident profiles are still not exposed by this policy.
drop policy if exists "profiles_select_staff_directory" on public.profiles;
create policy "profiles_select_staff_directory" on public.profiles
  for select
  to authenticated
  using (
    role_id != 7  -- RESIDENT_ROLE_ID (lib/roles.js) -- the row being read is a staff account
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role_id != 7  -- the reader is staff too
    )
  );

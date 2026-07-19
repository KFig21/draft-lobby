-- ── Friends, lobby invites, and notifications ───────────────────────
-- All writes go through the Express server (service role), which enforces
-- who may befriend/invite whom. Clients read their own rows via RLS.

-- One row per relationship; the requester initiated it.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_distinct check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);
create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- A pending/accepted/declined invitation for a specific user to a lobby.
create table public.lobby_invites (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at timestamptz not null default now(),
  unique (lobby_id, invitee_id)
);
create index lobby_invites_invitee_idx on public.lobby_invites (invitee_id);

-- Recipient-facing feed. lobby_name is denormalized because an invitee is not
-- yet a lobby member and therefore can't read the lobby row under RLS.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'LOBBY_INVITE')),
  lobby_id uuid references public.lobbies (id) on delete cascade,
  lobby_name text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────
alter table public.friendships enable row level security;
alter table public.lobby_invites enable row level security;
alter table public.notifications enable row level security;

create policy "see own friendships" on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "see own invites" on public.lobby_invites
  for select to authenticated
  using (auth.uid() = invitee_id or auth.uid() = inviter_id);

create policy "read own notifications" on public.notifications
  for select to authenticated using (auth.uid() = user_id);
-- Recipients may mark their own notifications read.
create policy "update own notifications" on public.notifications
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.lobby_invites;

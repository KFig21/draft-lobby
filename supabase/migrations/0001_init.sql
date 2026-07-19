-- ── Profiles (extends auth.users) ───────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (username) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Players (the draftable pool) ────────────────────────────────────
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null check (position in ('QB','RB','WR','TE','K','DEF')),
  nfl_team text not null,
  bye_week int,
  injury_status text not null default 'ACTIVE'
    check (injury_status in ('ACTIVE','QUESTIONABLE','DOUBTFUL','OUT','IR','SUSPENDED')),
  proj_points numeric,
  adp numeric,
  prev_points numeric,
  prev_rank int
);

create index players_position_idx on public.players (position);
create index players_adp_idx on public.players (adp);

-- ── Lobbies ─────────────────────────────────────────────────────────
create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  commissioner_id uuid not null references public.profiles (id),
  password_hash text not null,
  settings jsonb not null,
  status text not null default 'SETUP'
    check (status in ('SETUP','SCHEDULED','DRAFTING','PAUSED','COMPLETE')),
  current_overall int not null default 1,
  pick_deadline timestamptz,
  created_at timestamptz not null default now()
);

create table public.lobby_members (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'MEMBER'
    check (role in ('COMMISSIONER','SUB_COMMISSIONER','MEMBER')),
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  draft_position int not null,
  color text not null default '#4aa8ff',
  is_prev_champion boolean not null default false,
  unique (lobby_id, draft_position)
);

-- ── Picks ───────────────────────────────────────────────────────────
create table public.picks (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  overall int not null,
  round int not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  is_keeper boolean not null default false,
  is_auto_pick boolean not null default false,
  picked_at timestamptz not null default now(),
  unique (lobby_id, overall),
  unique (lobby_id, player_id)
);

-- ── Chat ────────────────────────────────────────────────────────────
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index chat_messages_lobby_idx on public.chat_messages (lobby_id, created_at);

-- ── Row Level Security ──────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.teams enable row level security;
alter table public.picks enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles: anyone signed in can read; users update their own.
create policy "profiles are readable" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Players: readable by all signed-in users; writes only via service role.
create policy "players are readable" on public.players
  for select to authenticated using (true);

-- Membership helper used by the policies below.
create or replace function public.is_lobby_member(p_lobby_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.lobby_members
    where lobby_id = p_lobby_id and user_id = auth.uid()
  );
$$;

-- Lobby data: members can read. All writes go through the Express server
-- (service role), which enforces passwords, roles, and turn order.
create policy "members read lobby" on public.lobbies
  for select to authenticated using (public.is_lobby_member(id));
create policy "members read membership" on public.lobby_members
  for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "members read teams" on public.teams
  for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "members read picks" on public.picks
  for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "members read chat" on public.chat_messages
  for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "members send chat" on public.chat_messages
  for insert to authenticated
  with check (public.is_lobby_member(lobby_id) and user_id = auth.uid());

-- ── Realtime ────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.picks;
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.teams;

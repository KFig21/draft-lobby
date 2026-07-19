-- ── Activity feed + emoji reactions ─────────────────────────────────
-- The feed is served by the Express server (service role), which resolves
-- each viewer's friend list. RLS is enabled with no client policies on
-- activity_events (server-only). Reactions are readable by all authed users.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('DRAFT_COMPLETED', 'FRIEND_ACCEPTED', 'OPEN_LOBBY_CREATED')),
  lobby_id uuid references public.lobbies (id) on delete cascade,
  lobby_name text,
  subject_id uuid references public.profiles (id) on delete set null,
  subject_name text,
  created_at timestamptz not null default now()
);
create index activity_events_actor_idx on public.activity_events (actor_id, created_at desc);
create index activity_events_lobby_idx on public.activity_events (lobby_id);

create table public.activity_reactions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (activity_id, user_id, emoji)
);
create index activity_reactions_activity_idx on public.activity_reactions (activity_id);

alter table public.activity_events enable row level security;
alter table public.activity_reactions enable row level security;

-- Reaction counts are public to signed-in users; the feed endpoint also
-- returns them, but a direct read keeps optimistic UIs honest.
create policy "reactions readable" on public.activity_reactions
  for select to authenticated using (true);

-- Owner-choice keepers: the commissioner imports each team's prior-year roster
-- as a pool of *candidates* (keeper_options), and each team's owner picks which
-- of theirs to keep. A selection materializes into a normal is_keeper pick (the
-- same board slot the commissioner-assigned flow produces), so the draft engine
-- skips it identically. Commissioner-assigned keepers don't use this table.
create table public.keeper_options (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  -- The round this candidate would cost the team if kept.
  round int not null,
  -- Owner picked this one (mirrored by an is_keeper pick while true).
  selected boolean not null default false,
  -- Commissioner's fallback if the owner never chooses (applied at draft start).
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lobby_id, team_id, player_id)
);
create index keeper_options_lobby_idx on public.keeper_options (lobby_id);

-- How many keepers each team may select. Default 1; the commissioner can tune
-- it per team while offering the pool.
alter table public.teams add column keeper_count int not null default 1;

alter table public.keeper_options enable row level security;
create policy "members read keeper options" on public.keeper_options
  for select to authenticated using (public.is_lobby_member(lobby_id));

alter publication supabase_realtime add table public.keeper_options;

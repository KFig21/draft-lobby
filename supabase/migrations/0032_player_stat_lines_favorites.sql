-- Raw per-stat lines (both prior-season actuals and this season's projection)
-- so fantasy points can be computed from a lobby's own scoring rules instead
-- of trusting Sleeper's flat PPR total baked into proj_points/prev_points.
-- Keys are FOOTBALL_CATALOG stat category keys (shared/src/scoring.ts), e.g.
-- { "passingYards": 4102, "passingTd": 28, "reception": 0, ... }. Null for
-- anyone the importer has no raw stat line for (e.g. D/ST — Sleeper keys
-- those stats differently — falls back to proj_points/prev_points as-is).
alter table public.players
  add column proj_stats jsonb,
  add column prev_stats jsonb;

-- Per-user "favorite" players — a cheat-sheet bookmark that follows the user
-- across every draft, not scoped to any one lobby. Personal data managed
-- directly by the owner under RLS, same convention as scoring_formats /
-- league_templates — no server route needed.
create table public.favorite_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, player_id)
);

create index favorite_players_user_idx on public.favorite_players (user_id);

alter table public.favorite_players enable row level security;

create policy "own favorite players" on public.favorite_players
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

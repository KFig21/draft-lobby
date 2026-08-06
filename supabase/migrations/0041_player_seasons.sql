-- ── Season-scoped player data (player_seasons) — Phase 2 ────────────
-- See docs/phase2-player-seasons.md. Splits per-year player data out of the
-- flat players.* columns so re-importing next year never clobbers a past
-- draft's numbers. One row per (player, season) holds BOTH the projection made
-- FOR that season (proj_*) and that season's actuals (act_*). A draft for
-- season N reads season N (proj) + season N-1 (act). players stays the stable
-- identity table, so picks + favorite_players keep their ids forever.
--
-- Additive only: the flat players.{proj,prev}_* columns are LEFT IN PLACE and
-- still power the live read path until the read-path deploy switches over; a
-- later cleanup migration drops them once nothing reads them.

create table public.player_seasons (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  season        int  not null,

  -- season-specific bio + draft prep
  nfl_team      text,
  bye_week      int,
  injury_status text not null default 'ACTIVE',
  adp           numeric,

  -- projection made FOR this season
  proj_points    numeric,
  proj_rank      int,
  proj_stat_line text,
  proj_stats     jsonb,

  -- what the player ACTUALLY did this season (filled after the season)
  act_points     numeric,
  act_rank       int,
  act_stat_line  text,
  act_stats      jsonb,

  unique (player_id, season)
);

create index player_seasons_season_idx on public.player_seasons (season);

-- Same exposure as players: readable by any signed-in user, writes via service role.
alter table public.player_seasons enable row level security;
create policy "player seasons are readable" on public.player_seasons
  for select to authenticated using (true);

-- ── Backfill from the current flat columns ──────────────────────────
-- IMPORTANT: the data in players RIGHT NOW is the 2026 import — proj_* describe
-- 2026, prev_* describe 2025. These years are hardcoded on purpose: this is a
-- one-time backfill of that specific snapshot. Apply it BEFORE the 2027 import
-- runs (after which the flat columns would describe 2027/2026 instead).

-- 2026 season row: projection + current bio/adp
insert into public.player_seasons
  (player_id, season, nfl_team, bye_week, injury_status, adp,
   proj_points, proj_rank, proj_stat_line, proj_stats)
select id, 2026, nfl_team, bye_week, injury_status, adp,
       proj_points, proj_rank, proj_stat_line, proj_stats
from public.players
on conflict (player_id, season) do nothing;

-- 2025 season row: last year's actuals (bio left null — never stored per-season)
insert into public.player_seasons
  (player_id, season, act_points, act_rank, act_stat_line, act_stats)
select id, 2025, prev_points, prev_rank, prev_stat_line, prev_stats
from public.players
where prev_points is not null or prev_rank is not null
   or prev_stat_line is not null or prev_stats is not null
on conflict (player_id, season) do nothing;

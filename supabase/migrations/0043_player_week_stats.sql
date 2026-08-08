-- ── Week-by-week player stats (player_week_stats) ───────────────────
-- Per-player, per-week actuals for a completed season — the data behind the
-- "deep stats" modal (opened from the 🔍 next to LAST YEAR). One row per
-- (player, season, week) a player actually played; a missing week means DNP /
-- bye. Mirrors player_seasons: the RAW stat line is kept in `stats` (jsonb,
-- FOOTBALL_CATALOG keys) so the modal can score each week under ANY league's
-- rules (computeFantasyPoints) and rank a player within their position for a
-- week or a selected range — not just Sleeper's flat PPR.
--
-- Purely additive: no existing table changes. `position` is denormalized off
-- players so the modal can pull a whole position (season + position) in one
-- indexed query to compute positional ranks, without a join per row.
--
-- K rows carry pts_ppr/pos_rank_ppr only (Sleeper's kicking line doesn't map to
-- our catalog); D/ST is skipped entirely (Sleeper keys DST stats differently) —
-- same limitation the season importer already documents.

create table public.player_week_stats (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  -- Denormalized from players.position for the position-wide rank query.
  position      text not null,
  season        int  not null,
  week          int  not null,
  -- Opponent abbreviation (nullable — populated later from Sleeper's schedule).
  opp           text,
  -- Raw per-category line (FOOTBALL_CATALOG keys), null for K.
  stats         jsonb,
  -- Sleeper's own PPR total + positional PPR rank — the fallback for K and for
  -- anyone missing a mapped raw line.
  pts_ppr       numeric,
  pos_rank_ppr  int,

  unique (player_id, season, week)
);

-- The modal fetches one position for one season, then ranks client-side.
create index player_week_stats_season_pos_idx
  on public.player_week_stats (season, position);

-- Same exposure as players / player_seasons: readable by any signed-in user,
-- writes via the service-role importer only.
alter table public.player_week_stats enable row level security;
create policy "player week stats are readable" on public.player_week_stats
  for select to authenticated using (true);

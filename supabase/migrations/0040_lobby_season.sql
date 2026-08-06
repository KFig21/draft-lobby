-- ── Lobby season (fantasy year) ─────────────────────────────────────
-- Tags each draft with the fantasy season it's for. Drives the My Drafts
-- year badge + filter now (Phase 1), and will select which player_seasons
-- rows a board reads once season-scoped player data lands (Phase 2).
--
-- Backfill from created_at's year — the best signal we have retroactively.
-- New lobbies set season explicitly at creation (current year); the default
-- here is just a safety net so the column can never be null.
alter table public.lobbies add column season int;

update public.lobbies
  set season = extract(year from created_at)::int
  where season is null;

alter table public.lobbies alter column season set not null;
alter table public.lobbies alter column season set default extract(year from now())::int;

create index lobbies_season_idx on public.lobbies (season);

-- ── Distinguish real bye weeks from DNPs (player_week_stats.is_bye) ──────
-- Previously a week with no player_week_stats row meant "bye OR DNP" and the
-- deep-stats modal couldn't tell them apart — so a multi-week absence (injury,
-- benching) rendered as several fake "BYE" weeks, e.g. a player showing four
-- straight byes. A team has exactly one bye, derivable from its schedule.
--
-- The importer now synthesizes an explicit row for each player's real bye week
-- flagged is_bye (no stats/points). So: a row with is_bye = true is the bye, a
-- week with NO row at all is a genuine DNP, and a row with points is a game.
alter table public.player_week_stats
  add column is_bye boolean not null default false;

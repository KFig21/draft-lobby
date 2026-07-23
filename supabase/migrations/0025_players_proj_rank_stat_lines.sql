-- Supports the redesigned player stat block: a projected positional rank
-- (mirrors prev_rank, but for this season's projection) plus compact,
-- human-readable stat-line summaries for the projected/last-year totals.
alter table public.players
  add column proj_rank int,
  add column prev_stat_line text,
  add column proj_stat_line text;

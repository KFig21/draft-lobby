-- Lets the player-import script upsert instead of delete-then-reinsert.
-- Re-running the import (fresh ADP/stats/projections) must never generate a
-- new id for a player that's already been drafted somewhere — picks.player_id
-- has no cascade, so a changed id would silently orphan pick history.
alter table public.players
  add constraint players_name_position_key unique (name, position);

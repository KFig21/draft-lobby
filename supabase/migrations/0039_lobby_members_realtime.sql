-- ── lobby_members realtime ──────────────────────────────────────────

-- Publish lobby_members so member changes propagate live to open lobby views:
-- role changes (promote/demote a co-commissioner), joins, and kicks/leaves.
-- Joins already refresh via the teams change they also write, but role changes
-- touch only lobby_members, so without this they don't live-update. RLS still
-- applies to realtime, so subscribers only receive rows they can already read.
alter publication supabase_realtime add table public.lobby_members;

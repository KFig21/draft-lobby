-- ── Bots + auto-draft ───────────────────────────────────────────────

-- A team with no human owner that the draft engine picks for. Bots fill
-- open seats so a draft always has teamCount drafters (mock drafts, or a
-- seat for someone who isn't present).
alter table public.teams add column is_bot boolean not null default false;

-- When on, the server auto-picks for this team on a short (5s) clock. Set by
-- the team's owner, or by a commissioner for any team.
alter table public.teams add column auto_draft boolean not null default false;

-- Team changes (bot fill, order, auto-draft toggles) should propagate live.
alter publication supabase_realtime add table public.teams;

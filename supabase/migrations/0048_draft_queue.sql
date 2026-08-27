-- ── Draft-from-queue (auto-pick from a personal queue) ────────────────────
-- A per-team personal queue plus an opt-in "auto-draft from queue" toggle. When
-- the toggle is on and the team's clock times out (or the team is on auto-draft),
-- the server drafts the top still-available, roster-legal player from the queue
-- instead of the bot's valuation logic (see draftEngine.choosePlayer). Default
-- off, so nothing changes for anyone who doesn't opt in.
--
-- The queue lives in its own table (not a column on `teams`) so it stays PRIVATE:
-- `teams` is readable by every lobby member, which would leak a drafter's queue
-- to their opponents. This table has RLS enabled with NO policies, so only the
-- service role (the server's /queue routes, which authorize the caller) can read
-- or write it — no browser client can see anyone's queue, including its own
-- (the owner reads it back through the server).

create table public.draft_queues (
  team_id uuid primary key references public.teams (id) on delete cascade,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  -- Ordered list of player ids (top of the queue first).
  player_ids jsonb not null default '[]'::jsonb,
  autopick boolean not null default false,
  updated_at timestamptz not null default now()
);

create index draft_queues_lobby_idx on public.draft_queues (lobby_id);

-- Locked down: RLS on, no policies → service-role-only. Queues are private.
alter table public.draft_queues enable row level security;

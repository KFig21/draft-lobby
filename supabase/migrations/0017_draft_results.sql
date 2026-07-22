-- ── Post-draft results: crown vote (best roster) + peer grades ──────

-- One "best roster" vote per voter per lobby — always some other team's,
-- never your own (enforced server-side, not here, since checking "own team"
-- needs a join). Upsertable: re-voting just changes the target team.
create table public.draft_crown_votes (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lobby_id, voter_id)
);
create index draft_crown_votes_team_idx on public.draft_crown_votes (team_id);

-- One grade + short comment per (rater, team) pair — never your own team.
create table public.draft_grades (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  grade text not null,
  comment text not null check (char_length(comment) between 1 and 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lobby_id, rater_id, team_id)
);
create index draft_grades_team_idx on public.draft_grades (team_id);

alter table public.draft_crown_votes enable row level security;
alter table public.draft_grades enable row level security;

-- Reads happen straight off Supabase (like reactions/picks); all writes go
-- through the Express server, which enforces "not your own team" and the
-- post-draft voting window.
create policy "members read crown votes" on public.draft_crown_votes
  for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "members read grades" on public.draft_grades
  for select to authenticated using (public.is_lobby_member(lobby_id));

alter publication supabase_realtime add table public.draft_crown_votes;
alter publication supabase_realtime add table public.draft_grades;

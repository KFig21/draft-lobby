-- ── Peer-grade reactions: like/dislike a leaguemate's draft grade ──────
-- One reaction per (reactor, graded team, grade author): a leaguemate can
-- up- or down-vote each individual grade left on a roster. value is +1 (like)
-- or -1 (dislike); clearing a reaction deletes the row (enforced server-side).
create table public.draft_grade_reactions (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  grade_rater_id uuid not null references public.profiles (id) on delete cascade,
  reactor_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (lobby_id, team_id, grade_rater_id, reactor_id),
  -- A reaction always targets a real grade; drop it if that grade is removed.
  foreign key (lobby_id, grade_rater_id, team_id)
    references public.draft_grades (lobby_id, rater_id, team_id) on delete cascade
);
create index draft_grade_reactions_grade_idx
  on public.draft_grade_reactions (lobby_id, team_id, grade_rater_id);

alter table public.draft_grade_reactions enable row level security;

-- Reads happen straight off Supabase (like the grades themselves); all writes
-- go through the Express server, which enforces membership + the post-draft
-- window and "not your own grade".
create policy "members read grade reactions" on public.draft_grade_reactions
  for select to authenticated
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id));

alter publication supabase_realtime add table public.draft_grade_reactions;

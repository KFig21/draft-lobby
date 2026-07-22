-- ── Commissioner-controlled public visibility for completed drafts ──────
-- Two independent toggles: "results" (teams/picks/crown votes/grades) and
-- "chat" (chat messages + reactions, which also covers pick comments/
-- reactions — both live in chat_messages/chat_reactions already). A third,
-- results-dependent toggle lets non-members also cast a crown vote (never
-- grade — that stays members-only). Only ever takes effect once the draft
-- is COMPLETE — no live spectating of an in-progress draft.

alter table public.lobbies add column results_public boolean not null default false;
alter table public.lobbies add column chat_public boolean not null default false;
alter table public.lobbies add column public_voting_allowed boolean not null default false;

alter table public.lobbies add constraint lobbies_public_voting_needs_results_check
  check (not public_voting_allowed or results_public);

create or replace function public.lobby_results_public(p_lobby_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select results_public and status = 'COMPLETE' from public.lobbies where id = p_lobby_id),
    false
  )
$$;

create or replace function public.lobby_chat_public(p_lobby_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select chat_public and status = 'COMPLETE' from public.lobbies where id = p_lobby_id),
    false
  )
$$;

-- Either flag is enough to read basic lobby metadata / member profiles.
alter policy "members read lobby" on public.lobbies
  using (public.is_lobby_member(id) or public.lobby_results_public(id) or public.lobby_chat_public(id));
alter policy "members read membership" on public.lobby_members
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id) or public.lobby_chat_public(lobby_id));

-- Results bucket: who-picked-whom + crown votes/grades.
alter policy "members read teams" on public.teams
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id));
alter policy "members read picks" on public.picks
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id));
alter policy "members read crown votes" on public.draft_crown_votes
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id));
alter policy "members read grades" on public.draft_grades
  using (public.is_lobby_member(lobby_id) or public.lobby_results_public(lobby_id));

-- Chat bucket: messages (incl. pick comments) + reactions (incl. pick reactions).
alter policy "members read chat" on public.chat_messages
  using (public.is_lobby_member(lobby_id) or public.lobby_chat_public(lobby_id));
alter policy "members read chat reactions" on public.chat_reactions
  using (public.is_lobby_member(lobby_id) or public.lobby_chat_public(lobby_id));

-- ── Commissioner-controlled LIVE spectating ────────────────────────────
-- Unlike the completed-draft public visibility (migration 0020, which is hard
-- gated to status = 'COMPLETE'), spectating lets non-members watch a draft while
-- it's in progress. A master toggle (`spectate_public`) opens read access to the
-- board; two sub-toggles let spectators also write — react/comment
-- (`spectate_react`) and grade (`spectate_grade`) — each requiring the master.
-- Default off; commissioner opt-in on any lobby. Writes are still enforced
-- server-side (the endpoints check these flags); this migration only opens the
-- RLS *read* path so a spectator's board can load at all.

alter table public.lobbies add column spectate_public boolean not null default false;
alter table public.lobbies add column spectate_react boolean not null default false;
alter table public.lobbies add column spectate_grade boolean not null default false;

alter table public.lobbies add constraint lobbies_spectate_react_needs_public_check
  check (not spectate_react or spectate_public);
alter table public.lobbies add constraint lobbies_spectate_grade_needs_public_check
  check (not spectate_grade or spectate_public);

-- True whenever the lobby opts into spectating — NOT status-gated, so it works
-- while the draft is live (that's the whole point).
create or replace function public.lobby_spectate_public(p_lobby_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select spectate_public from public.lobbies where id = p_lobby_id),
    false
  )
$$;

-- Open the read path for spectators alongside members + the existing
-- completed-draft public buckets. The board's whole read surface: lobby
-- metadata, membership (for names/avatars), teams, picks, and the chat bucket
-- (pick comments + reactions) and results bucket (crown votes + grades) so a
-- spectator sees the full live board.
alter policy "members read lobby" on public.lobbies
  using (
    public.is_lobby_member(id)
    or public.lobby_results_public(id)
    or public.lobby_chat_public(id)
    or public.lobby_spectate_public(id)
  );
alter policy "members read membership" on public.lobby_members
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_results_public(lobby_id)
    or public.lobby_chat_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read teams" on public.teams
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_results_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read picks" on public.picks
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_results_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read crown votes" on public.draft_crown_votes
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_results_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read grades" on public.draft_grades
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_results_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read chat" on public.chat_messages
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_chat_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );
alter policy "members read chat reactions" on public.chat_reactions
  using (
    public.is_lobby_member(lobby_id)
    or public.lobby_chat_public(lobby_id)
    or public.lobby_spectate_public(lobby_id)
  );

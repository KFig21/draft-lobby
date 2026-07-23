-- Commissioner-toggleable lock: when on, only the commissioner can rename
-- teams (owners lose the ability to rename their own). Unlike the
-- public-visibility/chat-lock settings, this is meant to be flipped live
-- during the lobby (e.g. after someone renames their team to something
-- inappropriate), not just set once at creation.
alter table public.lobbies
  add column team_names_locked boolean not null default false;

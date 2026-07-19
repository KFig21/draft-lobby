-- Per-member archive flag so a user can hide a draft from their own lists
-- without affecting other members. Writes go through the Express server.
alter table public.lobby_members
  add column archived boolean not null default false;

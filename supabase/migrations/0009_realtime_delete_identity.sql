-- ── Make DELETE realtime events carry filterable columns ────────────
-- With the default replica identity, a DELETE only ships the primary key, so a
-- realtime subscription filtered on lobby_id never matches the delete (e.g. a
-- rolled-back pick or an un-reaction). REPLICA IDENTITY FULL includes the whole
-- old row, so those deletes propagate live instead of waiting for the next event.
alter table public.picks replica identity full;
alter table public.teams replica identity full;
alter table public.chat_reactions replica identity full;

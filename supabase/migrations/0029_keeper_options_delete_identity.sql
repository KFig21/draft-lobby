-- keeper_options deletes (removing an offered candidate) never reached
-- clients: with the default replica identity, a DELETE only ships the
-- primary key, so the lobby_id-filtered realtime subscription can't match
-- it (see 0009 for the same fix on picks/teams/chat_reactions).
alter table public.keeper_options replica identity full;

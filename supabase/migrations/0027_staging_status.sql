-- "Open draft room" flow: a new STAGING status sits between SETUP and
-- DRAFTING. The draft room is open and visible — people take their seats and
-- (once keepers ship) lock their keepers — but no pick clock is running yet.
-- The commissioner opens the room (SETUP → STAGING), then hits Start when
-- ready (STAGING → DRAFTING).
alter table public.lobbies drop constraint lobbies_status_check;
alter table public.lobbies add constraint lobbies_status_check
  check (status in ('SETUP', 'SCHEDULED', 'STAGING', 'DRAFTING', 'PAUSED', 'COMPLETE'));

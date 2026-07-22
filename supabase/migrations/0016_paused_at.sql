-- Tracks when the draft was paused, so the UI can show how long it's been
-- paused (a count-up timer in the paused banner).
alter table public.lobbies add column paused_at timestamptz;

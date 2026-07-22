-- Preserve the remaining pick-clock time across a pause/resume cycle instead
-- of always restarting with a fresh full clock on resume.
alter table public.lobbies add column pick_deadline_remaining_ms integer;

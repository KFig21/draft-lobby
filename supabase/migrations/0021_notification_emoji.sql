-- Reaction notifications (PICK_REACTION / MESSAGE_REACTION) should show
-- which emoji was used, not just who reacted.
alter table public.notifications
  add column emoji text;

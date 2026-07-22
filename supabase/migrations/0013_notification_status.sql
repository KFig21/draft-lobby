-- Track resolution of actionable notifications (FRIEND_REQUEST, LOBBY_INVITE)
-- so the client can hide Accept/Decline once handled, however it was handled
-- (from the notification itself or from another page like Friends).
alter table public.notifications
  add column status text check (status in ('ACCEPTED', 'DECLINED'));

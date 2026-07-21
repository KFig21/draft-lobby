-- Extend notifications for pick/message reactions and pick replies. New
-- notifications of the same type+target get grouped (count bumped) at write
-- time instead of piling up one row per reaction.
alter table public.notifications
  add column target_type text check (target_type in ('PICK', 'MESSAGE')),
  add column target_id uuid,
  add column count integer not null default 1,
  add column snippet text;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'LOBBY_INVITE',
    'PICK_REACTION', 'MESSAGE_REACTION', 'PICK_REPLY'
  ));

-- Fast "is there already an unread notification for this target" lookup,
-- used by the server to decide whether to group into an existing row.
create index notifications_group_idx
  on public.notifications (user_id, type, target_id)
  where read = false;

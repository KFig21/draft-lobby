-- Add MENTION as a notification type (@mentions in chat / pick comments).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'LOBBY_INVITE',
    'PICK_REACTION', 'MESSAGE_REACTION', 'PICK_REPLY', 'MENTION'
  ));

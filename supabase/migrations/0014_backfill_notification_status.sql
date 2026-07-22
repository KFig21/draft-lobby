-- Backfill notifications.status for rows created before that column existed
-- (migration 0013), using the current friendships/lobby_invites state so
-- already-resolved requests stop showing stale Accept/Decline actions.

-- FRIEND_REQUEST: a friendships row still exists (and is ACCEPTED) if the
-- request was accepted. Declines and later removals both delete the
-- friendships row, so there's no way to tell them apart in hindsight —
-- anything without a live PENDING/ACCEPTED relationship is treated as
-- DECLINED, which is enough to stop it being shown as actionable.
update public.notifications n
set status = 'ACCEPTED'
where n.type = 'FRIEND_REQUEST'
  and n.status is null
  and exists (
    select 1 from public.friendships f
    where f.requester_id = n.actor_id
      and f.addressee_id = n.user_id
      and f.status = 'ACCEPTED'
  );

update public.notifications n
set status = 'DECLINED'
where n.type = 'FRIEND_REQUEST'
  and n.status is null
  and not exists (
    select 1 from public.friendships f
    where f.requester_id = n.actor_id
      and f.addressee_id = n.user_id
      and f.status = 'PENDING'
  );

-- LOBBY_INVITE: lobby_invites rows are never deleted, so this is exact.
update public.notifications n
set status = li.status
from public.lobby_invites li
where n.type = 'LOBBY_INVITE'
  and n.status is null
  and li.lobby_id = n.lobby_id
  and li.invitee_id = n.user_id
  and li.status in ('ACCEPTED', 'DECLINED');

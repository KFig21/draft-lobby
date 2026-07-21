-- ── Pick comments: chat messages that reply to a specific pick ──────
-- Lets users comment on a pick from the board; the message shows in chat as
-- "replied to pick …". Null for ordinary chatter and system messages.
alter table public.chat_messages
  add column reply_to_pick_id uuid references public.picks (id) on delete set null;

create index chat_messages_reply_pick_idx
  on public.chat_messages (reply_to_pick_id);

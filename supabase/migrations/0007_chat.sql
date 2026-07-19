-- ── Draft-room chat: system messages, pick reactions, post-draft lock ──

-- When the draft finished (drives the 10-minute chat lock).
alter table public.lobbies add column completed_at timestamptz;

-- Distinguish user chatter from system alerts (pause/rollback/etc.).
alter table public.chat_messages
  add column kind text not null default 'USER' check (kind in ('USER', 'SYSTEM'));

-- Emoji reactions on either a chat message or a pick (polymorphic target).
create table public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  target_type text not null check (target_type in ('MESSAGE', 'PICK')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, emoji)
);
create index chat_reactions_lobby_idx on public.chat_reactions (lobby_id);
create index chat_reactions_target_idx on public.chat_reactions (target_type, target_id);

alter table public.chat_reactions enable row level security;
create policy "members read chat reactions" on public.chat_reactions
  for select to authenticated using (public.is_lobby_member(lobby_id));

alter publication supabase_realtime add table public.chat_reactions;

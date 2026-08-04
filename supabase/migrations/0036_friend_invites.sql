-- Shareable personal friend-invite links. One reusable token per user: they
-- share the URL however they like (text, chat), and whoever opens it can
-- connect with the inviter — signing up first if they don't have an account.
-- All writes go through the Express server (service role); the token is looked
-- up publicly (unauthenticated) so a not-yet-registered recipient can see who
-- invited them before signing up.
create table public.friend_invites (
  token uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  revoked boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- One active (non-revoked) token per inviter — "reset link" revokes the old
-- row and inserts a new one, so at most one live link exists at a time.
create unique index friend_invites_active_idx
  on public.friend_invites (inviter_id)
  where (revoked = false);

alter table public.friend_invites enable row level security;
-- No client policies: the server (service role) both mints and resolves these.
-- The public resolve path is a server endpoint, not a direct client read, so
-- an anonymous recipient never touches the table directly.

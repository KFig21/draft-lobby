-- ── Reserved seats ──────────────────────────────────────────────────

-- A seat held for a specific, not-yet-joined user. The commissioner reserves it
-- pre-draft (friends only) and positions it via the normal draft-order editor;
-- reserving also sends that user the lobby invite. owner_id stays null until the
-- user joins, at which point claimSeat hands them THIS exact seat (preserving
-- its draft position) ahead of bots/stand-ins/free slots. A reserved seat still
-- unclaimed at draft start converts to a bot (the no-show fallback).
--
-- on delete set null: if the reserved user's profile is deleted the seat just
-- becomes a plain ownerless placeholder (removable like a bot).
alter table public.teams
  add column reserved_for_user_id uuid references public.profiles (id) on delete set null;

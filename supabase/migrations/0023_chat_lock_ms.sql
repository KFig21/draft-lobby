-- Commissioner-configurable delay (ms) after the draft ends before chat and
-- reactions lock — one combined timer, set at lobby creation. Was a fixed
-- 24h; defaults to that same value for lobbies created before this column
-- existed. Bounded 0 (immediately) to 7 days.
alter table public.lobbies
  add column chat_lock_ms integer not null default 86400000
    check (chat_lock_ms >= 0 and chat_lock_ms <= 604800000);

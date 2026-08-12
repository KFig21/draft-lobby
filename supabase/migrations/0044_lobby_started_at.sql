-- ── Lobby started_at ────────────────────────────────────────────────
-- When the draft actually started (SETUP/STAGING → DRAFTING). Paired with the
-- existing completed_at to compute total draft duration for the "Draft
-- complete" chat message. Nullable — drafts that started before this column
-- existed (or haven't started yet) simply have no start time, and the
-- completion message then omits the elapsed note.
alter table public.lobbies add column started_at timestamptz;

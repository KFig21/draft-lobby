-- ── Stand-in seats ──────────────────────────────────────────────────

-- A seat with no human owner that the COMMISSIONER drafts for — an in-person
-- drafter who can't or won't sign up (or several of them). Unlike a bot it's
-- human-like on the clock: it gets the round's normal pick clock, is skipped
-- when skips are on (so the commissioner can come back and pick for it), and
-- only AI-auto-picks as the same timeout safety net a human seat has (skips
-- off, or the skip allowance exhausted). No engine branch is needed for any of
-- that — a stand-in is simply is_bot=false / auto_draft=false, so it already
-- flows through the human timeout path.
--
-- This flag exists so the rest of the app can tell a stand-in apart from a
-- real (owned) team and from a plain bot: it drives the "Stand-in" chip + the
-- remove control, and marks the seat as intentionally reserved (bot-fill only
-- fills empty draft positions, and seat-claim only takes over is_bot seats, so
-- both already leave a stand-in alone).
alter table public.teams add column is_standin boolean not null default false;

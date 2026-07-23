-- DRAFT_GRADE notifications should carry the letter grade separately from
-- the comment, so the client can render it as its own colored badge.
alter table public.notifications
  add column grade text;

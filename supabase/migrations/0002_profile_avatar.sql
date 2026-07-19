-- Store the generative avatar (emoji + bgColor + shape) on the profile.
-- Nullable: the client renders a deterministic default from the user id when null.
alter table public.profiles
  add column avatar jsonb;

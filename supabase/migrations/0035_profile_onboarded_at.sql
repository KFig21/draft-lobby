-- Marks when a user finished the first-run onboarding flow (mandatory profile
-- setup + optional guided tour). Null = not yet onboarded, so the app routes
-- them to /welcome. Existing accounts are backfilled to now() so the tour
-- never retroactively pops up for people who are already using the app.
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

update public.profiles set onboarded_at = now() where onboarded_at is null;

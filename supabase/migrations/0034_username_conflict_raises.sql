-- The original handle_new_user() used `on conflict (username) do nothing`,
-- which meant a signup with an already-taken username created an auth.users
-- row but NO profile row — leaving a logged-in account with no profile, which
-- breaks the app and has no recovery path.
--
-- Because this trigger runs in the same transaction as the auth.users insert,
-- raising here aborts the whole signup, so the user gets a clean "username
-- taken" failure instead of a broken account. The username's UNIQUE constraint
-- is the real gate; the client also checks availability live before submitting,
-- so hitting this path is the rare race, not the common case.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  desired text := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );
begin
  if exists (select 1 from public.profiles where lower(username) = lower(desired)) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;

  insert into public.profiles (id, username)
  values (new.id, desired);

  return new;
end;
$$;

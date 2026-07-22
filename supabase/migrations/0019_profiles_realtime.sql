-- profiles was never added to the realtime publication, so avatar/username
-- edits never propagated to already-loaded lobby member lists, friend lists,
-- etc. — they only picked up the change on a fresh fetch (e.g. page reload).
alter publication supabase_realtime add table public.profiles;

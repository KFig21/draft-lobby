-- ── Shareable rulesets / league setups ──────────────────────────────
-- A shared_rulesets row is an immutable snapshot of either a scoring format
-- (kind 'SCORING', payload = ScoringRules) or a full league setup (kind
-- 'LEAGUE', payload = LobbySettings). Its id doubles as the share token in a
-- /import/ruleset/<id> link. Importing copies the snapshot into the importer's
-- own scoring_formats / league_templates — the snapshot itself is never edited.
create table public.shared_rulesets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('SCORING', 'LEAGUE')),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index shared_rulesets_owner_idx on public.shared_rulesets (owner_id);

alter table public.shared_rulesets enable row level security;

-- Anyone signed in can read a shared ruleset: the id is the share token
-- (a random, effectively unguessable uuid) and these are meant to be shared,
-- so a link recipient can preview + import it even if they aren't friends.
create policy "read shared rulesets" on public.shared_rulesets
  for select to authenticated using (true);

-- Owners manage their own shares (creating a link, cleaning up old ones).
create policy "manage own shared rulesets" on public.shared_rulesets
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── Send-to-friend notification ─────────────────────────────────────
-- A RULESET_SHARE notification points at the shared_rulesets row to import;
-- the ruleset's name rides along in the existing `snippet` column.
alter table public.notifications
  add column shared_ruleset_id uuid references public.shared_rulesets (id) on delete cascade;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'LOBBY_INVITE',
    'PICK_REACTION', 'MESSAGE_REACTION', 'PICK_REPLY', 'MENTION', 'DRAFT_GRADE',
    'RULESET_SHARE'
  ));

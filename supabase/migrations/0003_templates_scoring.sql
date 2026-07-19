-- Reusable, per-user league templates and scoring formats (surfaced in Settings
-- and loaded in the lobby wizard). These are personal data, managed directly by
-- the owner under RLS — no server routes needed.

create table public.scoring_formats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  rules jsonb not null,
  created_at timestamptz not null default now()
);

create table public.league_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- A LobbySettings-shaped config (teams, roster, timers, scoring, …).
  settings jsonb not null,
  created_at timestamptz not null default now()
);

create index scoring_formats_user_idx on public.scoring_formats (user_id);
create index league_templates_user_idx on public.league_templates (user_id);

alter table public.scoring_formats enable row level security;
alter table public.league_templates enable row level security;

-- Owners fully manage their own rows; nobody else can see them.
create policy "own scoring formats" on public.scoring_formats
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own league templates" on public.league_templates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
